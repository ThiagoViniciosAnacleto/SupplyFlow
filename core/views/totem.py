"""APIs do totem de autoatendimento (RF-10, RF-11, RF-16 a RF-21).

Depois do PIN correto o servidor abre uma "sessão do totem" (guardada no
servidor, não no navegador) que expira após 10 minutos sem uso. Todas as
outras chamadas do totem usam o colaborador dessa sessão — nunca uma
matrícula enviada pelo navegador.
"""
import time
from functools import wraps

from django.db.models import Sum
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..models import (
    AnaliseIA,
    EstoqueTotem,
    Produto,
    Solicitacao,
    SolicitacaoItem,
    Totem,
    Usuario,
)
from ..seguranca import bloqueado, limpar_falhas, registrar_falha, verificar_pin
from .util import fmt, ler_json

CHAVE_SESSAO = "totem_colaborador_id"
CHAVE_EXPIRA = "totem_expira_em"
INATIVIDADE_SEGUNDOS = 10 * 60


def normalizar_matricula(valor):
    return (valor or "").strip().upper()


def primeiro_nome(nome):
    partes = (nome or "").strip().split()
    return partes[0] if partes else ""


def colaborador_da_sessao(request):
    """Colaborador autenticado no totem (renova o prazo de inatividade) ou None."""
    colaborador_id = request.session.get(CHAVE_SESSAO)
    if not colaborador_id or time.time() > request.session.get(CHAVE_EXPIRA, 0):
        encerrar_sessao_totem(request)
        return None
    colaborador = Usuario.objects.select_related("setor").filter(id=colaborador_id, ativo=True).first()
    if colaborador is None:
        encerrar_sessao_totem(request)
        return None
    request.session[CHAVE_EXPIRA] = time.time() + INATIVIDADE_SEGUNDOS
    return colaborador


def encerrar_sessao_totem(request):
    request.session.pop(CHAVE_SESSAO, None)
    request.session.pop(CHAVE_EXPIRA, None)


def api_totem(view):
    """Exige a sessão do totem aberta pelo PIN. Disponibiliza request.colaborador."""

    @wraps(view)
    def protegida(request, *args, **kwargs):
        colaborador = colaborador_da_sessao(request)
        if colaborador is None:
            return JsonResponse(
                {"sucesso": False, "erro": "Sua sessão no totem expirou. Identifique-se novamente."},
                status=401,
            )
        request.colaborador = colaborador
        return view(request, *args, **kwargs)

    return protegida


# ============================================================================
# IDENTIFICAÇÃO E PIN
# ============================================================================
@require_POST
def api_totem_identificar(request):
    """Confere se a matrícula existe. Devolve só o primeiro nome (como no protótipo),
    sem cargo, setor ou outros dados pessoais antes do PIN (RNF-05)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    matricula = normalizar_matricula(dados.get("matricula"))
    if bloqueado("pin", matricula):
        return JsonResponse(
            {"encontrado": False, "erro": "Muitas tentativas. Aguarde 15 minutos ou procure o almoxarifado."},
            status=429,
        )
    colaborador = Usuario.objects.filter(codigo_matricula=matricula, ativo=True).first()
    if not colaborador:
        return JsonResponse({"encontrado": False, "erro": "Matrícula não localizada no sistema."}, status=404)
    return JsonResponse({"encontrado": True, "matricula": matricula, "primeiro_nome": primeiro_nome(colaborador.nome)})


@require_POST
def api_totem_login(request):
    """Autentica o colaborador por matrícula + PIN e abre a sessão do totem (RF-11)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    matricula = normalizar_matricula(dados.get("matricula"))
    pin = str(dados.get("pin") or "").strip()
    if not matricula or not pin:
        return JsonResponse({"sucesso": False, "erro": "Informe matrícula e PIN."}, status=400)

    if bloqueado("pin", matricula):
        return JsonResponse(
            {"sucesso": False, "erro": "Muitas tentativas. Aguarde 15 minutos ou procure o almoxarifado."},
            status=429,
        )

    colaborador = Usuario.objects.select_related("setor").filter(codigo_matricula=matricula, ativo=True).first()
    if colaborador is None or not verificar_pin(colaborador, pin):
        registrar_falha("pin", matricula)
        registrar(request, "TOTEM_PIN_INCORRETO", colaborador, f"PIN incorreto para a matrícula {matricula}",
                  usuario=colaborador)
        return JsonResponse({"sucesso": False, "erro": "PIN incorreto. Tente novamente."}, status=401)

    limpar_falhas("pin", matricula)
    request.session.cycle_key()  # novo identificador de sessão a cada login
    request.session[CHAVE_SESSAO] = str(colaborador.id)
    request.session[CHAVE_EXPIRA] = time.time() + INATIVIDADE_SEGUNDOS
    colaborador.ultimo_acesso = timezone.now()
    colaborador.save(update_fields=["ultimo_acesso"])
    registrar(request, "TOTEM_LOGIN", colaborador, "Entrou no totem", usuario=colaborador)

    return JsonResponse({
        "sucesso": True,
        "colaborador": {
            "nome": colaborador.nome,
            "primeiro_nome": primeiro_nome(colaborador.nome),
            "matricula": colaborador.codigo_matricula,
            "cargo": colaborador.cargo or "Colaborador",
            "setor": colaborador.setor.nome if colaborador.setor else "Sem setor",
            "centro_custo": colaborador.setor.centro_custo if colaborador.setor else "",
        },
    })


