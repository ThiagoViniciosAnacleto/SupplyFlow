"""Páginas HTML do frontend."""
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
