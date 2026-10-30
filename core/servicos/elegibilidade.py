"""Elegibilidade para retirada (RF-12 a RF-17, RF-19) — calculada SEMPRE no servidor.

Para cada produto responde: qual regra vale para este colaborador, quanto ele já
consumiu no mês, quando foi a última entrega, se há saldo livre no totem e, se o
pedido fugir da regra, por quê (motivos de exceção).
"""
from dataclasses import dataclass, field
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from ..models import Entrega, RegraFornecimento, SolicitacaoItem
from .estados import ESTADOS_AGUARDANDO, ESTADOS_APROVADOS

ANTECIPADA = "antecipada"
ACIMA_DA_COTA = "acima_da_cota"
EXIGE_JUSTIFICATIVA = "exige_justificativa"

DESCRICAO_MOTIVO = {
    ANTECIPADA: "Substituição antecipada",
    ACIMA_DA_COTA: "Limite mensal excedido",
    EXIGE_JUSTIFICATIVA: "Produto exige justificativa",
}

PREFIXO_FUNCIONARIO = "MAT:"


@dataclass
class Regra:
    limite_mensal: int | None
    periodicidade_dias: int | None
    origem: str  # texto para a tela: "Funcionário: ...", "Função: Soldador", "Setor: Manutenção", "Padrão do produto"


@dataclass
class Avaliacao:
    produto: object
    regra: Regra
    consumido_mes: int = 0
    saldo_cota: int | None = None
    ultima_entrega: object = None
    proxima_regular: object = None
    saldo_livre_totem: int = 0
    tem_pendente: bool = False
    motivos: list = field(default_factory=list)

    @property
    def excepcional(self):
        return bool(self.motivos)

    @property
    def motivo_principal(self):
        return DESCRICAO_MOTIVO[self.motivos[0]] if self.motivos else "Retirada regular"


def regra_para(colaborador, produto):
    """Regra mais específica: funcionário > setor+cargo > cargo > setor > padrão do produto."""
    cargo = (colaborador.cargo or "").strip()
    marcador_matricula = f"{PREFIXO_FUNCIONARIO}{(colaborador.codigo_matricula or '').strip()}"

    filtro_cargo_ou_func = Q(cargo="") | Q(cargo__iexact=marcador_matricula)
    if cargo:
        filtro_cargo_ou_func |= Q(cargo__iexact=cargo)

    candidatas = RegraFornecimento.objects.filter(produto=produto, ativo=True).filter(
        Q(setor__isnull=True) | Q(setor_id=colaborador.setor_id)
    ).filter(filtro_cargo_ou_func)

    melhor = None
    for r in candidatas:
        eh_regra_funcionario = r.cargo.upper() == marcador_matricula.upper()
        if eh_regra_funcionario:
            peso = 4 + (1 if r.setor_id else 0)
        else:
            peso = (2 if r.cargo else 0) + (1 if r.setor_id else 0)
        if melhor is None or peso > melhor[0]:
            melhor = (peso, r, eh_regra_funcionario)

    if melhor:
        _, r, eh_regra_funcionario = melhor
        partes = []
        if r.setor_id:
            partes.append(f"Setor: {r.setor.nome}")
        if eh_regra_funcionario:
            partes.append(f"Funcionário: {colaborador.nome} ({colaborador.codigo_matricula})")
        elif r.cargo:
            partes.append(f"Função: {r.cargo}")
        return Regra(
            limite_mensal=r.limite_mensal if r.limite_mensal is not None else produto.limite_padrao_mensal,
            periodicidade_dias=r.periodicidade_dias if r.periodicidade_dias is not None else produto.periodicidade_dias,
            origem=" · ".join(partes) or "Política geral",
        )
    return Regra(produto.limite_padrao_mensal, produto.periodicidade_dias, "Padrão do produto")


def consumo_no_mes(colaborador, produto, agora=None):
    """Quantidade aprovada ou entregue neste mês (as aprovadas já ocupam a cota)."""
    agora = agora or timezone.now()
    inicio = timezone.localtime(agora).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    itens = SolicitacaoItem.objects.filter(
        solicitacao__solicitante=colaborador,
        produto=produto,
        solicitacao__data_solicitacao__gte=inicio,
        solicitacao__status__in=list(ESTADOS_APROVADOS) + ["RETIRADA"],
    )
    total = 0
    for item in itens.only("quantidade_aprovada", "quantidade_solicitada"):
        total += item.quantidade_aprovada if item.quantidade_aprovada is not None else item.quantidade_solicitada
    return total


def ultima_entrega(colaborador, produto):
    return Entrega.objects.filter(colaborador=colaborador, produto=produto).order_by("-data").first()


def avaliar(colaborador, produto, quantidade=1, estoque=None, agora=None):
    agora = agora or timezone.now()
    regra = regra_para(colaborador, produto)
    av = Avaliacao(produto=produto, regra=regra)

    av.saldo_livre_totem = max(estoque.livre, 0) if estoque else 0
    av.tem_pendente = SolicitacaoItem.objects.filter(
        solicitacao__solicitante=colaborador, produto=produto,
        solicitacao__status__in=list(ESTADOS_AGUARDANDO) + list(ESTADOS_APROVADOS),
    ).exists()

    av.consumido_mes = consumo_no_mes(colaborador, produto, agora)
    if regra.limite_mensal is not None:
        av.saldo_cota = max(regra.limite_mensal - av.consumido_mes, 0)
        if av.consumido_mes + quantidade > regra.limite_mensal:
            av.motivos.append(ACIMA_DA_COTA)

    entrega = ultima_entrega(colaborador, produto)
    if entrega:
        av.ultima_entrega = entrega.data
        if produto.eh_epi and regra.periodicidade_dias:
            av.proxima_regular = entrega.data + timedelta(days=regra.periodicidade_dias)
            if agora < av.proxima_regular:
                av.motivos.insert(0, ANTECIPADA)

    if produto.requer_justificativa:
        av.motivos.append(EXIGE_JUSTIFICATIVA)
    return av
