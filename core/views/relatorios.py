"""Suporte à gestão: histórico com filtros, ficha de EPI e relatórios (RF-43 a RF-49).

Tudo é calculado a partir dos registros reais (entregas, devoluções, movimentações
de estoque e decisões). Qualquer consulta pode ser exportada em CSV com
?formato=csv — e toda exportação fica na auditoria, porque leva dados pessoais
para fora do sistema (LGPD, RNF-05).
"""
import csv
from collections import Counter, defaultdict
from datetime import datetime, time, timedelta

from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

from ..auditoria import registrar
from ..ia import CATEGORIAS
from ..models import (DecisaoSolicitacao, Devolucao, Entrega, MovimentacaoEstoque, Produto, Setor, Solicitacao,
                      Usuario)
from ..permissoes import api_backoffice
from ..servicos import estados
from .util import erro, fmt

LIMITE = 1000
TIPOS = {
    "ENTREGA": "Entrega",
    "DEVOLUCAO": "Devolução",
    "ENTRADA": "Entrada de estoque",
    "SOLICITACAO": "Solicitação",
}


# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------
def _periodo(request, dias_padrao=None):
    """Lê ?de=AAAA-MM-DD&ate=AAAA-MM-DD. Devolve (inicio, fim) com fuso, ou levanta ValueError."""
    def ler(nome, fim_do_dia):
        valor = (request.GET.get(nome) or "").strip()
        if not valor:
            return None
        dia = datetime.strptime(valor, "%Y-%m-%d").date()
        return timezone.make_aware(datetime.combine(dia, time.max if fim_do_dia else time.min))

    inicio, fim = ler("de", False), ler("ate", True)
    if inicio is None and dias_padrao:
        inicio = timezone.now() - timedelta(days=dias_padrao)
    if inicio and fim and inicio > fim:
        raise ValueError("A data inicial é maior que a final.")
    return inicio, fim


def _no_periodo(qs, campo, inicio, fim):
    if inicio:
        qs = qs.filter(**{f"{campo}__gte": inicio})
    if fim:
        qs = qs.filter(**{f"{campo}__lte": fim})
    return qs


def _csv(request, nome, cabecalho, linhas, descricao):
    """Arquivo CSV que abre direto no Excel em português (separador ; e acentos certos)."""
    resposta = HttpResponse(content_type="text/csv; charset=utf-8")
    resposta["Content-Disposition"] = f'attachment; filename="{nome}-{timezone.localtime():%Y%m%d-%H%M}.csv"'
    resposta.write("﻿")  # BOM: faz o Excel reconhecer UTF-8
    escritor = csv.writer(resposta, delimiter=";")
    escritor.writerow(cabecalho)
    for linha in linhas:
        escritor.writerow(["" if v is None else v for v in linha])
    registrar(request, "EXPORTACAO_CSV", descricao=descricao, arquivo=nome, linhas=len(linhas),
              filtros=dict(request.GET.items()))
    return resposta


