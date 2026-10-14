import hashlib
import json
import uuid
from decimal import Decimal
from django.db import connection
from django.db.models import F, Sum, Count, Q
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from .models import (
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


# ============================================================================
# PÁGINAS HTML DO FRONTEND
# ============================================================================
def pagina_login(request):
    return render(request, "index.html")


def pagina_visao_geral(request):
    return render(request, "visao-geral.html")


def pagina_solicitacoes(request):
    return render(request, "solicitacoes.html")


def pagina_solicitacao_detalhe(request):
    return render(request, "solicitacao.html")


def pagina_funcionarios(request):
    return render(request, "funcionarios.html")


def pagina_produtos(request):
    return render(request, "produtos.html")


def pagina_centros_custo(request):
    return render(request, "centros-de-custo.html")


def pagina_cargos(request):
    return render(request, "cargos.html")


def pagina_estoque(request):
    return render(request, "estoque.html")


def pagina_avaliacao_ia(request):
    return render(request, "avaliacao-ia.html")


def pagina_entregas(request):
    return render(request, "entregas.html")


def pagina_devolucoes(request):
    return render(request, "devolucoes.html")


def pagina_totem(request):
    return render(request, "totem/index.html")


def pagina_em_construcao(request):
    return render(request, "em-construcao.html")


# ============================================================================
# UTILITÁRIOS
# ============================================================================
def mapear_status_front(status_db: str, decisao=None) -> str:
    """Converte o status do banco para a chave CSS esperada pelo frontend."""
    status_db = (status_db or "").upper()
    if status_db in ("PENDENTE", "EM_ANALISE_IA", "AGUARDANDO_DECISAO"):
        return "aguardando"
    if status_db == "APROVADA":
        if decisao and decisao.justificativa_decisao and "devolu" in decisao.justificativa_decisao.lower():
            return "aprovada-condicao"
        return "aprovada"
    if status_db in ("REPROVADA", "CANCELADA"):
        return "rejeitada"
    if status_db == "RETIRADA":
        return "entregue"
    return "aguardando"


def gerar_iniciais(nome: str) -> str:
    partes = nome.strip().split()
    if len(partes) >= 2:
        return f"{partes[0][0]}{partes[-1][0]}".upper()
    elif partes:
        return partes[0][:2].upper()
    return "SF"


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
        ultima_data_str = ultima_data.strftime("%d/%m/%Y") if ultima_data else None

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
            "data": s.data_solicitacao.strftime("%d/%m/%Y às %H:%M"),
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


# ============================================================================
# ENDPOINTS DO BACKOFFICE ADMINISTRATIVO
# ============================================================================
def api_listar_usuarios(request):
    """Lista usuários cadastrados para seleção na demonstração do Backoffice/Totem."""
    usuarios = Usuario.objects.select_related("setor").filter(ativo=True).order_by("nome")

    PERFIL_MAP = {
        "ADMIN": ("Administrador", "Acesso geral ao sistema."),
        "GESTOR": ("Gestor / Supervisor", "Aprovações e acompanhamento da equipe."),
        "OPERADOR": ("Almoxarife", "Estoque, entregas e devoluções."),
        "TECNICO_SEGURANCA": ("Técnico de Segurança", "Análise de solicitações e segurança do trabalho."),
        "COLABORADOR": ("Colaborador", "Autoatendimento e consulta de retiradas."),
    }

    resultado = []
    for u in usuarios:
        perfil_desc, acesso_desc = PERFIL_MAP.get(
            u.perfil, (u.cargo or u.perfil, "Acesso operacional ao sistema.")
        )
        resultado.append(
            {
                "id": str(u.id),
                "nome": u.nome,
                "iniciais": gerar_iniciais(u.nome),
                "perfil": perfil_desc,
                "perfil_codigo": u.perfil,
                "cargo": u.cargo or perfil_desc,
                "matricula": u.codigo_matricula,
                "email": u.email,
                "setor": u.setor.nome if u.setor else None,
                "acesso": acesso_desc,
            }
        )

    return JsonResponse({"usuarios": resultado})


def api_dashboard_kpis(request):
    """Retorna os KPIs consolidados da VIEW e das tabelas reais."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM vw_dashboard_visao_geral;")
        colunas = [col[0] for col in cursor.description]
        linha = cursor.fetchone()
        kpis_view = dict(zip(colunas, linha)) if linha else {}

    for chave, valor in kpis_view.items():
        if hasattr(valor, "__float__"):
            kpis_view[chave] = float(valor)

    produtos_cadastrados = Produto.objects.filter(ativo=True).count()
    funcionarios_ativos = Usuario.objects.filter(ativo=True).count()
    aguardando_aprovacao = Solicitacao.objects.filter(
        status__in=["AGUARDANDO_DECISAO", "PENDENTE", "EM_ANALISE_IA"]
    ).count()
    entregas_pendentes = Solicitacao.objects.filter(
        status="APROVADA", data_conclusao__isnull=True
    ).count()
    epis_aguardando_devolucao = Solicitacao.objects.filter(
        status="APROVADA", decisao__justificativa_decisao__icontains="devolu"
    ).count()
    produtos_estoque_baixo = EstoqueTotem.objects.filter(
        quantidade_disponivel__lte=F("quantidade_minima")
    ).count()

    indicadores = [
        {"id": "produtos-cadastrados", "rotulo": "Produtos cadastrados", "valor": produtos_cadastrados, "icone": "bi-box", "tom": "tom-azul"},
        {"id": "funcionarios-ativos", "rotulo": "Funcionários ativos", "valor": funcionarios_ativos, "icone": "bi-people", "tom": "tom-cinza"},
        {"id": "aguardando-aprovacao", "rotulo": "Aguardando aprovação", "valor": aguardando_aprovacao, "icone": "bi-clipboard", "tom": "tom-ambar"},
        {"id": "entregas-pendentes", "rotulo": "Entregas pendentes", "valor": entregas_pendentes, "icone": "bi-truck", "tom": "tom-verde"},
        {"id": "epis-devolucao", "rotulo": "EPIs aguardando devolução", "valor": epis_aguardando_devolucao, "icone": "bi-arrow-counterclockwise", "tom": "tom-indigo"},
        {"id": "estoque-baixo", "rotulo": "Produtos com estoque baixo", "valor": produtos_estoque_baixo, "icone": "bi-exclamation-triangle", "tom": "tom-vermelho"},
    ]

    retiradas_mes = Solicitacao.objects.filter(status__in=["RETIRADA", "APROVADA"]).count()
    entregas_por_mes = {
        "meses": ["Mai", "Jun", "Jul", "Ago", "Set", "Out"],
        "valores": [18, 22, 19, 27, 31, retiradas_mes or 24],
    }

    consumo_qs = (
        Solicitacao.objects.filter(solicitante__setor__isnull=False)
        .values("solicitante__setor__nome")
        .annotate(total=Sum("valor_total_estimado"))
        .order_by("-total")
    )
    centros = [item["solicitante__setor__nome"] for item in consumo_qs]
    valores_consumo = [round(float(item["total"] or 0), 2) for item in consumo_qs]

    for s_nome in Setor.objects.values_list("nome", flat=True):
        if s_nome not in centros:
            centros.append(s_nome)
            valores_consumo.append(0.0)

    resposta = {
        **kpis_view,
        "indicadores": indicadores,
        "entregasPorMes": entregas_por_mes,
        "consumoPorCentro": {"centros": centros, "valores": valores_consumo},
    }
    return JsonResponse(resposta)


def api_listar_solicitacoes(request):
    """Lista solicitações com compatibilidade relacional e plana."""
    solicitacoes = (
        Solicitacao.objects.select_related(
            "solicitante", "solicitante__setor", "totem", "analise_ia", "decisao", "decisao__aprovador"
        )
        .prefetch_related("itens__produto", "itens__produto__categoria")
        .order_by("-data_solicitacao")
    )

    resultado = []
    for s in solicitacoes:
        analise = getattr(s, "analise_ia", None)
        decisao = getattr(s, "decisao", None)
        status_front = mapear_status_front(s.status, decisao)
        itens_lista = list(s.itens.all())
        primeiro_item = itens_lista[0] if itens_lista else None

        prod_nome = primeiro_item.produto.nome if primeiro_item else "Material"
        if len(itens_lista) > 1:
            prod_nome += f" (+{len(itens_lista) - 1} item{'s' if len(itens_lista) > 2 else ''})"

        motivo_texto = s.motivo_categoria or (
            "Substituição antecipada" if s.fora_da_cota else "Retirada regular"
        )

        ia_front = None
        if analise:
            categoria_ia = analise.parecer_resumo.split(".")[0] if analise.parecer_resumo else analise.recomendacao
            if len(categoria_ia) > 35:
                categoria_ia = s.motivo_categoria or analise.recomendacao
            ia_front = {
                "categoria": categoria_ia,
                "confianca": int(round(float(analise.score_confianca))),
                "recomendacao": analise.recomendacao,
                "nivel_risco": analise.nivel_risco,
            }

        decisao_front = None
        if decisao:
            decisao_front = {
                "status": status_front,
                "decisao_final": decisao.decisao_final,
                "seguiu_recomendacao_ia": decisao.seguiu_recomendacao_ia,
                "observacao": decisao.justificativa_decisao,
                "justificativa_decisao": decisao.justificativa_decisao,
                "responsavel": decisao.aprovador.nome if decisao.aprovador else "Gestor Responsável",
                "perfil": decisao.aprovador.cargo if decisao.aprovador else "Gestor",
                "dataHora": decisao.data_decisao.strftime("%d/%m/%Y, %H:%M"),
            }

        resultado.append(
            {
                "id": str(s.id),
                "codigo": s.codigo,
                "numero": s.codigo,
                "status": status_front,
                "status_db": s.status,
                "excepcional": bool(s.fora_da_cota),
                "fora_da_cota": bool(s.fora_da_cota),
                "data": s.data_solicitacao.strftime("%d/%m/%Y"),
                "hora": s.data_solicitacao.strftime("%H:%M"),
                "data_solicitacao": s.data_solicitacao.isoformat(),
                "data_conclusao": s.data_conclusao.isoformat() if s.data_conclusao else None,
                "motivo": motivo_texto,
                "funcionario": s.solicitante.nome,
                "matricula": s.solicitante.codigo_matricula,
                "funcao": s.solicitante.cargo or "Colaborador",
                "centroCusto": s.solicitante.setor.nome if s.solicitante.setor else "Geral",
                "produto": prod_nome,
                "tipoProduto": "EPI" if primeiro_item and "EPI" in (primeiro_item.produto.sku or "").upper() else "Consumível",
                "justificativa": s.justificativa_solicitante,
                "motivo_categoria": s.motivo_categoria,
                "valor_total_estimado": float(s.valor_total_estimado),
                "solicitante": {
                    "id": str(s.solicitante.id),
                    "nome": s.solicitante.nome,
                    "matricula": s.solicitante.codigo_matricula,
                    "cargo": s.solicitante.cargo,
                    "setor": s.solicitante.setor.nome if s.solicitante.setor else None,
                },
                "totem": s.totem.nome if s.totem else None,
                "itens": [
                    {
                        "id": str(item.id),
                        "sku": item.produto.sku,
                        "produto": item.produto.nome,
                        "unidade_medida": item.produto.unidade_medida,
                        "quantidade_solicitada": item.quantidade_solicitada,
                        "quantidade_aprovada": item.quantidade_aprovada,
                        "custo_unitario": float(item.custo_unitario_momento),
                    }
                    for item in itens_lista
                ],
                "ia": ia_front,
                "analise_ia": (
                    {
                        "modelo_versao": analise.modelo_versao,
                        "recomendacao": analise.recomendacao,
                        "score_confianca": float(analise.score_confianca),
                        "nivel_risco": analise.nivel_risco,
                        "parecer_resumo": analise.parecer_resumo,
                        "fatores_analisados": analise.fatores_analisados,
                    }
                    if analise
                    else None
                ),
                "decisao": decisao_front,
            }
        )

    return JsonResponse({"solicitacoes": resultado})


def api_detalhe_solicitacao(request, solicitacao_id):
    """Retorna o detalhe minucioso de uma solicitação para a tela solicitacao.html."""
    try:
        if str(solicitacao_id).isdigit() or "-" in str(solicitacao_id) and not len(str(solicitacao_id)) == 36:
            s = Solicitacao.objects.filter(codigo__icontains=str(solicitacao_id)).first()
        else:
            s = Solicitacao.objects.filter(id=solicitacao_id).first()
    except Exception:
        s = None

    if not s:
        return JsonResponse({"erro": "Solicitação não encontrada"}, status=404)

    analise = getattr(s, "analise_ia", None)
    decisao = getattr(s, "decisao", None)
    status_front = mapear_status_front(s.status, decisao)
    itens = list(s.itens.select_related("produto", "produto__categoria").all())
    p_item = itens[0] if itens else None

    # Histórico de retiradas anteriores do colaborador
    historico = []
    anteriores = (
        Solicitacao.objects.filter(solicitante=s.solicitante)
        .exclude(id=s.id)
        .order_by("-data_solicitacao")[:5]
    )
    for ant in anteriores:
        historico.append({
            "data": ant.data_solicitacao.strftime("%d/%m/%Y"),
            "tipo": ant.motivo_categoria or ("Substituição antecipada" if ant.fora_da_cota else "Entrega regular"),
            "status": ant.status,
        })

    dados = {
        "id": str(s.id),
        "codigo": s.codigo,
        "numero": s.codigo,
        "status": status_front,
        "status_db": s.status,
        "excepcional": s.fora_da_cota,
        "data": s.data_solicitacao.strftime("%d/%m/%Y"),
        "hora": s.data_solicitacao.strftime("%H:%M"),
        "data_solicitacao": s.data_solicitacao.isoformat(),
        "motivo": s.motivo_categoria or "Substituição antecipada",
        "justificativa": s.justificativa_solicitante,
        "valor_total_estimado": float(s.valor_total_estimado),
        "solicitante": {
            "id": str(s.solicitante.id),
            "nome": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "cargo": s.solicitante.cargo or "Colaborador",
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "Operações",
            "centro_custo": s.solicitante.setor.centro_custo if s.solicitante.setor else "CC-Geral",
        },
        "produto": {
            "id": str(p_item.produto.id) if p_item else None,
            "sku": p_item.produto.sku if p_item else "",
            "nome": p_item.produto.nome if p_item else "Material",
            "descricao": p_item.produto.descricao or "EPI de proteção individual",
            "categoria": p_item.produto.categoria.nome if p_item and p_item.produto.categoria else "Geral",
            "tipo": "EPI" if p_item and "EPI" in (p_item.produto.sku or "").upper() else "Consumível",
            "ca": "12345" if p_item and "EPI" in (p_item.produto.sku or "").upper() else "N/A",
            "tamanho": "M / Padrão",
            "periodicidade": "90 dias",
            "quantidade": p_item.quantidade_solicitada if p_item else 1,
            "custo": float(p_item.custo_unitario_momento) if p_item else 0.0,
        },
        "itens": [
            {
                "sku": it.produto.sku,
                "nome": it.produto.nome,
                "quantidade": it.quantidade_solicitada,
                "unidade": it.produto.unidade_medida,
                "custo": float(it.custo_unitario_momento),
            }
            for it in itens
        ],
        "historico": historico,
        "analise_ia": (
            {
                "modelo_versao": analise.modelo_versao,
                "categoria": s.motivo_categoria or analise.recomendacao,
                "recomendacao": analise.recomendacao,
                "score_confianca": float(analise.score_confianca),
                "confianca": int(round(float(analise.score_confianca))),
                "nivel_risco": analise.nivel_risco,
                "parecer_resumo": analise.parecer_resumo,
                "fatores_analisados": analise.fatores_analisados,
            }
            if analise
            else None
        ),
        "decisao": (
            {
                "status": status_front,
                "decisao_final": decisao.decisao_final,
                "seguiu_recomendacao_ia": decisao.seguiu_recomendacao_ia,
                "justificativa_decisao": decisao.justificativa_decisao,
                "responsavel": decisao.aprovador.nome if decisao.aprovador else "Gestor",
                "perfil": decisao.aprovador.cargo if decisao.aprovador else "Gestor",
                "dataHora": decisao.data_decisao.strftime("%d/%m/%Y, %H:%M"),
            }
            if decisao
            else None
        ),
    }

    return JsonResponse({"solicitacao": dados})


@csrf_exempt
def api_decidir_solicitacao(request, solicitacao_id):
    """Registra uma aprovação ou reprovação para uma solicitação."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    solicitacao = get_object_or_404(Solicitacao, id=solicitacao_id)

    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    decisao_str = str(body.get("decisao", "APROVADA")).upper()
    if "REPR" in decisao_str or "REJEIT" in decisao_str:
        status_final = "REPROVADA"
    else:
        status_final = "APROVADA"

    justificativa = body.get("justificativa", "")
    seguiu_ia = body.get("seguiu_recomendacao_ia", True)
    aprovador_id = body.get("aprovador_id")

    aprovador = None
    if aprovador_id:
        try:
            aprovador = Usuario.objects.filter(id=aprovador_id).first()
        except Exception:
            pass

    if not aprovador:
        aprovador = Usuario.objects.filter(perfil__in=["ADMIN", "GESTOR"]).first()

    solicitacao.status = status_final
    if status_final == "REPROVADA":
        solicitacao.data_conclusao = timezone.now()
    else:
        # Aprovada: aguarda confirmação de retirada física no almoxarifado/totem (RF-40)
        solicitacao.data_conclusao = None
        for it in solicitacao.itens.all():
            if it.quantidade_aprovada is None:
                it.quantidade_aprovada = it.quantidade_solicitada
                it.save()
    solicitacao.save()

    DecisaoSolicitacao.objects.update_or_create(
        solicitacao=solicitacao,
        defaults={
            "aprovador": aprovador,
            "decisao_final": status_final,
            "seguiu_recomendacao_ia": seguiu_ia,
            "justificativa_decisao": (
                justificativa or f"Decisão registrada via Backoffice SupplyFlow ({status_final})."
            ),
        },
    )

    return JsonResponse(
        {
            "sucesso": True,
            "mensagem": f"Solicitação {solicitacao.codigo} atualizada para {status_final}.",
            "solicitacao_id": str(solicitacao.id),
            "codigo": solicitacao.codigo,
            "status": status_final,
            "status_front": "aprovada" if status_final == "APROVADA" else "rejeitada",
        }
    )


# ============================================================================
# GESTÃO DE FUNCIONÁRIOS / USUÁRIOS
# ============================================================================
def api_listar_funcionarios(request):
    """Lista todos os funcionários cadastrados com paginação ou filtros."""
    setor_filtro = request.GET.get("setor")
    termo = request.GET.get("q", "").strip()

    qs = Usuario.objects.select_related("setor").all().order_by("nome")
    if setor_filtro:
        qs = qs.filter(setor_id=setor_filtro)
    if termo:
        qs = qs.filter(Q(nome__icontains=termo) | Q(codigo_matricula__icontains=termo) | Q(email__icontains=termo))

    resultado = [
        {
            "id": str(u.id),
            "matricula": u.codigo_matricula,
            "nome": u.nome,
            "iniciais": gerar_iniciais(u.nome),
            "email": u.email or "—",
            "cargo": u.cargo or "Colaborador",
            "perfil": u.perfil,
            "setor_id": str(u.setor.id) if u.setor else None,
            "setor_nome": u.setor.nome if u.setor else "Sem setor",
            "centro_custo": u.setor.centro_custo if u.setor else "—",
            "ativo": u.ativo,
            "created_at": u.created_at.strftime("%d/%m/%Y") if u.created_at else "—",
        }
        for u in qs
    ]
    return JsonResponse({"funcionarios": resultado})


@csrf_exempt
def api_salvar_funcionario(request):
    """Cadastra ou atualiza um funcionário."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    func_id = dados.get("id")
    nome = dados.get("nome", "").strip()
    matricula = dados.get("matricula", "").strip().upper()
    email = dados.get("email", "").strip() or None
    cargo = dados.get("cargo", "").strip()
    perfil = dados.get("perfil", "COLABORADOR").strip().upper()
    setor_id = dados.get("setor_id")
    pin = dados.get("pin", "").strip()

    if not nome or not matricula:
        return JsonResponse({"sucesso": False, "erro": "Nome e Matrícula são obrigatórios."}, status=400)

    setor = Setor.objects.filter(id=setor_id).first() if setor_id else None

    if func_id:
        func = get_object_or_404(Usuario, id=func_id)
        func.nome = nome
        func.codigo_matricula = matricula
        func.email = email
        func.cargo = cargo
        func.perfil = perfil
        func.setor = setor
        if pin:
            func.pin_hash = hashlib.md5(pin.encode()).hexdigest()
        func.save()
        msg = "Funcionário atualizado com sucesso."
    else:
        if Usuario.objects.filter(codigo_matricula=matricula).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe colaborador com esta matrícula."}, status=400)

        pin_default = pin or "1234"
        func = Usuario.objects.create(
            nome=nome,
            codigo_matricula=matricula,
            email=email,
            cargo=cargo,
            perfil=perfil,
            setor=setor,
            pin_hash=hashlib.md5(pin_default.encode()).hexdigest(),
            ativo=True,
        )
        msg = "Funcionário cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(func.id)})


@csrf_exempt
def api_toggle_funcionario(request, funcionario_id):
    """Ativa ou inativa um funcionário."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    func = get_object_or_404(Usuario, id=funcionario_id)
    func.ativo = not func.ativo
    func.save()
    status_txt = "ativado" if func.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": func.ativo, "mensagem": f"Colaborador {status_txt}."})


# ============================================================================
# GESTÃO DE PRODUTOS / CATÁLOGO
# ============================================================================
def api_listar_produtos(request):
    """Lista os produtos do catálogo (ativos e inativos se solicitado)."""
    todos = request.GET.get("todos", "false").lower() == "true"
    qs = Produto.objects.select_related("categoria").all().order_by("nome")
    if not todos:
        qs = qs.filter(ativo=True)

    dados = [
        {
            "id": str(p.id),
            "sku": p.sku,
            "nome": p.nome,
            "descricao": p.descricao or "",
            "categoria_id": str(p.categoria.id) if p.categoria else None,
            "categoria": p.categoria.nome if p.categoria else "Sem categoria",
            "tipo": "EPI" if p.categoria and "EPI" in p.categoria.nome.upper() else "Consumível",
            "unidade_medida": p.unidade_medida,
            "custo_unitario": float(p.custo_unitario),
            "limite_padrao_mensal": p.limite_padrao_mensal or 0,
            "requer_justificativa": p.requer_justificativa,
            "imagem_url": p.imagem_url or "",
            "ativo": p.ativo,
        }
        for p in qs
    ]
    categorias = [
        {"id": str(c.id), "nome": c.nome}
        for c in CategoriaProduto.objects.all().order_by("nome")
    ]
    return JsonResponse({"produtos": dados, "categorias": categorias})


@csrf_exempt
def api_salvar_produto(request):
    """Cadastra ou edita um produto."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    prod_id = dados.get("id")
    sku = dados.get("sku", "").strip().upper()
    nome = dados.get("nome", "").strip()
    descricao = dados.get("descricao", "").strip()
    categoria_id = dados.get("categoria_id")
    unidade = dados.get("unidade_medida", "UN").strip().upper()
    custo = Decimal(str(dados.get("custo_unitario") or "0.00"))
    limite = int(dados.get("limite_padrao_mensal") or 1)
    requer_just = bool(dados.get("requer_justificativa", False))
    imagem = dados.get("imagem_url", "").strip()

    if not sku or not nome:
        return JsonResponse({"sucesso": False, "erro": "SKU e Nome são obrigatórios."}, status=400)

    categoria = CategoriaProduto.objects.filter(id=categoria_id).first() if categoria_id else None

    if prod_id:
        prod = get_object_or_404(Produto, id=prod_id)
        prod.sku = sku
        prod.nome = nome
        prod.descricao = descricao
        prod.categoria = categoria
        prod.unidade_medida = unidade
        prod.custo_unitario = custo
        prod.limite_padrao_mensal = limite
        prod.requer_justificativa = requer_just
        if imagem:
            prod.imagem_url = imagem
        prod.save()
        msg = "Produto atualizado com sucesso."
    else:
        if Produto.objects.filter(sku=sku).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe produto com este SKU."}, status=400)
        prod = Produto.objects.create(
            sku=sku,
            nome=nome,
            descricao=descricao,
            categoria=categoria,
            unidade_medida=unidade,
            custo_unitario=custo,
            limite_padrao_mensal=limite,
            requer_justificativa=requer_just,
            imagem_url=imagem or "/static/img/produtos/generico.jpg",
            ativo=True,
        )
        msg = "Produto cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(prod.id)})


@csrf_exempt
def api_toggle_produto(request, produto_id):
    """Ativa ou inativa um produto."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    prod = get_object_or_404(Produto, id=produto_id)
    prod.ativo = not prod.ativo
    prod.save()
    status_txt = "ativado" if prod.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": prod.ativo, "mensagem": f"Produto {status_txt}."})


# ============================================================================
# GESTÃO DE SETORES E CENTROS DE CUSTO
# ============================================================================
def api_listar_setores(request):
    """Lista todos os setores e centros de custo cadastrados."""
    setores = Setor.objects.annotate(total_funcionarios=Count("usuario")).order_by("nome")
    resultado = [
        {
            "id": str(s.id),
            "nome": s.nome,
            "centro_custo": s.centro_custo or "—",
            "ativo": s.ativo,
            "total_funcionarios": s.total_funcionarios,
        }
        for s in setores
    ]
    return JsonResponse({"setores": resultado})


@csrf_exempt
def api_salvar_setor(request):
    """Cria ou edita um setor."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    setor_id = dados.get("id")
    nome = dados.get("nome", "").strip()
    cc = dados.get("centro_custo", "").strip()

    if not nome:
        return JsonResponse({"sucesso": False, "erro": "Nome do setor é obrigatório."}, status=400)

    if setor_id:
        setor = get_object_or_404(Setor, id=setor_id)
        setor.nome = nome
        setor.centro_custo = cc
        setor.save()
        msg = "Setor atualizado com sucesso."
    else:
        if Setor.objects.filter(nome__iexact=nome).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe um setor com este nome."}, status=400)
        setor = Setor.objects.create(nome=nome, centro_custo=cc, ativo=True)
        msg = "Setor cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(setor.id)})


@csrf_exempt
def api_toggle_setor(request, setor_id):
    """Ativa ou inativa um setor."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    setor = get_object_or_404(Setor, id=setor_id)
    setor.ativo = not setor.ativo
    setor.save()
    status_txt = "ativado" if setor.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": setor.ativo, "mensagem": f"Setor {status_txt}."})


# ============================================================================
# GESTÃO DE ESTOQUE NOS TOTENS
# ============================================================================
def api_listar_estoque(request):
    """Lista o saldo de produtos em cada totem e itens abaixo do ponto de pedido."""
    totens = Totem.objects.all().order_by("codigo")
    estoques = (
        EstoqueTotem.objects.select_related("totem", "produto", "produto__categoria")
        .all()
        .order_by("totem__codigo", "produto__nome")
    )

    resultado = []
    itens_criticos = 0
    itens_zerados = 0

    for e in estoques:
        disponivel = e.quantidade_disponivel
        minimo = e.quantidade_minima
        if disponivel == 0:
            status_estoque = "zerado"
            itens_zerados += 1
        elif disponivel <= minimo:
            status_estoque = "critico"
            itens_criticos += 1
        else:
            status_estoque = "normal"

        resultado.append({
            "id": str(e.id),
            "totem_id": str(e.totem.id),
            "totem_codigo": e.totem.codigo,
            "totem_nome": e.totem.nome,
            "produto_id": str(e.produto.id),
            "produto_sku": e.produto.sku,
            "produto_nome": e.produto.nome,
            "categoria": e.produto.categoria.nome if e.produto.categoria else "Geral",
            "quantidade_disponivel": disponivel,
            "quantidade_minima": minimo,
            "slot_posicao": e.slot_posicao or "Padrão",
            "status_estoque": status_estoque,
            "updated_at": e.updated_at.strftime("%d/%m/%Y às %H:%M") if e.updated_at else "—",
        })

    totens_dados = [
        {
            "id": str(t.id),
            "codigo": t.codigo,
            "nome": t.nome,
            "localizacao": t.localizacao or "—",
            "online": t.status_online,
        }
        for t in totens
    ]

    return JsonResponse({
        "estoque": resultado,
        "totens": totens_dados,
        "resumo": {
            "total_registros": len(resultado),
            "itens_criticos": itens_criticos,
            "itens_zerados": itens_zerados,
        }
    })


@csrf_exempt
def api_repor_estoque(request):
    """Registra uma reposição de itens no totem."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    estoque_id = dados.get("estoque_id")
    quantidade = int(dados.get("quantidade") or 0)

    if not estoque_id or quantidade <= 0:
        return JsonResponse({"sucesso": False, "erro": "Estoque e quantidade positiva são obrigatórios."}, status=400)

    e = get_object_or_404(EstoqueTotem, id=estoque_id)
    e.quantidade_disponivel += quantidade
    e.save()

    return JsonResponse({
        "sucesso": True,
        "mensagem": f"Reposição de {quantidade} unidades de '{e.produto.nome}' no {e.totem.codigo} realizada.",
        "nova_quantidade": e.quantidade_disponivel,
    })


# ============================================================================
# GESTÃO DE AVALIAÇÃO DO MODELO DE IA
# ============================================================================
def api_avaliacao_ia(request):
    """Retorna dados de acurácia, matriz de confusão e feedbacks do classificador."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM vw_dashboard_visao_geral;")
        colunas = [col[0] for col in cursor.description]
        linha = cursor.fetchone()
        kpis = dict(zip(colunas, linha)) if linha else {}

    avaliacoes = AvaliacaoModeloIA.objects.select_related("analise_ia__solicitacao", "avaliador").all().order_by("-created_at")

    feedbacks = [
        {
            "id": str(a.id),
            "codigo_solicitacao": a.analise_ia.solicitacao.codigo,
            "avaliador": a.avaliador.nome,
            "classificacao": a.classificacao,
            "nota": a.nota_precisao,
            "feedback": a.feedback_comentario or "Sem comentário adicional.",
            "tags": a.tags_erro or [],
            "data": a.created_at.strftime("%d/%m/%Y"),
        }
        for a in avaliacoes
    ]

    # Matriz sintética calculada derivada das categorias de justificativas do TCC
    matriz = [
        {"categoria": "Perda", "acertos": 42, "erros": 8, "total": 50, "precisao": 84.0},
        {"categoria": "Desgaste normal", "acertos": 55, "erros": 6, "total": 61, "precisao": 90.2},
        {"categoria": "Desgaste prematuro", "acertos": 37, "erros": 9, "total": 46, "precisao": 80.4},
        {"categoria": "Defeito de fabricação", "acertos": 18, "erros": 5, "total": 23, "precisao": 78.3},
        {"categoria": "Dano durante atividade", "acertos": 61, "erros": 11, "total": 72, "precisao": 84.7},
        {"categoria": "Contaminação", "acertos": 14, "erros": 4, "total": 18, "precisao": 77.8},
        {"categoria": "Tamanho inadequado", "acertos": 22, "erros": 6, "total": 28, "precisao": 78.6},
        {"categoria": "Acidente", "acertos": 12, "erros": 3, "total": 15, "precisao": 80.0},
        {"categoria": "Mudança de função", "acertos": 9, "erros": 4, "total": 13, "precisao": 69.2},
        {"categoria": "Outro", "acertos": 7, "erros": 5, "total": 12, "precisao": 58.3},
    ]

    total_acertos = sum(m["acertos"] for m in matriz)
    total_erros = sum(m["erros"] for m in matriz)
    total_exemplos = total_acertos + total_erros
    acuracia_global = round((total_acertos / total_exemplos) * 100, 1)

    return JsonResponse({
        "acuracia_global": acuracia_global,
        "total_exemplos": total_exemplos,
        "total_acertos": total_acertos,
        "total_erros": total_erros,
        "media_confianca": float(kpis.get("media_confianca_ia", 89.82)),
        "aderencia_humana": float(kpis.get("taxa_aderencia_ia_percentual", 66.67)),
        "matriz_confusao": matriz,
        "feedbacks_recentes": feedbacks,
    })


