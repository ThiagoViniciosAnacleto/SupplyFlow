"""Funções auxiliares compartilhadas pelas views."""
import json
from decimal import Decimal, InvalidOperation

from django.http import JsonResponse
from django.utils import timezone


def fmt(dt, padrao):
    """Formata data/hora no fuso do sistema (America/Sao_Paulo), não em UTC."""
    if not dt:
        return None
    return timezone.localtime(dt).strftime(padrao)


def gerar_iniciais(nome: str) -> str:
    partes = nome.strip().split()
    if len(partes) >= 2:
        return f"{partes[0][0]}{partes[-1][0]}".upper()
    elif partes:
        return partes[0][:2].upper()
    return "SF"


# ---------------------------------------------------------------------------
# Leitura e validação da entrada (RNF-11: erro claro em vez de erro 500)
# ---------------------------------------------------------------------------
class EntradaInvalida(Exception):
    """Erro de validação com mensagem pronta para mostrar ao usuário."""


def erro(mensagem, status=400, **extra):
    return JsonResponse({"sucesso": False, "erro": mensagem, **extra}, status=status)


def ler_json(request):
    """Devolve (dados, None) ou (None, resposta_de_erro)."""
    try:
        dados = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None, erro("Dados enviados em formato inválido.")
    if not isinstance(dados, dict):
        return None, erro("Dados enviados em formato inválido.")
    return dados, None


def inteiro(valor, campo, minimo=None, maximo=None, padrao=None):
    if valor in (None, "") and padrao is not None:
        return padrao
    try:
        numero = int(str(valor).strip())
    except (TypeError, ValueError):
        raise EntradaInvalida(f"{campo}: informe um número inteiro.")
    if minimo is not None and numero < minimo:
        raise EntradaInvalida(f"{campo}: o mínimo é {minimo}.")
    if maximo is not None and numero > maximo:
        raise EntradaInvalida(f"{campo}: o máximo é {maximo}.")
    return numero


def decimal(valor, campo, minimo=None, padrao=None):
    if valor in (None, "") and padrao is not None:
        return Decimal(padrao)
    try:
        numero = Decimal(str(valor).strip().replace(",", "."))
    except (InvalidOperation, TypeError, ValueError):
        raise EntradaInvalida(f"{campo}: informe um valor numérico.")
    if not numero.is_finite():
        raise EntradaInvalida(f"{campo}: informe um valor numérico.")
    if minimo is not None and numero < Decimal(minimo):
        raise EntradaInvalida(f"{campo}: o mínimo é {minimo}.")
    return numero


def texto(valor, campo, obrigatorio=False, maximo=None):
    valor = (valor or "").strip() if isinstance(valor, str) or valor is None else str(valor).strip()
    if obrigatorio and not valor:
        raise EntradaInvalida(f"{campo} é obrigatório.")
    if maximo and len(valor) > maximo:
        raise EntradaInvalida(f"{campo}: no máximo {maximo} caracteres.")
    return valor
