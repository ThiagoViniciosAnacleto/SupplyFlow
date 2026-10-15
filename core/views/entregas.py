"""APIs de entregas e devoluções."""
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
            "data": fmt(s.data_solicitacao, "%d/%m/%Y às %H:%M"),
            "data_conclusao": fmt(s.data_conclusao, "%d/%m/%Y às %H:%M") if s.data_conclusao else "Pendente",
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
            "data_solicitacao": fmt(s.data_solicitacao, "%d/%m/%Y"),
            "colaborador": s.solicitante.nome,
            "matricula": s.solicitante.codigo_matricula,
            "setor": s.solicitante.setor.nome if s.solicitante.setor else "Operações",
            "produto": p_item.produto.nome if p_item else "EPI",
            "condicao_obrigatoria": bool(tem_condicao),
            "status_devolucao": "Devolução pendente" if tem_condicao and s.status != "RETIRADA" else "Dispensada / Concluída",
            "observacao": decisao.justificativa_decisao if decisao else "Sem restrição de devolução.",
        })
    return JsonResponse({"devolucoes": resultado})
