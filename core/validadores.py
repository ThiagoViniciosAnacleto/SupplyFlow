"""Validadores de senha próprios do SupplyFlow (usados em AUTH_PASSWORD_VALIDATORS)."""
from django.core.exceptions import ValidationError

from .seguranca import senha_legada_confere


class SenhaDiferenteDaAtual:
    """Recusa uma senha nova igual à atual (ex.: no "Esqueci minha senha").

    Não guarda histórico: só compara a senha digitada com o hash da senha que a
    conta tem agora — e também com a senha antiga em MD5 de quem ainda não fez o
    primeiro login depois da atualização. Contas sem senha (convite de primeiro
    acesso) passam direto.
    """

    mensagem = "A nova senha precisa ser diferente da senha atual."

    def validate(self, password, user=None):
        if user is None or not getattr(user, "pk", None):
            return
        if user.has_usable_password() and user.check_password(password):
            raise ValidationError(self.mensagem, code="senha_igual_a_atual")
        usuario = getattr(user, "usuario", None)
        if usuario is not None and senha_legada_confere(usuario, password):
            raise ValidationError(self.mensagem, code="senha_igual_a_atual")

    def get_help_text(self):
        return self.mensagem
