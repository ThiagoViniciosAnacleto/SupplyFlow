"""Login, logout e sessão do backoffice (RF-08, RNF-03)."""
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.views import PasswordResetConfirmView
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..contas import garantir_conta
from ..models import Usuario
from ..permissoes import DESCRICAO_ACESSO, PERFIS, PERFIS_BACKOFFICE, acoes_do_perfil, usuario_da_requisicao
from ..seguranca import bloqueado, limpar_falhas, registrar_falha, senha_legada_confere
from .util import gerar_iniciais, ler_json

MENSAGEM_FALHA = "E-mail ou senha incorretos."


def dados_da_sessao(usuario):
    """O que o front precisa saber sobre quem está logado (sem dados sensíveis)."""
    return {
        "id": str(usuario.id),
        "nome": usuario.nome,
        "iniciais": gerar_iniciais(usuario.nome),
        "email": usuario.email,
        "matricula": usuario.codigo_matricula,
        "perfil_codigo": usuario.perfil,
        "perfil": PERFIS.get(usuario.perfil, usuario.perfil),
        "cargo": usuario.cargo,
        "acesso": DESCRICAO_ACESSO.get(usuario.perfil, ""),
        "acoes": sorted(acoes_do_perfil(usuario.perfil)),
    }


@require_POST
def api_login(request):
    """Autentica o backoffice por e-mail + senha e abre a sessão no servidor."""
    dados, erro = ler_json(request)
    if erro:
        return erro

    email = (dados.get("email") or "").strip().lower()
    senha = dados.get("senha") or ""
    if not email or not senha:
        return JsonResponse({"autenticado": False, "erro": "Informe e-mail e senha."}, status=400)

    if bloqueado("login", email):
        return JsonResponse(
            {"autenticado": False, "erro": "Muitas tentativas. Aguarde 15 minutos e tente de novo."},
            status=429,
        )

    usuario = (
        Usuario.objects.filter(email__iexact=email, ativo=True, perfil__in=PERFIS_BACKOFFICE)
        .select_related("conta")
        .first()
    )
    conta = None
    if usuario:
        conta = garantir_conta(usuario)
        if conta is not None and not conta.has_usable_password() and senha_legada_confere(usuario, senha):
            # Senha antiga em MD5 correta: passa para o hash forte e apaga o MD5.
            conta.set_password(senha)
            conta.save(update_fields=["password"])
            usuario.senha_hash = None
            usuario.save(update_fields=["senha_hash"])
        if conta is not None:
            conta = authenticate(request, username=conta.username, password=senha)

    if conta is None:
        registrar_falha("login", email)
        registrar(request, "LOGIN_FALHOU", descricao=f"Tentativa de login para {email}", usuario=usuario)
        return JsonResponse({"autenticado": False, "erro": MENSAGEM_FALHA}, status=401)

    limpar_falhas("login", email)
    login(request, conta)
    usuario.ultimo_acesso = timezone.now()
    usuario.save(update_fields=["ultimo_acesso"])
    registrar(request, "LOGIN", usuario, "Entrou no backoffice", usuario=usuario)
    return JsonResponse({"autenticado": True, "usuario": dados_da_sessao(usuario)})


@require_POST
def api_logout(request):
    usuario = usuario_da_requisicao(request)
    if usuario:
        registrar(request, "LOGOUT", usuario, "Saiu do backoffice", usuario=usuario)
    logout(request)
    return JsonResponse({"sucesso": True})


@require_GET
def api_sessao(request):
    """Quem está logado agora. 401 se a sessão expirou."""
    usuario = usuario_da_requisicao(request)
    if usuario is None:
        return JsonResponse({"autenticado": False}, status=401)
    return JsonResponse({"autenticado": True, "usuario": dados_da_sessao(usuario)})


class RedefinirSenhaView(PasswordResetConfirmView):
    """Tela do link recebido por e-mail: a pessoa cria a própria senha."""

    template_name = "registration/nova-senha.html"
    success_url = "/senha/concluida/"

    def form_valid(self, form):
        resposta = super().form_valid(form)
        usuario = getattr(form.user, "usuario", None)
        if usuario is not None:
            usuario.senha_hash = None  # descarta qualquer hash MD5 antigo
            usuario.save(update_fields=["senha_hash"])
        registrar(self.request, "SENHA_DEFINIDA", usuario, "Senha criada/redefinida pelo link", usuario=usuario)
        return resposta


__all__ = ["api_login", "api_logout", "api_sessao", "RedefinirSenhaView"]