# ============================================================================
# ENTREGAS E DEVOLUÇÕES
# ============================================================================
def api_listar_entregas(request):
    """Lista entregas confirmadas e entregas pendentes de baixa física."""
    entregas = (
        Solicitacao.objects.select_related("solicitante", "solicitante__setor", "totem")
        .prefetch_related("itens__produto")
        .filter(status__in=["APROVADA", "RETIRADA"])
        .order_by("-data_solicitacao")
    )
    resultado = []
    for s in entregas:
        p_item = s.itens.first()
        resultado.append({
            "id": str(s.id),
            "codigo": s.codigo,
            "data": s.data_solicitacao.strftime("%d/%m/%Y às %H:%M"),
            "data_conclusao": s.data_conclusao.strftime("%d/%m/%Y às %H:%M") if s.data_conclusao else "Pendente",
            "colaborador": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "Operações",
            "produto": p_item.produto.nome if p_item else "Material",
            "quantidade": p_item.quantidade_solicitada if p_item else 1,
            "totem": s.totem.nome if s.totem else "Balcão Central",
            "status": "Entregue" if s.status == "RETIRADA" or s.data_conclusao else "Aguardando retirada física",
            "entregue": bool(s.status == "RETIRADA" or s.data_conclusao),
        })
    return JsonResponse({"entregas": resultado})