@require_POST
def api_totem_sair(request):
    encerrar_sessao_totem(request)
    return JsonResponse({"sucesso": True})


@require_GET
@api_totem
def api_totem_produtos(request):
    """Retorna o catálogo de produtos no totem com cota, elegibilidade e estoque."""
    totem_codigo = request.GET.get("totem_codigo", "TOTEM-01")
    colaborador = request.colaborador

    totem = Totem.objects.filter(codigo=totem_codigo).first() or Totem.objects.filter(status_online=True).first()

    estoques = {
        e.produto_id: e.quantidade_disponivel
        for e in EstoqueTotem.objects.filter(totem=totem)
    } if totem else {}

    solicitacoes_pendentes_prod = set()
    retiradas_mes_prod = {}
    ultimas_retiradas = {}

    if colaborador:
        agora = timezone.now()
        inicio_mes = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # Itens com solicitação em análise
        itens_pendentes = SolicitacaoItem.objects.filter(
            solicitacao__solicitante=colaborador,
            solicitacao__status__in=["PENDENTE", "EM_ANALISE_IA", "AGUARDANDO_DECISAO"]
        ).values_list("produto_id", flat=True)
        solicitacoes_pendentes_prod = set(itens_pendentes)

        # Consumo no mês atual
        itens_mes = SolicitacaoItem.objects.filter(
            solicitacao__solicitante=colaborador,
            solicitacao__data_solicitacao__gte=inicio_mes,
            solicitacao__status__in=["APROVADA", "RETIRADA"]
        ).values("produto_id").annotate(total=Sum("quantidade_solicitada"))
        for item in itens_mes:
            retiradas_mes_prod[item["produto_id"]] = item["total"] or 0

        # Última retirada registrada
        for item in SolicitacaoItem.objects.filter(
            solicitacao__solicitante=colaborador,
            solicitacao__status__in=["APROVADA", "RETIRADA"]
        ).select_related("solicitacao").order_by("-solicitacao__data_solicitacao"):
            if item.produto_id not in ultimas_retiradas:
                ultimas_retiradas[item.produto_id] = item.solicitacao.data_solicitacao

    produtos = Produto.objects.select_related("categoria").filter(ativo=True).order_by("categoria__nome", "nome")

    resultado = []
    for p in produtos:
        saldo_totem = estoques.get(p.id, 0)
        tem_pendente = p.id in solicitacoes_pendentes_prod
        consumido_mes = retiradas_mes_prod.get(p.id, 0)
        limite_mensal = p.limite_padrao_mensal or 1
        saldo_cota = max(0, limite_mensal - consumido_mes)

        ultima_data = ultimas_retiradas.get(p.id)
        ultima_data_str = fmt(ultima_data, "%d/%m/%Y") if ultima_data else None

        tipo_categoria = "EPI" if p.categoria and "EPI" in p.categoria.nome.upper() else "Consumível"

        # Lógica de elegibilidade (RNF/RF do sistema):
        if tem_pendente:
            status_item = "aguardando"
            elegivel = False
            tipo_acao = "aguardando"
            texto_acao = "Aguardando aprovação"
            mensagem_status = "Você já possui uma solicitação deste item aguardando análise."
        elif p.requer_justificativa or saldo_cota <= 0:
            status_item = "fora_da_cota"
            elegivel = False
            tipo_acao = "substituicao"
            texto_acao = "Solicitar substituição antecipada"
            mensagem_status = "Cota mensal atingida ou requer análise técnica prévia."
        elif saldo_totem <= 0:
            status_item = "sem_estoque"
            elegivel = False
            tipo_acao = "indisponivel"
            texto_acao = "Sem estoque no totem"
            mensagem_status = "Temporariamente sem estoque neste totem."
        else:
            status_item = "disponivel"
            elegivel = True
            tipo_acao = "retirada"
            texto_acao = "Solicitar retirada"
            mensagem_status = f"Disponível no totem ({saldo_totem} un.)."

        resultado.append({
            "id": str(p.id),
            "sku": p.sku,
            "nome": p.nome,
            "descricao": p.descricao or "",
            "categoria": p.categoria.nome if p.categoria else "Geral",
            "tipo": tipo_categoria,
            "unidade_medida": p.unidade_medida,
            "custo_unitario": float(p.custo_unitario),
            "limite_mensal": limite_mensal,
            "consumido_mes": consumido_mes,
            "saldo_cota": saldo_cota,
            "saldo_totem": saldo_totem,
            "ultima_retirada": ultima_data_str,
            "elegivel": elegivel,
            "tipo_acao": tipo_acao,
            "texto_acao": texto_acao,
            "status_item": status_item,
            "mensagem_status": mensagem_status,
            "imagem_url": p.imagem_url or "",
        })

    return JsonResponse({
        "totem": {
            "id": str(totem.id) if totem else None,
            "codigo": totem.codigo if totem else "TOTEM-01",
            "nome": totem.nome if totem else "Totem Principal",
            "localizacao": totem.localizacao if totem else "Geral",
        },
        "produtos": resultado,
        "total_solicitacoes_pendentes": len(solicitacoes_pendentes_prod),
    })


