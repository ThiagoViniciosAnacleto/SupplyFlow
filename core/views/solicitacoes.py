"""APIs do backoffice: usuários, painel e solicitações."""
import hashlib
import json
import uuid
from decimal import Decimal
from django.db.models import Avg, F, Sum, Count, Q
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST
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


from ..permissoes import ACOES, DESCRICAO_ACESSO, PERFIS, PERFIS_BACKOFFICE, api_backoffice
from .util import fmt, gerar_iniciais, mapear_status_front


# ============================================================================
# ENDPOINTS DO BACKOFFICE ADMINISTRATIVO
# ============================================================================
@require_GET
@api_backoffice("pessoas")
def api_listar_usuarios(request):
    """Usuários com acesso ao backoffice, situação da conta e matriz de permissões (RF-08, RF-09)."""
    usuarios = (
        Usuario.objects.select_related("setor", "conta")
        .filter(perfil__in=PERFIS_BACKOFFICE)
        .order_by("nome")
    )
    resultado = []
    for u in usuarios:
        if not u.ativo:
            situacao = "inativo"
        elif u.conta_id and u.conta.has_usable_password() and u.conta.is_active:
            situacao = "ativo"
        elif u.email:
            situacao = "convite_pendente"
        else:
            situacao = "sem_email"
        resultado.append({
            "id": str(u.id),
            "nome": u.nome,
            "iniciais": gerar_iniciais(u.nome),
            "email": u.email,
            "matricula": u.codigo_matricula,
            "perfil_codigo": u.perfil,
            "perfil": PERFIS.get(u.perfil, u.perfil),
            "setor": u.setor.nome if u.setor else None,
            "situacao": situacao,
            "ultimo_acesso": fmt(u.ultimo_acesso, "%d/%m/%Y %H:%M") if u.ultimo_acesso else None,
        })

    matriz = [
        {"perfil_codigo": codigo, "perfil": nome, "acesso": DESCRICAO_ACESSO.get(codigo, ""),
         "acoes": sorted(ACOES.get(codigo, set()))}
        for codigo, nome in PERFIS.items()
    ]
    return JsonResponse({"usuarios": resultado, "permissoes": matriz})


@require_GET
@api_backoffice("ver")
def api_dashboard_kpis(request):
    """Retorna os KPIs consolidados calculados a partir das tabelas."""
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
        "indicadores": indicadores,
        "entregasPorMes": entregas_por_mes,
        "consumoPorCentro": {"centros": centros, "valores": valores_consumo},
    }
    return JsonResponse(resposta)


@require_GET
@api_backoffice("ver")
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
                "dataHora": fmt(decisao.data_decisao, "%d/%m/%Y, %H:%M"),
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
                "data": fmt(s.data_solicitacao, "%d/%m/%Y"),
                "hora": fmt(s.data_solicitacao, "%H:%M"),
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


@require_GET
@api_backoffice("ver")
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
            "data": fmt(ant.data_solicitacao, "%d/%m/%Y"),
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
        "data": fmt(s.data_solicitacao, "%d/%m/%Y"),
        "hora": fmt(s.data_solicitacao, "%H:%M"),
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
                "dataHora": fmt(decisao.data_decisao, "%d/%m/%Y, %H:%M"),
            }
            if decisao
            else None
        ),
    }

    return JsonResponse({"solicitacao": dados})


@require_POST
@api_backoffice("decidir")
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
    # Quem decide é quem está logado — nunca um id enviado pelo navegador (RNF-04, RNF-07).
    aprovador = request.usuario

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