# ---------------------------------------------------------------------------
# Histórico de movimentações (RF-44, RF-45, RF-47, RF-49)
# ---------------------------------------------------------------------------
@require_GET
@api_backoffice("ver")
def api_historico(request):
    """Histórico unificado. Filtros: de, ate, tipo, funcionario (nome ou matrícula), setor,
    produto, status (da solicitação) e responsavel."""
    try:
        inicio, fim = _periodo(request)
    except ValueError as e:
        return erro(str(e) if "maior" in str(e) else "Data inválida: use AAAA-MM-DD.")
    tipo = (request.GET.get("tipo") or "").upper()
    termo = (request.GET.get("funcionario") or "").strip()
    setor_id = request.GET.get("setor") or ""
    produto_id = request.GET.get("produto") or ""
    status = (request.GET.get("status") or "").upper()
    responsavel = (request.GET.get("responsavel") or "").strip()

    linhas = []

    def filtra_pessoa(qs, prefixo):
        if termo:
            qs = qs.filter(Q(**{f"{prefixo}__nome__icontains": termo}) |
                           Q(**{f"{prefixo}__codigo_matricula__icontains": termo}))
        if setor_id:
            qs = qs.filter(**{f"{prefixo}__setor_id": setor_id})
        return qs

    if tipo in ("", "ENTREGA"):
        qs = _no_periodo(Entrega.objects.select_related("colaborador", "almoxarife", "solicitacao"), "data", inicio, fim)
        qs = filtra_pessoa(qs, "colaborador")
        if produto_id:
            qs = qs.filter(produto_id=produto_id)
        if responsavel:
            qs = qs.filter(almoxarife__nome__icontains=responsavel)
        if status:
            qs = qs.filter(solicitacao__status=status)
        for e in qs[:LIMITE]:
            linhas.append({"data": e.data, "tipo": "ENTREGA", "funcionario": e.colaborador.nome,
                           "matricula": e.colaborador.codigo_matricula, "setor": e.setor_nome,
                           "centro_custo": e.centro_custo, "produto": e.produto_nome, "quantidade": e.quantidade,
                           "ca": e.ca, "lote": e.lote, "valor": float(e.custo_unitario) * e.quantidade,
                           "responsavel": e.almoxarife.nome if e.almoxarife else "",
                           "solicitacao": e.solicitacao.codigo, "detalhe": ""})

    if tipo in ("", "DEVOLUCAO"):
        qs = _no_periodo(Devolucao.objects.select_related("solicitacao__solicitante__setor", "registrado_por")
                         .prefetch_related("solicitacao__itens__produto"), "data", inicio, fim)
        qs = filtra_pessoa(qs, "solicitacao__solicitante")
        if produto_id:
            qs = qs.filter(solicitacao__itens__produto_id=produto_id)
        if responsavel:
            qs = qs.filter(registrado_por__nome__icontains=responsavel)
        if status:
            qs = qs.filter(solicitacao__status=status)
        for d in qs[:LIMITE]:
            colaborador = d.solicitacao.solicitante
            item = d.solicitacao.itens.first()
            linhas.append({"data": d.data, "tipo": "DEVOLUCAO", "funcionario": colaborador.nome,
                           "matricula": colaborador.codigo_matricula,
                           "setor": colaborador.setor.nome if colaborador.setor else "",
                           "centro_custo": colaborador.setor.centro_custo if colaborador.setor else "",
                           "produto": item.produto.nome if item else "", "quantidade": None, "ca": "", "lote": "",
                           "valor": None, "responsavel": d.registrado_por.nome if d.registrado_por else "",
                           "solicitacao": d.solicitacao.codigo,
                           "detalhe": "Dispensada: " + d.observacao if d.dispensada
                           else f"{d.get_condicao_display()} → {d.get_destinacao_display()}"})

    # Entradas de estoque não têm funcionário/status: só entram sem esses filtros
    if tipo in ("", "ENTRADA") and not (termo or setor_id or status):
        qs = _no_periodo(MovimentacaoEstoque.objects.filter(tipo=MovimentacaoEstoque.ENTRADA)
                         .select_related("produto", "usuario", "estoque__totem"), "data", inicio, fim)
        if produto_id:
            qs = qs.filter(produto_id=produto_id)
        if responsavel:
            qs = qs.filter(usuario__nome__icontains=responsavel)
        for m in qs[:LIMITE]:
            linhas.append({"data": m.data, "tipo": "ENTRADA", "funcionario": "", "matricula": "", "setor": "",
                           "centro_custo": "", "produto": m.produto.nome, "quantidade": m.quantidade, "ca": "",
                           "lote": m.lote, "valor": None, "responsavel": m.usuario.nome if m.usuario else "",
                           "solicitacao": "", "detalhe": f"{m.estoque.totem.codigo} · {m.observacao}".strip(" ·")})

    if tipo == "SOLICITACAO":
        qs = _no_periodo(Solicitacao.objects.select_related("solicitante__setor", "decisao__aprovador")
                         .prefetch_related("itens__produto"), "data_solicitacao", inicio, fim)
        qs = filtra_pessoa(qs, "solicitante")
        if produto_id:
            qs = qs.filter(itens__produto_id=produto_id)
        if status:
            qs = qs.filter(status=status)
        if responsavel:
            qs = qs.filter(decisao__aprovador__nome__icontains=responsavel)
        for s in qs.distinct()[:LIMITE]:
            item = s.itens.first()
            decisao = getattr(s, "decisao", None)
            linhas.append({"data": s.data_solicitacao, "tipo": "SOLICITACAO", "funcionario": s.solicitante.nome,
                           "matricula": s.solicitante.codigo_matricula,
                           "setor": s.solicitante.setor.nome if s.solicitante.setor else "",
                           "centro_custo": s.solicitante.setor.centro_custo if s.solicitante.setor else "",
                           "produto": item.produto.nome if item else "",
                           "quantidade": item.quantidade_solicitada if item else None, "ca": "", "lote": "",
                           "valor": float(s.valor_total_estimado),
                           "responsavel": decisao.aprovador.nome if decisao and decisao.aprovador else "",
                           "solicitacao": s.codigo,
                           "detalhe": f"{estados.rotulo(s.status)} · {s.motivo_categoria or ''}".strip(" ·")})

    linhas.sort(key=lambda l: l["data"], reverse=True)
    linhas = linhas[:LIMITE]

    if request.GET.get("formato") == "csv":
        return _csv(request, "historico",
                    ["Data", "Tipo", "Funcionário", "Matrícula", "Setor", "Centro de custo", "Produto", "Quantidade",
                     "CA", "Lote", "Valor (R$)", "Responsável", "Solicitação", "Detalhe"],
                    [[fmt(l["data"], "%d/%m/%Y %H:%M"), TIPOS[l["tipo"]], l["funcionario"], l["matricula"], l["setor"],
                      l["centro_custo"], l["produto"], l["quantidade"], l["ca"], l["lote"],
                      f"{l['valor']:.2f}".replace(".", ",") if l["valor"] is not None else "", l["responsavel"],
                      l["solicitacao"], l["detalhe"]] for l in linhas],
                    "Exportou o histórico de movimentações")

    for l in linhas:
        l["data"] = fmt(l["data"], "%d/%m/%Y %H:%M")
        l["tipo_rotulo"] = TIPOS[l["tipo"]]
    return JsonResponse({
        "linhas": linhas,
        "limite": LIMITE,
        "filtros": {
            "tipos": [{"valor": k, "rotulo": v} for k, v in TIPOS.items()],
            "setores": [{"id": str(s.id), "nome": s.nome} for s in Setor.objects.order_by("nome")],
            "produtos": [{"id": str(p.id), "nome": p.nome} for p in Produto.objects.order_by("nome")],
            "status": [{"valor": k, "rotulo": v} for k, v in estados.ROTULOS.items()],
        },
    })