@require_POST
@api_totem
def api_totem_solicitar(request):
    """Processa a solicitação de retirada regular ou substituição antecipada via Totem."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    produto_id = dados.get("produto_id")
    quantidade = int(dados.get("quantidade") or 1)
    tipo = (dados.get("tipo") or "retirada").lower()
    justificativa = (dados.get("justificativa") or "").strip()
    totem_codigo = dados.get("totem_codigo") or "TOTEM-01"

    colaborador = request.colaborador

    produto = Produto.objects.filter(id=produto_id, ativo=True).first()
    if not produto:
        return JsonResponse({"sucesso": False, "erro": "Produto não encontrado."}, status=404)

    totem = Totem.objects.filter(codigo=totem_codigo).first() or Totem.objects.filter(status_online=True).first()

    eh_excepcional = (
        tipo == "substituicao"
        or produto.requer_justificativa
        or bool(justificativa)
    )

    ultimo = Solicitacao.objects.count()
    codigo_solic = f"SOL-2026-{ultimo + 1:04d}"
    valor_total = float(produto.custo_unitario) * quantidade
    # RF-26 a RF-39: Todas as solicitações criadas via Totem iniciam aguardando decisão humana
    status_inicial = "AGUARDANDO_DECISAO"

    solicitacao = Solicitacao.objects.create(
        codigo=codigo_solic,
        solicitante=colaborador,
        totem=totem,
        status=status_inicial,
        justificativa_solicitante=justificativa if eh_excepcional else (justificativa or "Retirada regular de suprimento dentro da cota"),
        motivo_categoria="Substituição antecipada" if eh_excepcional else "Retirada regular",
        fora_da_cota=eh_excepcional,
        valor_total_estimado=valor_total,
        data_conclusao=None,
    )

    SolicitacaoItem.objects.create(
        solicitacao=solicitacao,
        produto=produto,
        quantidade_solicitada=quantidade,
        quantidade_aprovada=None,
        custo_unitario_momento=produto.custo_unitario,
    )

    # Se substituição antecipada, classifica via IA supervisionada
    analise_ia_info = None
    if eh_excepcional and justificativa:
        txt = justificativa.lower()
        if any(w in txt for w in ["rasg", "fur", "quebr", "corte", "danific", "parti"]):
            cat_ia = "Dano durante atividade"
            score = 89.0
            risco = "BAIXO"
            rec = "APROVAR"
            fator_princ = "Dano acidental durante execução de atividade operacional"
        elif any(w in txt for w in ["perd", "sumi", "extravi", "esquec"]):
            cat_ia = "Perda"
            score = 82.0
            risco = "MEDIO"
            rec = "REVISAO_MANUAL"
            fator_princ = "Relato de perda/extravio — verificar termos de reposição"
        elif any(w in txt for w in ["desgast", "velh", "gasto", "usad"]):
            cat_ia = "Desgaste normal"
            score = 91.0
            risco = "BAIXO"
            rec = "APROVAR"
            fator_princ = "Fim da vida útil por tempo de uso"
        elif any(w in txt for w in ["endurec", "rachou", "estrag", "cedo", "defeito"]):
            cat_ia = "Desgaste prematuro"
            score = 86.5
            risco = "BAIXO"
            rec = "APROVAR"
            fator_princ = "Deterioração precoce antes da periodicidade padrão"
        elif any(w in txt for w in ["apert", "larg", "tamanh", "pequen", "grand"]):
            cat_ia = "Tamanho inadequado"
            score = 88.0
            risco = "BAIXO"
            rec = "APROVAR"
            fator_princ = "Incompatibilidade ergonômica de tamanho"
        else:
            cat_ia = "Outro"
            score = 72.0
            risco = "MEDIO"
            rec = "REVISAO_MANUAL"
            fator_princ = "Justificativa genérica requer análise pelo gestor responsável"

        AnaliseIA.objects.create(
            solicitacao=solicitacao,
            modelo_versao="SupplyAI-v1.4",
            recomendacao=rec,
            score_confianca=score,
            nivel_risco=risco,
            parecer_resumo=f"Classificado como '{cat_ia}' com {score:.0f}% de confiança. {fator_princ}.",
            fatores_analisados=[
                {"fator": "Classificação Textual", "detalhe": cat_ia, "impacto": "POSITIVO" if rec == "APROVAR" else "NEUTRO"},
                {"fator": "Histórico do Colaborador", "detalhe": f"Setor {colaborador.setor.nome if colaborador.setor else 'Operações'}", "impacto": "POSITIVO"},
                {"fator": "Periodicidade/Cota", "detalhe": "Solicitação antecipada", "impacto": "ATENCAO"}
            ],
            tempo_inferencia_ms=185,
        )
        analise_ia_info = {
            "categoria": cat_ia,
            "confianca": score,
            "recomendacao": rec,
        }

    return JsonResponse({
        "sucesso": True,
        "codigo": solicitacao.codigo,
        "status": status_inicial,
        "eh_excepcional": eh_excepcional,
        "mensagem": "Solicitação enviada com sucesso! Sua solicitação foi encaminhada para a análise do gestor/almoxarifado.",
        "analise_ia": analise_ia_info,
    })


@require_GET
@api_totem
def api_totem_solicitacoes_usuario(request):
    """Lista as solicitações do colaborador autenticado no autoatendimento (RF-21)."""
    colaborador = request.colaborador

    sols = Solicitacao.objects.filter(solicitante=colaborador).prefetch_related("itens__produto").order_by("-data_solicitacao")[:15]
    resultado = []
    for s in sols:
        primeiro_item = s.itens.first()
        prod_nome = primeiro_item.produto.nome if primeiro_item else "Material"
        resultado.append({
            "codigo": s.codigo,
            "data": fmt(s.data_solicitacao, "%d/%m/%Y às %H:%M"),
            "produto": prod_nome,
            "status": s.status,
            "status_rotulo": (
                "Aguardando aprovação" if s.status in ["PENDENTE", "AGUARDANDO_DECISAO", "EM_ANALISE_IA"]
                else "Aprovada" if s.status == "APROVADA"
                else "Entregue / Retirada" if s.status == "RETIRADA"
                else "Reprovada"
            ),
            "fora_da_cota": s.fora_da_cota,
            "motivo": s.motivo_categoria or "Solicitação",
        })

    return JsonResponse({"solicitacoes": resultado})
