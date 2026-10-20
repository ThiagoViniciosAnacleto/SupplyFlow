"""Controle de acesso por perfil (RF-09, RNF-04).

Cada perfil recebe um conjunto de AÇÕES. As views declaram a ação que exigem
(@api_backoffice("decidir"), @pagina_backoffice("pessoas")...) e o servidor
confere — o que o navegador esconde ou mostra é só conveniência.
"""
from functools import wraps
from urllib.parse import quote

from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

PERFIS = {
    "ADMIN": "Administrador",
    "GESTOR": "Gestor / Supervisor",
    "TECNICO_SEGURANCA": "Técnico de Segurança",
    "OPERADOR": "Almoxarife",
    "COMPRADOR": "Comprador",
    "COLABORADOR": "Colaborador",
}

DESCRICAO_ACESSO = {
    "ADMIN": "Acesso geral ao sistema.",
    "GESTOR": "Aprovações e acompanhamento da equipe.",
    "TECNICO_SEGURANCA": "Análise de solicitações e segurança do trabalho.",
    "OPERADOR": "Estoque, entregas e devoluções.",
    "COMPRADOR": "Produtos, fornecedores e reposição.",
    "COLABORADOR": "Autoatendimento e consulta de retiradas.",
}

# Ações liberadas para cada perfil. "ver" = consultar telas do backoffice.
ACOES = {
    "ADMIN": {"ver", "decidir", "entregar", "devolucao", "estoque", "produtos", "pessoas", "auditoria", "ia"},
    "GESTOR": {"ver", "decidir", "devolucao", "ia"},
    "TECNICO_SEGURANCA": {"ver", "decidir", "devolucao", "ia"},
    "OPERADOR": {"ver", "entregar", "devolucao", "estoque"},
    "COMPRADOR": {"ver", "estoque", "produtos"},
    "COLABORADOR": set(),  # colaborador só usa o totem
}

PERFIS_BACKOFFICE = {p for p, acoes in ACOES.items() if "ver" in acoes}


def acoes_do_perfil(perfil):
    return ACOES.get((perfil or "").upper(), set())


def pode(usuario, acao):
    return usuario is not None and usuario.ativo and acao in acoes_do_perfil(usuario.perfil)


def usuario_da_requisicao(request):
    """Usuário do SupplyFlow ligado à conta logada (ou None)."""
    conta = getattr(request, "user", None)
    if not conta or not conta.is_authenticated:
        return None
    usuario = getattr(conta, "usuario", None)
    if usuario is None or not usuario.ativo or usuario.perfil not in PERFIS_BACKOFFICE:
        return None
    return usuario


def api_backoffice(acao="ver"):
    """Protege uma API do backoffice: 401 sem login, 403 sem permissão.
    Disponibiliza o usuário logado em request.usuario."""

    def decorador(view):
        @wraps(view)
        def protegida(request, *args, **kwargs):
            usuario = usuario_da_requisicao(request)
            if usuario is None:
                return JsonResponse({"erro": "Sessão expirada. Entre novamente."}, status=401)
            if not pode(usuario, acao):
                return JsonResponse({"erro": "Seu perfil não tem permissão para esta ação."}, status=403)
            request.usuario = usuario
            return view(request, *args, **kwargs)

        return protegida

    return decorador


def pagina_backoffice(acao="ver"):
    """Protege uma página do backoffice: sem login volta ao login; sem permissão, 403."""

    def decorador(view):
        @wraps(view)
        @ensure_csrf_cookie
        def protegida(request, *args, **kwargs):
            usuario = usuario_da_requisicao(request)
            if usuario is None:
                return redirect("/?proximo=" + quote(request.get_full_path()))
            if not pode(usuario, acao):
                return render(request, "acesso-negado.html", status=403)
            request.usuario = usuario
            return view(request, *args, **kwargs)

        return protegida

    return decorador