@csrf_exempt
def api_confirmar_entrega(request, solicitacao_id):
    """Almoxarife confirma a entrega física do produto."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    s = get_object_or_404(Solicitacao, id=solicitacao_id)
    s.status = "RETIRADA"
    s.data_conclusao = timezone.now()
    s.save()

    # RF-40 e RF-41: Baixa definitiva no estoque do totem correspondente
    totem = s.totem or Totem.objects.filter(status_online=True).first() or Totem.objects.first()
    for item in s.itens.all():
        qtd = item.quantidade_aprovada if item.quantidade_aprovada is not None else item.quantidade_solicitada
        if totem and qtd > 0:
            estoque_item = EstoqueTotem.objects.filter(totem=totem, produto=item.produto).first()
            if estoque_item:
                estoque_item.quantidade_disponivel = max(0, estoque_item.quantidade_disponivel - qtd)
                estoque_item.save()

    return JsonResponse({"sucesso": True, "mensagem": f"Entrega da solicitação {s.codigo} confirmada com sucesso e estoque atualizado."})


def api_listar_devolucoes(request):
    """Lista EPIs com devolução obrigatória ou registradas."""
    devolucoes = (
        Solicitacao.objects.select_related("solicitante", "solicitante__setor", "decisao")
        .prefetch_related("itens__produto")
        .filter(fora_da_cota=True)
        .order_by("-data_solicitacao")
    )
    resultado = []
    for s in devolucoes:
        p_item = s.itens.first()
        decisao = getattr(s, "decisao", None)
        tem_condicao = decisao and "devolu" in (decisao.justificativa_decisao or "").lower()
        resultado.append({
            "id": str(s.id),
            "codigo": s.codigo,
            "data_solicitacao": s.data_solicitacao.strftime("%d/%m/%Y"),
            "colaborador": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "Operações",
            "produto": p_item.produto.nome if p_item else "EPI",
            "condicao_obrigatoria": bool(tem_condicao),
            "status_devolucao": "Devolução pendente" if tem_condicao and s.status != "RETIRADA" else "Dispensada / Concluída",
            "observacao": decisao.justificativa_decisao if decisao else "Sem restrição de devolução.",
        })
    return JsonResponse({"devolucoes": resultado})


# ============================================================================
# LOGIN DE BACKOFFICE (EMAIL + SENHA) OU TOTEM (MATRÍCULA + PIN)
# ============================================================================
@csrf_exempt
def api_login(request):
    """Autentica via Backoffice (email + senha) ou via Totem (matricula + pin)."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    email = body.get("email")
    senha = body.get("senha")
    matricula = body.get("matricula")
    pin = body.get("pin")

    if email and senha:
        senha_md5 = hashlib.md5(senha.encode()).hexdigest()
        user = Usuario.objects.filter(email=email, senha_hash=senha_md5, ativo=True).first()
    elif matricula and pin:
        pin_md5 = hashlib.md5(pin.encode()).hexdigest()
        user = Usuario.objects.filter(codigo_matricula=matricula, pin_hash=pin_md5, ativo=True).first()
    else:
        return JsonResponse({"autenticado": False, "erro": "Credenciais incompletas"}, status=400)

    if not user:
        return JsonResponse({"autenticado": False, "erro": "Credenciais inválidas"}, status=401)

    return JsonResponse(
        {
            "autenticado": True,
            "usuario": {
                "id": str(user.id),
                "nome": user.nome,
                "iniciais": gerar_iniciais(user.nome),
                "email": user.email,
                "matricula": user.codigo_matricula,
                "perfil": user.perfil,
                "cargo": user.cargo,
            },
        }
    )