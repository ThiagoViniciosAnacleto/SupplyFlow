"""APIs de entregas e devoluções (RF-31 a RF-35, RF-40 a RF-43)."""
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..models import Devolucao, Entrega, Solicitacao
from ..permissoes import api_backoffice, pode
from ..servicos import RegraViolada, estados
from ..servicos import entregas as servico
from .util import erro, fmt, ler_json


@require_GET
@api_backoffice("ver")
def api_listar_entregas(request):
    """Pendentes de retirada (aprovadas) e entregas já confirmadas."""
    pendentes = []
    aprovadas = (
        Solicitacao.objects.filter(status__in=estados.ESTADOS_APROVADOS)
        .select_related("solicitante__setor", "totem", "decisao")
        .prefetch_related("itens__produto").order_by("data_solicitacao")
    )
    for s in aprovadas:
        item = s.itens.first()
        bloqueio = "Aguardando devolução do EPI anterior" if servico.devolucao_pendente(s) else None
        pendentes.append({
            "id": str(s.id),
            "codigo": s.codigo,
            "data": fmt(s.data_solicitacao, "%d/%m/%Y %H:%M"),
            "colaborador": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "—",
            "produto": item.produto.nome if item else "—",
            "quantidade": (item.quantidade_aprovada or item.quantidade_solicitada) if item else 0,
            "totem": s.totem.nome if s.totem else "—",
            "status_rotulo": estados.rotulo(s.status),
            "bloqueio": bloqueio,
        })

    confirmadas = [
        {
            "id": str(e.id),
            "codigo": e.solicitacao.codigo,
            "data": fmt(e.data, "%d/%m/%Y %H:%M"),
            "colaborador": e.colaborador.nome,
            "matricula": e.colaborador.codigo_matricula,
            "setor": e.setor_nome or "—",
            "centro_custo": e.centro_custo or "—",
            "produto": e.produto_nome,
            "quantidade": e.quantidade,
            "lote": e.lote or "—",
            "ca": e.ca or "—",
            "almoxarife": e.almoxarife.nome if e.almoxarife else "—",
            "totem": e.totem.nome if e.totem else "—",
        }
        for e in Entrega.objects.select_related("solicitacao", "colaborador", "almoxarife", "totem")[:200]
    ]
    return JsonResponse({"pendentes": pendentes, "entregas": confirmadas,
                         "pode_entregar": pode(request.usuario, "entregar")})


@require_POST
@api_backoffice("entregar")
def api_confirmar_entrega(request, solicitacao_id):
    """O almoxarife confirma a entrega física: baixa no estoque e registro da entrega (RF-40 a RF-42)."""
    s = Solicitacao.objects.filter(id=solicitacao_id).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)
    try:
        s, entregas = servico.confirmar_entrega(s, request.usuario)
    except RegraViolada as e:
        return erro(str(e), status=e.status)
    registrar(request, "ENTREGA_CONFIRMADA", s, f"{s.codigo} entregue a {s.solicitante.nome}",
              itens=[{"produto": e.produto_nome, "quantidade": e.quantidade, "lote": e.lote} for e in entregas])
    return JsonResponse({"sucesso": True, "mensagem": f"Entrega da solicitação {s.codigo} confirmada."})


@require_GET
@api_backoffice("ver")
def api_listar_devolucoes(request):
    """Devoluções exigidas nas aprovações condicionadas: pendentes e já resolvidas."""
    exigidas = (
        Solicitacao.objects.filter(decisao__exige_devolucao=True)
        .select_related("solicitante__setor", "decisao", "decisao__aprovador")
        .prefetch_related("itens__produto").order_by("-data_solicitacao")
    )
    resultado = []
    for s in exigidas:
        item = s.itens.first()
        devolucao = Devolucao.objects.filter(solicitacao=s).select_related(
            "registrado_por", "entrega_original__solicitacao").first()
        encerrada = estados.normalizar(s.status) in {estados.REPROVADA, estados.CANCELADA}
        if devolucao:
            situacao = "dispensada" if devolucao.dispensada else "registrada"
        else:
            situacao = "encerrada" if encerrada else "pendente"
        resultado.append({
            "id": str(s.id),
            "codigo": s.codigo,
            "data_solicitacao": fmt(s.data_solicitacao, "%d/%m/%Y"),
            "colaborador": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "—",
            "produto": item.produto.nome if item else "—",
            "condicao_aprovacao": s.decisao.justificativa_decisao or "Devolução do EPI anterior",
            "aprovado_por": s.decisao.aprovador.nome if s.decisao.aprovador else "—",
            "situacao": situacao,
            "condicao": devolucao.get_condicao_display() if devolucao and devolucao.condicao else None,
            "destinacao": devolucao.get_destinacao_display() if devolucao and devolucao.destinacao else None,
            "observacao": devolucao.observacao if devolucao else None,
            "entrega_original": (devolucao.entrega_original.solicitacao.codigo
                                 if devolucao and devolucao.entrega_original else None),
            "registrado_por": devolucao.registrado_por.nome if devolucao and devolucao.registrado_por else None,
            "data_registro": fmt(devolucao.data, "%d/%m/%Y %H:%M") if devolucao else None,
        })
    return JsonResponse({
        "devolucoes": resultado,
        "condicoes": [{"valor": v, "rotulo": r} for v, r in Devolucao.CONDICOES],
        "destinacoes": [{"valor": v, "rotulo": r} for v, r in Devolucao.DESTINACOES],
        "pode_registrar": pode(request.usuario, "devolucao"),
        "pode_dispensar": pode(request.usuario, "decidir"),
    })


@require_POST
@api_backoffice("devolucao")
def api_registrar_devolucao(request, solicitacao_id):
    """Registra a devolução (condição e destinação) ou a dispensa formal (RF-31 a RF-35)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    s = Solicitacao.objects.filter(id=solicitacao_id).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)
    try:
        devolucao = servico.registrar_devolucao(
            s, request.usuario,
            condicao=dados.get("condicao") or "",
            destinacao=dados.get("destinacao") or "",
            observacao=dados.get("observacao") or "",
            dispensar=bool(dados.get("dispensar")),
        )
    except RegraViolada as e:
        return erro(str(e), status=e.status)
    acao = "DEVOLUCAO_DISPENSADA" if devolucao.dispensada else "DEVOLUCAO_REGISTRADA"
    registrar(request, acao, s, f"{s.codigo}: {'devolução dispensada' if devolucao.dispensada else 'EPI devolvido'}",
              condicao=devolucao.condicao, destinacao=devolucao.destinacao)
    return JsonResponse({"sucesso": True, "mensagem": "Devolução dispensada." if devolucao.dispensada
                         else "Devolução registrada. A entrega do novo EPI está liberada."})
