"""APIs de estoque dos totens."""
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
            "updated_at": fmt(e.updated_at, "%d/%m/%Y às %H:%M") if e.updated_at else "—",
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
