"""Transforma solicitações em JSON para o front (lista, detalhe e totem).

Nada aqui é inventado: campos sem cadastro vão como null e o front mostra "—".
"""
from ..models import Devolucao, Entrega
from ..servicos import estados
from ..servicos.elegibilidade import regra_para
from .util import fmt


def _primeiro_item(s):
    itens = list(s.itens.all())
    return itens, (itens[0] if itens else None)


def resumo_ia(analise):
    if not analise:
        return None
    fatores = analise.fatores_analisados if isinstance(analise.fatores_analisados, dict) else {}
    # Análises antigas (antes desta versão) vinham de regras com "confiança" fixa: não exibimos esse número.
    fonte = fatores.get("fonte") or "legado"
    return {
        "categoria": analise.categoria,
        "confianca": round(float(analise.score_confianca), 1) if fonte == "modelo" else None,
        "fonte": fonte,
        "termos": fatores.get("termos", []),
        "modelo_versao": analise.modelo_versao,
        "parecer": analise.parecer_resumo,
    }


def resumo_decisao(decisao):
    if not decisao:
        return None
    return {
        "decisao_final": decisao.decisao_final,
        "rotulo": estados.rotulo(decisao.decisao_final),
        "observacao": decisao.justificativa_decisao,
        "exige_devolucao": decisao.exige_devolucao,
        "categoria_ia": decisao.categoria_ia,
        "categoria_confirmada": decisao.categoria_confirmada,
        "reclassificada": bool(decisao.categoria_ia and decisao.categoria_confirmada
                               and decisao.categoria_ia != decisao.categoria_confirmada),
        "responsavel": decisao.aprovador.nome if decisao.aprovador else None,
        "data_hora": fmt(decisao.data_decisao, "%d/%m/%Y, %H:%M"),
    }


def resumo_devolucao(s, decisao):
    if not decisao or not decisao.exige_devolucao:
        return None
    devolucao = Devolucao.objects.filter(solicitacao=s).select_related("registrado_por").first()
    if devolucao is None:
        return {"situacao": "pendente", "rotulo": "Devolução pendente"}
    return {
        "situacao": "dispensada" if devolucao.dispensada else "registrada",
        "rotulo": "Devolução dispensada" if devolucao.dispensada else "EPI devolvido",
        "condicao": devolucao.get_condicao_display() if devolucao.condicao else None,
        "destinacao": devolucao.get_destinacao_display() if devolucao.destinacao else None,
        "observacao": devolucao.observacao,
        "registrado_por": devolucao.registrado_por.nome if devolucao.registrado_por else None,
        "data": fmt(devolucao.data, "%d/%m/%Y %H:%M"),
    }


def linha_lista(s):
    """Uma linha da lista de solicitações."""
    itens, item = _primeiro_item(s)
    produto = item.produto if item else None
    nome_produto = produto.nome if produto else "—"
    if len(itens) > 1:
        nome_produto += f" (+{len(itens) - 1})"
    analise = getattr(s, "analise_ia", None)
    decisao = getattr(s, "decisao", None)
    return {
        "id": str(s.id),
        "codigo": s.codigo,
        "status": estados.chave_front(s.status),
        "status_db": estados.normalizar(s.status),
        "status_rotulo": estados.rotulo(s.status),
        "excepcional": bool(s.fora_da_cota),
        "data": fmt(s.data_solicitacao, "%d/%m/%Y"),
        "hora": fmt(s.data_solicitacao, "%H:%M"),
        "motivo": s.motivo_categoria or ("Exceção" if s.fora_da_cota else "Retirada regular"),
        "funcionario": s.solicitante.nome,
        "matricula": s.solicitante.codigo_matricula,
        "funcao": s.solicitante.cargo or "—",
        "centroCusto": s.solicitante.setor.nome if s.solicitante.setor else "—",
        "produto": nome_produto,
        "quantidade": item.quantidade_solicitada if item else None,
        "tipoProduto": ("EPI" if produto.eh_epi else "Consumível") if produto else None,
        "ia": resumo_ia(analise),
        "decisao": resumo_decisao(decisao),
    }


def detalhe(s):
    """Tudo o que a tela de detalhe precisa para decidir com informação (RF-23)."""
    dados = linha_lista(s)
    itens, item = _primeiro_item(s)
    produto = item.produto if item else None
    colaborador = s.solicitante
    regra = regra_para(colaborador, produto) if produto else None
    decisao = getattr(s, "decisao", None)

    historico = [
        {
            "data": fmt(e.data, "%d/%m/%Y"),
            "produto": e.produto_nome,
            "quantidade": e.quantidade,
            "tipo": "Entrega",
            "solicitacao": e.solicitacao.codigo,
        }
        for e in Entrega.objects.filter(colaborador=colaborador, produto=produto)
        .exclude(solicitacao=s).select_related("solicitacao").order_by("-data")[:8]
    ] if produto else []

    dados.update({
        "justificativa": s.justificativa_solicitante,
        "valor_total_estimado": float(s.valor_total_estimado),
        "solicitante": {
            "id": str(colaborador.id),
            "nome": colaborador.nome,
            "matricula": colaborador.codigo_matricula,
            "cargo": colaborador.cargo or None,
            "setor": colaborador.setor.nome if colaborador.setor else None,
            "centro_custo": colaborador.setor.centro_custo if colaborador.setor else None,
        },
        "produto": {
            "nome": produto.nome if produto else None,
            "sku": produto.sku if produto else None,
            "tipo": dados["tipoProduto"],
            "descricao": produto.descricao if produto else None,
            "ca": produto.ca if produto else None,
            "validade_ca": produto.validade_ca.strftime("%d/%m/%Y") if produto and produto.validade_ca else None,
            "tamanho": produto.tamanho if produto else None,
            "quantidade": item.quantidade_solicitada if item else None,
            "unidade": produto.unidade_medida if produto else None,
            "custo_unitario": float(item.custo_unitario_momento) if item else None,
        },
        "regra": {
            "origem": regra.origem,
            "limite_mensal": regra.limite_mensal,
            "periodicidade_dias": regra.periodicidade_dias,
            "excecao": "Exige aprovação",
        } if regra else None,
        "historico": historico,
        "devolucao": resumo_devolucao(s, decisao),
        "pode_decidir": estados.normalizar(s.status) == estados.AGUARDANDO,
    })
    return dados
