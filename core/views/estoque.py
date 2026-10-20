"""APIs de estoque dos totens (RF-36 a RF-38, RF-45, RNF-08)."""
from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..models import EstoqueTotem, MovimentacaoEstoque, Totem
from ..permissoes import api_backoffice, pode
from ..servicos import RegraViolada
from ..servicos import estoque as servico
from .util import EntradaInvalida, erro, fmt, inteiro, ler_json, texto


@require_GET
@api_backoffice("ver")
def api_listar_estoque(request):
    """Saldo por totem: disponível, reservado para aprovações e livre."""
    resultado = []
    criticos = zerados = 0
    for e in EstoqueTotem.objects.select_related("totem", "produto", "produto__categoria").order_by(
        "totem__codigo", "produto__nome"
    ):
        if e.quantidade_disponivel <= 0:
            situacao = "zerado"
            zerados += 1
        elif e.quantidade_disponivel <= e.quantidade_minima:
            situacao = "critico"
            criticos += 1
        else:
            situacao = "normal"
        resultado.append({
            "id": str(e.id),
            "totem_codigo": e.totem.codigo,
            "totem_nome": e.totem.nome,
            "produto_id": str(e.produto.id),
            "produto_sku": e.produto.sku,
            "produto_nome": e.produto.nome,
            "categoria": e.produto.categoria.nome if e.produto.categoria else "—",
            "quantidade_disponivel": e.quantidade_disponivel,
            "quantidade_reservada": e.quantidade_reservada,
            "quantidade_livre": max(e.livre, 0),
            "quantidade_minima": e.quantidade_minima,
            "lote": e.lote or "—",
            "slot_posicao": e.slot_posicao or "—",
            "status_estoque": situacao,
            "updated_at": fmt(e.updated_at, "%d/%m/%Y às %H:%M") if e.updated_at else "—",
        })

    return JsonResponse({
        "estoque": resultado,
        "totens": [{"id": str(t.id), "codigo": t.codigo, "nome": t.nome, "localizacao": t.localizacao or "—",
                    "online": t.status_online} for t in Totem.objects.order_by("codigo")],
        "resumo": {"total_registros": len(resultado), "itens_criticos": criticos, "itens_zerados": zerados},
        "pode_repor": pode(request.usuario, "estoque"),
    })


@require_POST
@api_backoffice("estoque")
def api_repor_estoque(request):
    """Registra uma entrada (recebimento) no estoque do totem (RF-36)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        quantidade = inteiro(dados.get("quantidade"), "Quantidade", minimo=1, maximo=100000)
        lote = texto(dados.get("lote"), "Lote", maximo=50)
        observacao = texto(dados.get("observacao"), "Observação", maximo=255)
    except EntradaInvalida as e:
        return erro(str(e))

    with transaction.atomic():
        e = EstoqueTotem.objects.select_for_update().select_related("produto", "totem").filter(
            id=dados.get("estoque_id")).first() if dados.get("estoque_id") else None
        if e is None:
            return erro("Item de estoque não encontrado.", status=404)
        try:
            servico.entrada(e, quantidade, request.usuario, lote=lote, observacao=observacao)
        except RegraViolada as ex:
            return erro(str(ex), status=ex.status)

    registrar(request, "ESTOQUE_ENTRADA", e, f"+{quantidade} {e.produto.nome} no {e.totem.codigo}",
              quantidade=quantidade, lote=lote, saldo=e.quantidade_disponivel)
    return JsonResponse({
        "sucesso": True,
        "mensagem": f"Entrada de {quantidade} un. de “{e.produto.nome}” no {e.totem.codigo} registrada.",
        "nova_quantidade": e.quantidade_disponivel,
    })


@require_GET
@api_backoffice("ver")
def api_movimentacoes_estoque(request):
    """Histórico de movimentações (RF-45). Filtro opcional por produto."""
    qs = MovimentacaoEstoque.objects.select_related("produto", "usuario", "solicitacao", "estoque__totem")
    produto_id = request.GET.get("produto")
    if produto_id:
        qs = qs.filter(produto_id=produto_id)
    return JsonResponse({"movimentacoes": [
        {
            "data": fmt(m.data, "%d/%m/%Y %H:%M"),
            "tipo": m.get_tipo_display(),
            "produto": m.produto.nome,
            "totem": m.estoque.totem.codigo,
            "quantidade": m.quantidade,
            "disponivel_apos": m.saldo_disponivel_apos,
            "reservado_apos": m.saldo_reservado_apos,
            "lote": m.lote or "—",
            "solicitacao": m.solicitacao.codigo if m.solicitacao else None,
            "usuario": m.usuario.nome if m.usuario else "—",
            "observacao": m.observacao,
        }
        for m in qs[:300]
    ]})
