"""Envio de e-mail resiliente para ambientes em nuvem (como Render Free).

Ordem de tentativa:
1. BREVO_API_KEY  -> envia via HTTPS (porta 443) na API da Brevo (funciona no Render Free).
2. RESEND_API_KEY -> envia via HTTPS (porta 443) na API do Resend (funciona no Render Free).
3. EMAIL_HOST     -> tenta SMTP com timeout curto (5 s); se a rede bloquear a porta 587/465,
                     imprime o e-mail (e o link de senha) nos logs do servidor sem derrubar a requisição.
4. Sem configuração -> imprime o e-mail nos logs/terminal (ConsoleEmailBackend).
"""
import json
import sys
import urllib.error
import urllib.request
from email.utils import parseaddr

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend
from django.core.mail.backends.console import EmailBackend as ConsoleEmailBackend
from django.core.mail.backends.smtp import EmailBackend as SmtpEmailBackend


def _remetente(endereco):
    nome, email = parseaddr(endereco or settings.DEFAULT_FROM_EMAIL)
    if not email:
        email = endereco or "nao-responda@supplyflow.local"
    return nome or "SupplyFlow", email


def _enviar_brevo(mensagem, chave_api):
    nome_rem, email_rem = _remetente(mensagem.from_email)
    carga = {
        "sender": {"name": nome_rem, "email": email_rem},
        "to": [{"email": dest} for dest in mensagem.to],
        "subject": mensagem.subject,
        "textContent": mensagem.body,
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(carga).encode("utf-8"),
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "api-key": chave_api,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return 200 <= resp.status < 300


def _enviar_resend(mensagem, chave_api):
    nome_rem, email_rem = _remetente(mensagem.from_email)
    carga = {
        "from": f"{nome_rem} <{email_rem}>",
        "to": list(mensagem.to),
        "subject": mensagem.subject,
        "text": mensagem.body,
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(carga).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {chave_api}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return 200 <= resp.status < 300


class BackendEmailResiliente(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        brevo_key = getattr(settings, "BREVO_API_KEY", "")
        resend_key = getattr(settings, "RESEND_API_KEY", "")

        if brevo_key:
            enviados = 0
            for msg in email_messages:
                try:
                    if _enviar_brevo(msg, brevo_key):
                        enviados += 1
                except Exception as exc:
                    print(f"[SupplyFlow E-mail] Falha na API Brevo ({exc}); exibindo no log:", file=sys.stderr)
                    ConsoleEmailBackend(stream=sys.stdout).send_messages([msg])
                    enviados += 1
            return enviados

        if resend_key:
            enviados = 0
            for msg in email_messages:
                try:
                    if _enviar_resend(msg, resend_key):
                        enviados += 1
                except Exception as exc:
                    print(f"[SupplyFlow E-mail] Falha na API Resend ({exc}); exibindo no log:", file=sys.stderr)
                    ConsoleEmailBackend(stream=sys.stdout).send_messages([msg])
                    enviados += 1
            return enviados

        if getattr(settings, "EMAIL_HOST", ""):
            try:
                smtp = SmtpEmailBackend(
                    host=settings.EMAIL_HOST,
                    port=settings.EMAIL_PORT,
                    username=settings.EMAIL_HOST_USER,
                    password=settings.EMAIL_HOST_PASSWORD,
                    use_tls=settings.EMAIL_USE_TLS,
                    timeout=getattr(settings, "EMAIL_TIMEOUT", 5),
                    fail_silently=False,
                )
                return smtp.send_messages(email_messages)
            except Exception as exc:
                print(
                    f"[SupplyFlow E-mail] Porta SMTP bloqueada ou inacessível ({exc}). "
                    "Exibindo o e-mail e o link de redefinição diretamente no log:",
                    file=sys.stderr,
                )
                ConsoleEmailBackend(stream=sys.stdout).send_messages(email_messages)
                return len(email_messages)

        return ConsoleEmailBackend(stream=sys.stdout).send_messages(email_messages)

