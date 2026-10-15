"""Ciclo de vida da solicitação (RF-30): só as transições abaixo são aceitas."""
from django.utils import timezone

from . import RegraViolada

AGUARDANDO = "AGUARDANDO_DECISAO"
APROVADA = "APROVADA"
APROVADA_CONDICIONAL = "APROVADA_CONDICIONAL"
REPROVADA = "REPROVADA"
CANCELADA = "CANCELADA"
RETIRADA = "RETIRADA"

# Valores antigos ainda presentes em bancos criados antes desta versão
LEGADO_AGUARDANDO = {"PENDENTE", "EM_ANALISE_IA"}

ESTADOS_AGUARDANDO = {AGUARDANDO} | LEGADO_AGUARDANDO
ESTADOS_APROVADOS = {APROVADA, APROVADA_CONDICIONAL}
ESTADOS_FINAIS = {REPROVADA, CANCELADA, RETIRADA}

TRANSICOES = {
    AGUARDANDO: {APROVADA, APROVADA_CONDICIONAL, REPROVADA, CANCELADA},
    APROVADA: {RETIRADA, CANCELADA},
    APROVADA_CONDICIONAL: {RETIRADA, CANCELADA},
}

ROTULOS = {
    AGUARDANDO: "Aguardando aprovação",
    APROVADA: "Aprovada",
    APROVADA_CONDICIONAL: "Aprovada com condição",
    REPROVADA: "Rejeitada",
    CANCELADA: "Cancelada",
    RETIRADA: "Entregue",
}

# Chave usada pelo front-end para escolher o selo (cor) do status
CHAVE_FRONT = {
    AGUARDANDO: "aguardando",
    APROVADA: "aprovada",
    APROVADA_CONDICIONAL: "aprovada-condicao",
    REPROVADA: "rejeitada",
    CANCELADA: "cancelada",
    RETIRADA: "entregue",
}


def normalizar(status):
    status = (status or "").upper()
    return AGUARDANDO if status in LEGADO_AGUARDANDO else status


def rotulo(status):
    return ROTULOS.get(normalizar(status), status)


def chave_front(status):
    return CHAVE_FRONT.get(normalizar(status), "aguardando")


def mudar_status(solicitacao, novo):
    """Aplica a transição ou levanta RegraViolada. Não salva (quem chama salva)."""
    atual = normalizar(solicitacao.status)
    if novo not in TRANSICOES.get(atual, set()):
        raise RegraViolada(
            f"A solicitação {solicitacao.codigo} está “{rotulo(atual)}” e não pode passar para “{rotulo(novo)}”."
        )
    solicitacao.status = novo
    if novo in ESTADOS_FINAIS:
        solicitacao.data_conclusao = timezone.now()
