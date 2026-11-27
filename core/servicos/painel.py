"""Painel de prontidão (Visão Geral).

Responde à pergunta do dia a dia da Segurança do Trabalho: "a equipe está
protegida para trabalhar hoje?". Tudo é calculado das entregas, das
políticas de fornecimento, das habilitações (NRs) e do estoque — sem
números fixos.

Blocos:
- prontidão: situação de cada pessoa ativa que usa EPI ou tem NR (troca de EPI e NRs);
- ações: o que está parado esperando alguém (por perfil);
- radar de NRs: vencidas e que vencem nos próximos 60 dias;
- cobertura: em quantos dias cada EPI acaba no ritmo de consumo atual;
- pulso: pedidos e entregas de hoje, por hora.
"""
from datetime import date, timedelta

from django.db.models import Sum
from django.utils import timezone

from ..models import Entrega, EstoqueTotem, Solicitacao, Usuario
from . import estados
from .rh import obter_ficha_rh  # rh antes de elegibilidade: os dois módulos se importam (ciclo já existente)
from .elegibilidade import regra_para  # noqa: I001

AVISO_TROCA_DIAS = 7       # troca de EPI que vence nesta janela entra como "vence em breve"
AVISO_NR_DIAS = 30         # NR que vence nesta janela entra como "vence em breve"
RADAR_NR_DIAS = 60         # horizonte do radar de NRs
PRAZO_REPOSICAO_DIAS = 7   # referência de reposição usada na cobertura do estoque
JANELA_CONSUMO_DIAS = 30   # base do consumo médio diário

# Ordem de gravidade: a pior situação da pessoa é a que conta.
# NR vencida vem primeiro: sem a habilitação válida a pessoa nem pode fazer a atividade de risco.
SITUACOES = [
    ("nr_vencida", "NR vencida"),
    ("troca_vencida", "Troca de EPI vencida"),
    ("troca_vencendo", f"Troca vence em até {AVISO_TROCA_DIAS} dias"),
    ("nr_vencendo", f"NR vence em até {AVISO_NR_DIAS} dias"),
    ("em_dia", "Em dia"),
]


def _data(iso):
    try:
        return date.fromisoformat(iso)
    except (TypeError, ValueError):
        return None


def _avaliar_colaborador(colaborador, ultimas_entregas, hoje):
    """Devolve (situação, pendências) de um colaborador."""
    pendencias = []

    for produto, ultima in ultimas_entregas.get(colaborador.id, {}).values():
        periodicidade = regra_para(colaborador, produto).periodicidade_dias
        if not periodicidade:
            continue
        vence = timezone.localtime(ultima).date() + timedelta(days=periodicidade)
        dias = (vence - hoje).days
        if dias < 0:
            pendencias.append({"tipo": "troca_vencida", "dias": dias,
                               "texto": f"{produto.nome}: troca vencida há {-dias} dia(s)"})
        elif dias <= AVISO_TROCA_DIAS:
            pendencias.append({"tipo": "troca_vencendo", "dias": dias,
                               "texto": f"{produto.nome}: troca em {dias} dia(s)"})

    for hab in obter_ficha_rh(colaborador).get("habilitacoes") or []:
        validade = _data(hab.get("validade"))
        if validade is None:
            continue
        dias = (validade - hoje).days
        if dias < 0:
            pendencias.append({"tipo": "nr_vencida", "dias": dias,
                               "texto": f"{hab['nome']} vencida há {-dias} dia(s)"})
        elif dias <= AVISO_NR_DIAS:
            pendencias.append({"tipo": "nr_vencendo", "dias": dias,
                               "texto": f"{hab['nome']} vence em {dias} dia(s)"})

    ordem = [codigo for codigo, _ in SITUACOES]
    pendencias.sort(key=lambda p: (ordem.index(p["tipo"]), p["dias"]))
    situacao = pendencias[0]["tipo"] if pendencias else "em_dia"
    return situacao, pendencias