# ---------------------------------------------------------------------------
# Ficha de EPI do funcionário (RF-43, RF-44)
# ---------------------------------------------------------------------------
@require_GET
@api_backoffice("ver")
def api_ficha_epi(request, funcionario_id):
    """Ficha eletrônica de fornecimento: todas as entregas ao funcionário, com CA e lote do momento."""
    colaborador = Usuario.objects.select_related("setor").filter(id=funcionario_id).first()
    if colaborador is None:
        return erro("Funcionário não encontrado.", status=404)
    so_epi = request.GET.get("todos") != "1"
    entregas = Entrega.objects.filter(colaborador=colaborador).select_related("almoxarife", "solicitacao") \
        .order_by("-data")
    if so_epi:
        entregas = entregas.filter(eh_epi=True)
    devolucoes = {d.entrega_original_id: d for d in Devolucao.objects.filter(entrega_original__colaborador=colaborador)}

    linhas = [
        {
            "data": fmt(e.data, "%d/%m/%Y"),
            "produto": e.produto_nome,
            "ca": e.ca or "",
            "lote": e.lote or "",
            "quantidade": e.quantidade,
            "motivo": e.solicitacao.motivo_categoria or "Retirada regular",
            "solicitacao": e.solicitacao.codigo,
            "almoxarife": e.almoxarife.nome if e.almoxarife else "",
            "devolvido_em": fmt(devolucoes[e.id].data, "%d/%m/%Y") if e.id in devolucoes else "",
            "condicao_devolucao": devolucoes[e.id].get_condicao_display() if e.id in devolucoes and
            devolucoes[e.id].condicao else "",
        }
        for e in entregas
    ]

    if request.GET.get("formato") == "csv":
        return _csv(request, f"ficha-epi-{colaborador.codigo_matricula}",
                    ["Data", "EPI", "CA", "Lote", "Quantidade", "Motivo", "Solicitação", "Entregue por",
                     "Devolvido em", "Condição na devolução"],
                    [[l["data"], l["produto"], l["ca"], l["lote"], l["quantidade"], l["motivo"], l["solicitacao"],
                      l["almoxarife"], l["devolvido_em"], l["condicao_devolucao"]] for l in linhas],
                    f"Exportou a ficha de EPI de {colaborador.nome}")

    registrar(request, "FICHA_EPI_CONSULTADA", colaborador, f"Consultou a ficha de EPI de {colaborador.nome}")
    return JsonResponse({
        "funcionario": {
            "nome": colaborador.nome,
            "matricula": colaborador.codigo_matricula,
            "cargo": colaborador.cargo or "",
            "setor": colaborador.setor.nome if colaborador.setor else "",
            "centro_custo": colaborador.setor.centro_custo if colaborador.setor else "",
            "ativo": colaborador.ativo,
        },
        "entregas": linhas,
        "emitida_em": fmt(timezone.now(), "%d/%m/%Y %H:%M"),
    })


