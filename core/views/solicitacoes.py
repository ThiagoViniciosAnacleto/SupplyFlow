"""APIs do backoffice: usuários, painel (Visão Geral) e solicitações."""
from datetime import timedelta

from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..ia import CATEGORIAS
from ..models import Entrega, EstoqueTotem, Produto, Solicitacao, Usuario
from ..permissoes import ACOES, DESCRICAO_ACESSO, PERFIS, PERFIS_BACKOFFICE, api_backoffice
from ..servicos import RegraViolada, estados
from ..servicos import solicitacoes as servico
from . import serializacao
from .util import erro, fmt, gerar_iniciais, ler_json

MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _consulta_solicitacoes():
    return (
        Solicitacao.objects.select_related(
            "solicitante", "solicitante__setor", "totem", "analise_ia", "decisao", "decisao__aprovador"
        )
        .prefetch_related("itens__produto__categoria")
        .order_by("-data_solicitacao")
    )


# ============================================================================
# USUÁRIOS DO BACKOFFICE
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


# ============================================================================
# VISÃO GERAL — indicadores calculados das movimentações (RF-48)
# ============================================================================
@require_GET
@api_backoffice("ver")
def api_dashboard_kpis(request):
    aguardando = Solicitacao.objects.filter(status__in=estados.ESTADOS_AGUARDANDO).count()
    aprovadas = Solicitacao.objects.filter(status__in=estados.ESTADOS_APROVADOS)
    devolucoes_pendentes = aprovadas.filter(decisao__exige_devolucao=True, devolucao__isnull=True).count()
    estoque_baixo = EstoqueTotem.objects.filter(quantidade_disponivel__lte=F("quantidade_minima")).count()

    indicadores = [
        {"id": "produtos-cadastrados", "rotulo": "Produtos cadastrados",
         "valor": Produto.objects.filter(ativo=True).count(), "icone": "bi-box", "tom": "tom-azul"},
        {"id": "funcionarios-ativos", "rotulo": "Funcionários ativos",
         "valor": Usuario.objects.filter(ativo=True).count(), "icone": "bi-people", "tom": "tom-cinza"},
        {"id": "aguardando-aprovacao", "rotulo": "Aguardando aprovação",
         "valor": aguardando, "icone": "bi-clipboard", "tom": "tom-ambar"},
        {"id": "entregas-pendentes", "rotulo": "Entregas pendentes",
         "valor": aprovadas.count(), "icone": "bi-truck", "tom": "tom-verde"},
        {"id": "epis-devolucao", "rotulo": "EPIs aguardando devolução",
         "valor": devolucoes_pendentes, "icone": "bi-arrow-counterclockwise", "tom": "tom-indigo"},
        {"id": "estoque-baixo", "rotulo": "Produtos com estoque baixo",
         "valor": estoque_baixo, "icone": "bi-exclamation-triangle", "tom": "tom-vermelho"},
    ]

    # Entregas por mês: últimos 6 meses, contadas das entregas confirmadas
    hoje = timezone.localtime()
    meses = []
    ano, mes = hoje.year, hoje.month
    for _ in range(6):
        meses.append((ano, mes))
        mes -= 1
        if mes == 0:
            ano, mes = ano - 1, 12
    meses.reverse()
    inicio = hoje.replace(year=meses[0][0], month=meses[0][1], day=1, hour=0, minute=0, second=0, microsecond=0)
    contagem = {m: 0 for m in meses}
    for data in Entrega.objects.filter(data__gte=inicio).values_list("data", flat=True):
        local = timezone.localtime(data)
        chave = (local.year, local.month)
        if chave in contagem:
            contagem[chave] += 1

    # Consumo (R$) por centro de custo nos últimos 90 dias, a partir das entregas
    consumo = {}
    for e in Entrega.objects.filter(data__gte=timezone.now() - timedelta(days=90)).values(
        "setor_nome", "centro_custo", "quantidade", "custo_unitario"
    ):
        nome = e["setor_nome"] or "Sem setor"
        consumo[nome] = consumo.get(nome, 0) + float(e["custo_unitario"]) * e["quantidade"]
    centros = sorted(consumo, key=consumo.get, reverse=True)

    return JsonResponse({
        "indicadores": indicadores,
        "entregasPorMes": {"meses": [MESES[m - 1] for _, m in meses], "valores": [contagem[m] for m in meses]},
        "consumoPorCentro": {"centros": centros, "valores": [round(consumo[c], 2) for c in centros],
                             "periodo": "últimos 90 dias"},
    })


# ============================================================================
# SOLICITAÇÕES
# ============================================================================
@require_GET
@api_backoffice("ver")
def api_listar_solicitacoes(request):
    return JsonResponse({"solicitacoes": [serializacao.linha_lista(s) for s in _consulta_solicitacoes()]})


@require_GET
@api_backoffice("ver")
def api_detalhe_solicitacao(request, solicitacao_id):
    s = _consulta_solicitacoes().filter(id=solicitacao_id).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)
    dados = serializacao.detalhe(s)
    dados["pode_decidir"] = dados["pode_decidir"] and "decidir" in ACOES.get(request.usuario.perfil, set())
    return JsonResponse({"solicitacao": dados, "categorias": CATEGORIAS})


@require_POST
@api_backoffice("decidir")
def api_decidir_solicitacao(request, solicitacao_id):
    """Aprova, aprova com condição ou rejeita. Quem decide é o usuário logado."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    s = Solicitacao.objects.filter(id=solicitacao_id).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)

    try:
        s = servico.decidir(
            s, request.usuario,
            decisao=(dados.get("decisao") or "").strip().lower(),
            observacao=dados.get("observacao") or "",
            exige_devolucao=bool(dados.get("exige_devolucao")),
            categoria_confirmada=dados.get("categoria_confirmada") or "",
        )
    except RegraViolada as e:
        return erro(str(e), status=e.status)

    decisao = s.decisao
    registrar(request, "SOLICITACAO_DECIDIDA", s, f"{s.codigo}: {estados.rotulo(s.status)}",
              status=s.status, exige_devolucao=decisao.exige_devolucao,
              categoria_ia=decisao.categoria_ia, categoria_confirmada=decisao.categoria_confirmada)
    return JsonResponse({
        "sucesso": True,
        "mensagem": f"Solicitação {s.codigo}: {estados.rotulo(s.status)}.",
        "solicitacao": serializacao.detalhe(_consulta_solicitacoes().get(pk=s.pk)),
    })


@require_POST
@api_backoffice("decidir")
def api_cancelar_solicitacao(request, solicitacao_id):
    """Cancelamento pelo backoffice (ex.: colaborador desligado), com motivo."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    motivo = (dados.get("motivo") or "").strip()
    if not motivo:
        return erro("Informe o motivo do cancelamento.")
    s = Solicitacao.objects.filter(id=solicitacao_id).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)
    try:
        servico.cancelar(s, request.usuario, motivo)
    except RegraViolada as e:
        return erro(str(e), status=e.status)
    registrar(request, "SOLICITACAO_CANCELADA", s, f"{s.codigo} cancelada: {motivo}")
    return JsonResponse({"sucesso": True, "mensagem": f"Solicitação {s.codigo} cancelada."})


__all__ = ["api_listar_usuarios", "api_dashboard_kpis", "api_listar_solicitacoes", "api_detalhe_solicitacao",
           "api_decidir_solicitacao", "api_cancelar_solicitacao"]