def _prontidao(hoje):
    ativos = list(Usuario.objects.filter(ativo=True).select_related("setor").order_by("nome"))

    # Última entrega de cada EPI por pessoa (uma consulta só)
    ultimas = {}
    for e in (Entrega.objects.filter(eh_epi=True, colaborador__in=ativos)
              .select_related("produto").order_by("data")):
        ultimas.setdefault(e.colaborador_id, {})[e.produto_id] = (e.produto, e.data)

    # Entra no painel quem usa EPI ou tem NR: todo colaborador do totem e também quem tem
    # perfil administrativo (supervisor, técnico...) mas recebeu EPI ou tem habilitação cadastrada.
    colaboradores = [
        u for u in ativos
        if u.perfil == "COLABORADOR" or u.id in ultimas or obter_ficha_rh(u).get("habilitacoes")
    ]

    contagem = {codigo: 0 for codigo, _ in SITUACOES}   # pela pior situação (soma o total: usado na barra)
    com_pendencia = {codigo: 0 for codigo, _ in SITUACOES}  # quem tem cada tipo de pendência (usado na legenda)
    atencao = []
    for colaborador in colaboradores:
        situacao, pendencias = _avaliar_colaborador(colaborador, ultimas, hoje)
        contagem[situacao] += 1
        for tipo in {p["tipo"] for p in pendencias} or {"em_dia"}:
            com_pendencia[tipo] += 1
        if pendencias:
            atencao.append({
                "id": str(colaborador.id),
                "nome": colaborador.nome,
                "cargo": colaborador.cargo or "",
                "setor": colaborador.setor.nome if colaborador.setor else "",
                "situacao": situacao,
                "pendencias": [p["texto"] for p in pendencias],
            })

    total = len(colaboradores)
    ordem = [codigo for codigo, _ in SITUACOES]
    atencao.sort(key=lambda a: ordem.index(a["situacao"]))
    return {
        "total": total,
        "em_dia": contagem["em_dia"],
        "percentual": round(100 * contagem["em_dia"] / total) if total else None,
        "faixas": [{"codigo": c, "rotulo": r, "quantidade": contagem[c], "pessoas": com_pendencia[c]}
                   for c, r in SITUACOES],
        "atencao": atencao,
    }, colaboradores


