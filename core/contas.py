"""Contas de login do backoffice ligadas aos usuários do SupplyFlow (RF-08).

O administrador nunca define nem vê a senha de outra pessoa: ao cadastrar um
usuário com perfil administrativo, o sistema cria a conta sem senha e envia um
link para a própria pessoa criar a senha (o mesmo fluxo do "Esqueci minha senha").
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm

from .models import Usuario
from .permissoes import PERFIS_BACKOFFICE


def garantir_conta(usuario):
    """Cria/atualiza a conta de login conforme perfil, e-mail e situação do usuário.
    Devolve a conta (ou None quando o usuário não deve ter acesso ao backoffice)."""
    Conta = get_user_model()
    conta = usuario.conta
    precisa_de_conta = usuario.perfil in PERFIS_BACKOFFICE and bool(usuario.email)

    if not precisa_de_conta:
        if conta and conta.is_active:
            conta.is_active = False
            conta.save(update_fields=["is_active"])
        return None

    email = usuario.email.strip().lower()
    if conta is None:
        conta = Conta.objects.filter(username=email).first() or Conta(username=email)
        if conta.pk is None:
            conta.set_unusable_password()
    conta.username = email
    conta.email = email
    conta.first_name = usuario.nome[:150]
    conta.is_active = usuario.ativo
    conta.save()
    if usuario.conta_id != conta.pk:
        usuario.conta = conta
        usuario.save(update_fields=["conta"])
    return conta


class FormularioRedefinicao(PasswordResetForm):
    """'Esqueci minha senha': encontra o usuário pelo e-mail do cadastro do SupplyFlow,
    criando a conta se ela ainda não existir (usuários vindos do banco antigo)."""

    def get_users(self, email):
        for usuario in Usuario.objects.filter(email__iexact=email.strip(), ativo=True):
            conta = garantir_conta(usuario)
            if conta is not None and conta.is_active:
                yield conta


def enviar_link_de_senha(request, usuario):
    """Envia ao usuário o e-mail com o link para criar/redefinir a senha."""
    formulario = FormularioRedefinicao({"email": usuario.email})
    if formulario.is_valid():
        formulario.save(
            request=request,
            use_https=request.is_secure(),
            subject_template_name="registration/assunto_redefinicao.txt",
            email_template_name="registration/email_redefinicao.txt",
        )
        return True
    return False
