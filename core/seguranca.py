"""Senhas, PINs e limite de tentativas (RNF-03)."""
import hashlib
import hmac
import re

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache

TENTATIVAS_MAXIMAS = 5
BLOQUEIO_SEGUNDOS = 15 * 60

PINS_PROIBIDOS = {"0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
                  "1234", "4321", "0123", "1212"}


def _md5_legado(valor):
    return hashlib.md5(valor.encode()).hexdigest()


def eh_md5_legado(hash_salvo):
    return bool(hash_salvo) and re.fullmatch(r"[0-9a-f]{32}", hash_salvo) is not None


def validar_novo_pin(pin):
    """Devolve uma mensagem de erro ou None se o PIN for aceitável."""
    if not re.fullmatch(r"\d{4,6}", pin or ""):
        return "O PIN deve ter de 4 a 6 números."
    if pin in PINS_PROIBIDOS:
        return "PIN muito fácil de adivinhar. Escolha outro."
    return None


def definir_pin(usuario, pin):
    usuario.pin_hash = make_password(pin)


def verificar_pin(usuario, pin):
    """Confere o PIN. Se o hash ainda for o MD5 antigo e o PIN estiver certo,
    regrava com o hash forte (o colaborador nem percebe a migração)."""
    salvo = usuario.pin_hash or ""
    if eh_md5_legado(salvo):
        if hmac.compare_digest(salvo, _md5_legado(pin)):
            definir_pin(usuario, pin)
            usuario.save(update_fields=["pin_hash"])
            return True
        return False
    return bool(salvo) and check_password(pin, salvo)


def senha_legada_confere(usuario, senha):
    salvo = usuario.senha_hash or ""
    return eh_md5_legado(salvo) and hmac.compare_digest(salvo, _md5_legado(senha))


# ---------------------------------------------------------------------------
# Limite de tentativas: após 5 erros seguidos a chave fica bloqueada por 15 min.
# ---------------------------------------------------------------------------
def _chave(tipo, identificador):
    return f"tentativas:{tipo}:{identificador.lower()}"


def bloqueado(tipo, identificador):
    return cache.get(_chave(tipo, identificador), 0) >= TENTATIVAS_MAXIMAS


def registrar_falha(tipo, identificador):
    chave = _chave(tipo, identificador)
    cache.set(chave, cache.get(chave, 0) + 1, BLOQUEIO_SEGUNDOS)


def limpar_falhas(tipo, identificador):
    cache.delete(_chave(tipo, identificador))
