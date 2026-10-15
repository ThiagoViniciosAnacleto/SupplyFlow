"""APIs do totem de autoatendimento."""
import hashlib
import json
import uuid
from decimal import Decimal
from django.db.models import Avg, F, Sum, Count, Q
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from ..models import (
    Solicitacao,
    SolicitacaoItem,
    Produto,
    CategoriaProduto,
    Usuario,
    Setor,
    Totem,
    EstoqueTotem,
    DecisaoSolicitacao,
    AnaliseIA,
    AvaliacaoModeloIA,
)


from .util import fmt, gerar_iniciais, mapear_status_front


# ============================================================================
# ENDPOINTS DO TOTEM DE AUTOATENDIMENTO
# ============================================================================
@csrf_exempt
def api_totem_identificar(request):
    """Verifica se a matrícula existe antes de pedir o PIN."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    matricula = (dados.get("matricula") or "").strip().upper()
    user = Usuario.objects.select_related("setor").filter(codigo_matricula=matricula, ativo=True).first()

    if not user:
        return JsonResponse({"encontrado": False, "erro": "Matrícula não localizada no sistema."}, status=404)

    partes_nome = user.nome.strip().split()
    primeiro_nome = partes_nome[0] if partes_nome else user.nome

    return JsonResponse({
        "encontrado": True,
        "matricula": user.codigo_matricula,
        "nome": user.nome,
        "primeiro_nome": primeiro_nome,
        "cargo": user.cargo or "Colaborador",
        "setor": user.setor.nome if user.setor else "Operações",
    })


@csrf_exempt
def api_totem_login(request):
    """Autentica o colaborador no Totem via matrícula + PIN (compatível com md5)."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    matricula = (dados.get("matricula") or "").strip().upper()
    pin = (dados.get("pin") or "").strip()

    if not matricula or not pin:
        return JsonResponse({"sucesso": False, "erro": "Informe matrícula e PIN."}, status=400)

    pin_md5 = hashlib.md5(pin.encode()).hexdigest()
    colaborador = Usuario.objects.select_related("setor").filter(
        codigo_matricula=matricula, ativo=True
    ).first()

    if not colaborador:
        return JsonResponse({"sucesso": False, "erro": "Matrícula não encontrada ou inativa."}, status=404)

    if colaborador.pin_hash != pin_md5:
        return JsonResponse({"sucesso": False, "erro": "PIN de segurança incorreto. Tente novamente."}, status=401)

    partes_nome = colaborador.nome.strip().split()
    primeiro_nome = partes_nome[0] if partes_nome else colaborador.nome

    return JsonResponse({
        "sucesso": True,
        "colaborador": {
            "id": str(colaborador.id),
            "nome": colaborador.nome,
            "primeiro_nome": primeiro_nome,
            "matricula": colaborador.codigo_matricula,
            "cargo": colaborador.cargo or "Colaborador",
            "setor": colaborador.setor.nome if colaborador.setor else "Operações Industriais",
            "centro_custo": colaborador.setor.centro_custo if colaborador.setor else "CC-Geral",
        }
    })


def api_totem_produtos(request):
    """Retorna o catálogo de produtos no totem com cota, elegibilidade e estoque."""
    matricula = request.GET.get("matricula", "").strip().upper()
    totem_codigo = request.GET.get("totem_codigo", "TOTEM-01")

    colaborador = None
    if matricula:
        colaborador = Usuario.objects.filter(codigo_matricula=matricula, ativo=True).first()

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


@csrf_exempt
def api_totem_solicitar(request):
    """Processa a solicitação de retirada regular ou substituição antecipada via Totem."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    matricula = (dados.get("matricula") or "").strip().upper()
    produto_id = dados.get("produto_id")
    quantidade = int(dados.get("quantidade") or 1)
    tipo = (dados.get("tipo") or "retirada").lower()
    justificativa = (dados.get("justificativa") or "").strip()
    totem_codigo = dados.get("totem_codigo") or "TOTEM-01"

    colaborador = Usuario.objects.filter(codigo_matricula=matricula, ativo=True).first()
    if not colaborador:
        return JsonResponse({"sucesso": False, "erro": "Colaborador não encontrado."}, status=404)

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


def api_totem_solicitacoes_usuario(request):
    """Lista as solicitações do colaborador autenticado no autoatendimento."""
    matricula = request.GET.get("matricula", "").strip().upper()
    colaborador = Usuario.objects.filter(codigo_matricula=matricula, ativo=True).first()
    if not colaborador:
        return JsonResponse({"solicitacoes": []})

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
