"""API de login."""
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
