"""Funções auxiliares compartilhadas pelas views."""
from django.utils import timezone


# ============================================================================
# UTILITÁRIOS
# ============================================================================
def mapear_status_front(status_db: str, decisao=None) -> str:
    """Converte o status do banco para a chave CSS esperada pelo frontend."""
    status_db = (status_db or "").upper()
    if status_db in ("PENDENTE", "EM_ANALISE_IA", "AGUARDANDO_DECISAO"):
        return "aguardando"
    if status_db == "APROVADA":
        if decisao and decisao.justificativa_decisao and "devolu" in decisao.justificativa_decisao.lower():
            return "aprovada-condicao"
        return "aprovada"
    if status_db in ("REPROVADA", "CANCELADA"):
        return "rejeitada"
    if status_db == "RETIRADA":
        return "entregue"
    return "aguardando"


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