# ---------------------------------------------------------------------------
# Relatórios de gestão (RF-48, RF-49)
# ---------------------------------------------------------------------------
@require_GET
@api_backoffice("ver")
def api_relatorios(request):
    """Indicadores do período: consumo por centro de custo e produto, solicitações e exceções,
    justificativas por categoria (IA x confirmada) e tempos de atendimento."""
    try:
        inicio, fim = _periodo(request, dias_padrao=90)
    except ValueError:
        return erro("Período inválido: use AAAA-MM-DD e a data inicial menor que a final.")

    entregas = _no_periodo(Entrega.objects.all(), "data", inicio, fim)
    por_centro = defaultdict(lambda: {"quantidade": 0, "valor": 0.0})
    por_produto = defaultdict(lambda: {"quantidade": 0, "valor": 0.0, "epi": False})
    for e in entregas.values("setor_nome", "centro_custo", "produto_nome", "eh_epi", "quantidade", "custo_unitario"):
        valor = float(e["custo_unitario"]) * e["quantidade"]
        chave = f"{e['setor_nome'] or 'Sem setor'}" + (f" ({e['centro_custo']})" if e["centro_custo"] else "")
        por_centro[chave]["quantidade"] += e["quantidade"]
        por_centro[chave]["valor"] += valor
        por_produto[e["produto_nome"]]["quantidade"] += e["quantidade"]
        por_produto[e["produto_nome"]]["valor"] += valor
        por_produto[e["produto_nome"]]["epi"] = e["eh_epi"]

    solicitacoes = _no_periodo(Solicitacao.objects.all(), "data_solicitacao", inicio, fim)
    por_status = Counter(estados.rotulo(s) for s in solicitacoes.values_list("status", flat=True))
    excecoes = Counter(solicitacoes.filter(fora_da_cota=True).values_list("motivo_categoria", flat=True))

    decisoes = _no_periodo(DecisaoSolicitacao.objects.select_related("solicitacao"), "data_decisao", inicio, fim)
    tempos = [(d.data_decisao - d.solicitacao.data_solicitacao).total_seconds() / 3600 for d in decisoes]
    aprovadas = sum(1 for d in decisoes if d.decisao_final in estados.ESTADOS_APROVADOS)
    com_ia = [d for d in decisoes if d.categoria_ia]
    categorias = {c: {"sugeridas_ia": 0, "confirmadas": 0} for c in CATEGORIAS}
    for d in com_ia:
        if d.categoria_ia in categorias:
            categorias[d.categoria_ia]["sugeridas_ia"] += 1
        if d.categoria_confirmada in categorias:
            categorias[d.categoria_confirmada]["confirmadas"] += 1

    centros = sorted(({"centro": k, **v, "valor": round(v["valor"], 2)} for k, v in por_centro.items()),
                     key=lambda x: x["valor"], reverse=True)
    produtos = sorted(({"produto": k, **v, "valor": round(v["valor"], 2)} for k, v in por_produto.items()),
                      key=lambda x: x["quantidade"], reverse=True)

    if request.GET.get("formato") == "csv":
        secao = request.GET.get("secao", "centros")
        if secao == "produtos":
            return _csv(request, "consumo-por-produto", ["Produto", "Tipo", "Quantidade", "Valor (R$)"],
                        [[p["produto"], "EPI" if p["epi"] else "Consumível", p["quantidade"],
                          f"{p['valor']:.2f}".replace(".", ",")] for p in produtos],
                        "Exportou o consumo por produto")
        if secao == "justificativas":
            return _csv(request, "justificativas-por-categoria", ["Categoria", "Sugeridas pela IA", "Confirmadas"],
                        [[c, v["sugeridas_ia"], v["confirmadas"]] for c, v in categorias.items()],
                        "Exportou as justificativas por categoria")
        return _csv(request, "consumo-por-centro-de-custo", ["Centro de custo", "Quantidade", "Valor (R$)"],
                    [[c["centro"], c["quantidade"], f"{c['valor']:.2f}".replace(".", ",")] for c in centros],
                    "Exportou o consumo por centro de custo")

    total_solicitacoes = solicitacoes.count()
    return JsonResponse({
        "periodo": {"de": fmt(inicio, "%d/%m/%Y") if inicio else None, "ate": fmt(fim, "%d/%m/%Y") if fim else "hoje"},
        "resumo": {
            "entregas": entregas.count(),
            "itens_entregues": sum(c["quantidade"] for c in centros),
            "valor_entregue": round(sum(c["valor"] for c in centros), 2),
            "solicitacoes": total_solicitacoes,
            "excecoes": sum(excecoes.values()),
            "percentual_excecoes": round(sum(excecoes.values()) * 100 / total_solicitacoes, 1) if total_solicitacoes else None,
            "decisoes": len(tempos),
            "taxa_aprovacao": round(aprovadas * 100 / len(tempos), 1) if tempos else None,
            "tempo_medio_decisao_horas": round(sum(tempos) / len(tempos), 1) if tempos else None,
            "concordancia_ia": round(sum(1 for d in com_ia if d.seguiu_recomendacao_ia) * 100 / len(com_ia), 1)
            if com_ia else None,
        },
        "consumo_por_centro": centros,
        "consumo_por_produto": produtos,
        "solicitacoes_por_status": [{"status": k, "total": v} for k, v in por_status.most_common()],
        "excecoes_por_motivo": [{"motivo": k or "—", "total": v} for k, v in excecoes.most_common()],
        "justificativas_por_categoria": [{"categoria": c, **v} for c, v in categorias.items()],
    })