def _idade(momento, agora):
    minutos = int((agora - momento).total_seconds() // 60)
    if minutos < 60:
        return f"há {max(minutos, 1)} min"
    horas = minutos // 60
    if horas < 24:
        return f"há {horas} h"
    return f"há {horas // 24} dia(s)"


def _acoes(usuario_acoes, atencao, agora):
    """Fila do que está parado, mais antigo primeiro, conforme o que o perfil pode fazer."""
    itens = []
    if "decidir" in usuario_acoes:
        for s in (Solicitacao.objects.filter(status__in=estados.ESTADOS_AGUARDANDO)
                  .select_related("solicitante").order_by("data_solicitacao")[:4]):
            itens.append({
                "tipo": "aprovar",
                "titulo": f"{s.codigo} aguarda análise {_idade(s.data_solicitacao, agora)}",
                "detalhe": f"{s.solicitante.nome} · {s.motivo_categoria or 'Solicitação'}",
                "link": f"solicitacao.html?id={s.id}",
                "acao": "Analisar",
                "minutos": (agora - s.data_solicitacao).total_seconds() / 60,
            })
    if "entregar" in usuario_acoes:
        for s in (Solicitacao.objects.filter(status__in=estados.ESTADOS_APROVADOS)
                  .select_related("solicitante").order_by("data_solicitacao")[:3]):
            itens.append({
                "tipo": "entregar",
                "titulo": f"{s.codigo} aprovada, aguardando retirada",
                "detalhe": f"{s.solicitante.nome} · {_idade(s.data_solicitacao, agora)}",
                "link": "entregas.html",
                "acao": "Entregar",
                "minutos": (agora - s.data_solicitacao).total_seconds() / 60,
            })
    itens.sort(key=lambda i: -i["minutos"])
    for i in itens:
        i.pop("minutos")

    # Pessoas com troca vencida ou NR vencida vêm depois da fila operacional
    for pessoa in [a for a in atencao if a["situacao"] in ("nr_vencida", "troca_vencida")][:3]:
        itens.append({
            "tipo": "risco",
            "titulo": f"{pessoa['nome']} · {' · '.join(pessoa['pendencias'][:2])}",
            "detalhe": " · ".join(filter(None, [pessoa["cargo"], pessoa["setor"]])),
            "link": f"funcionarios.html?abrir={pessoa['id']}",
            "acao": "Ver funcionário",
        })
    return itens[:6]


def _radar_nrs(colaboradores, hoje):
    pontos = []
    for colaborador in colaboradores:
        for hab in obter_ficha_rh(colaborador).get("habilitacoes") or []:
            validade = _data(hab.get("validade"))
            if validade is None:
                continue
            dias = (validade - hoje).days
            if dias <= RADAR_NR_DIAS:
                pontos.append({
                    "nr": hab["nome"],
                    "pessoa": colaborador.nome,
                    "dias": dias,
                    "validade": validade.strftime("%d/%m/%Y"),
                })
    pontos.sort(key=lambda p: p["dias"])
    return {"horizonte_dias": RADAR_NR_DIAS, "pontos": pontos}


def _cobertura(agora):
    inicio = agora - timedelta(days=JANELA_CONSUMO_DIAS)
    consumo = dict(
        Entrega.objects.filter(data__gte=inicio).values_list("produto_id").annotate(total=Sum("quantidade"))
    )
    saldos = {}
    for est in EstoqueTotem.objects.filter(produto__ativo=True).select_related("produto"):
        nome, livre = saldos.get(est.produto_id, (est.produto.nome, 0))
        saldos[est.produto_id] = (nome, livre + max(est.livre, 0))

    itens = []
    for produto_id, (nome, livre) in saldos.items():
        media_dia = (consumo.get(produto_id) or 0) / JANELA_CONSUMO_DIAS
        dias = round(livre / media_dia) if media_dia else None
        itens.append({"produto": nome, "saldo_livre": livre, "dias": dias,
                      "consumo_dia": round(media_dia, 1)})
    # Primeiro o que acaba antes; produtos sem consumo no período ficam por último
    itens.sort(key=lambda i: (i["dias"] is None, i["dias"] if i["dias"] is not None else 0, i["produto"]))
    return {"prazo_reposicao_dias": PRAZO_REPOSICAO_DIAS, "janela_dias": JANELA_CONSUMO_DIAS, "itens": itens[:6]}


def _pulso(agora):
    inicio = agora.replace(hour=0, minute=0, second=0, microsecond=0)
    pedidos = [0] * 24
    entregas = [0] * 24
    for momento in Solicitacao.objects.filter(data_solicitacao__gte=inicio).values_list("data_solicitacao", flat=True):
        pedidos[timezone.localtime(momento).hour] += 1
    for momento in Entrega.objects.filter(data__gte=inicio).values_list("data", flat=True):
        entregas[timezone.localtime(momento).hour] += 1
    return {"hora_atual": agora.hour, "pedidos": pedidos, "entregas": entregas}


def montar_painel(usuario_acoes):
    agora = timezone.localtime()
    hoje = agora.date()
    prontidao, colaboradores = _prontidao(hoje)
    return {
        "atualizado_em": agora.strftime("%H:%M"),
        "data": hoje.strftime("%d/%m/%Y"),
        "prontidao": prontidao,
        "acoes": _acoes(usuario_acoes, prontidao["atencao"], agora),
        "radar_nrs": _radar_nrs(colaboradores, hoje),
        "cobertura": _cobertura(agora),
        "pulso": _pulso(agora),
    }
