"""Criar, decidir e cancelar solicitações (RF-18 a RF-30, RF-50)."""
from django.db import IntegrityError, transaction
from django.db.models.functions import Length
from django.utils import timezone

from ..ia import CATEGORIAS
from ..models import AnaliseIA, DecisaoSolicitacao, Solicitacao, SolicitacaoItem
from . import RegraViolada, classificador, estados, estoque
from .elegibilidade import ANTECIPADA, DESCRICAO_MOTIVO, avaliar

JUSTIFICATIVA_MINIMA = 10
QUANTIDADE_MAXIMA = 50

APROVAR = "aprovar"
APROVAR_COM_CONDICAO = "aprovar_condicao"
REJEITAR = "rejeitar"
DECISOES = {APROVAR, APROVAR_COM_CONDICAO, REJEITAR}


def _proximo_codigo():
    ano = timezone.localtime().year
    prefixo = f"SOL-{ano}-"
    # Ordena pelo tamanho e depois pelo texto: "SOL-2026-10000" vem depois de "SOL-2026-9999".
    ultimo = (
        Solicitacao.objects.filter(codigo__startswith=prefixo)
        .order_by(Length("codigo").desc(), "-codigo").values_list("codigo", flat=True).first()
    )
    try:
        numero = int(ultimo.rsplit("-", 1)[1]) + 1 if ultimo else 1
    except ValueError:  # código fora do padrão: recomeça pela contagem
        numero = Solicitacao.objects.filter(codigo__startswith=prefixo).count() + 1
    return f"{prefixo}{numero:04d}"  # mesmo formato dos códigos já existentes (SOL-2026-0001)


def criar_no_totem(colaborador, produto, quantidade, totem, tipo="retirada", justificativa=""):
    """Registra uma solicitação feita no totem. A exceção é decidida AQUI, não pelo navegador.
    Toda solicitação começa aguardando decisão humana (regra definida pela equipe)."""
    # Tudo numa transação: o estoque fica travado enquanto a regra é conferida.
    with transaction.atomic():
        if not 1 <= quantidade <= QUANTIDADE_MAXIMA:
            raise RegraViolada(f"Quantidade deve ser entre 1 e {QUANTIDADE_MAXIMA}.", status=400)

        estoque_totem = estoque.travar(totem, produto) if totem else None
        av = avaliar(colaborador, produto, quantidade, estoque_totem)

        if av.tem_pendente:
            raise RegraViolada("Você já tem uma solicitação deste item em andamento. Aguarde a análise ou a retirada.")
        if av.saldo_livre_totem < quantidade:
            raise RegraViolada(
                f"Sem estoque suficiente neste totem para {produto.nome} "
                f"(disponível: {av.saldo_livre_totem} un.). Procure o almoxarifado."
            )

        motivos = list(av.motivos)
        if tipo == "substituicao" and ANTECIPADA not in motivos:
            motivos.insert(0, ANTECIPADA)  # o colaborador declarou que é substituição antecipada
        excepcional = bool(motivos)
        justificativa = (justificativa or "").strip()
        if excepcional and len(justificativa) < JUSTIFICATIVA_MINIMA:
            raise RegraViolada(
                "Este pedido foge da regra normal. Explique o motivo com pelo menos "
                f"{JUSTIFICATIVA_MINIMA} caracteres.", status=400,
            )

        for tentativa in range(3):
            try:
                with transaction.atomic():
                    solicitacao = Solicitacao.objects.create(
                        codigo=_proximo_codigo(),
                        solicitante=colaborador,
                        totem=totem,
                        status=estados.AGUARDANDO,
                        justificativa_solicitante=justificativa or None,
                        motivo_categoria=DESCRICAO_MOTIVO[motivos[0]] if motivos else "Retirada regular",
                        fora_da_cota=excepcional,
                        valor_total_estimado=produto.custo_unitario * quantidade,
                    )
                break
            except IntegrityError:  # dois pedidos ao mesmo tempo geraram o mesmo código
                if tentativa == 2:
                    raise
        SolicitacaoItem.objects.create(
            solicitacao=solicitacao, produto=produto, quantidade_solicitada=quantidade,
            custo_unitario_momento=produto.custo_unitario,
        )

        analise = None
        if excepcional:
            # RNF-06: só o texto da justificativa vai para o classificador.
            sugestao = classificador.sugerir(justificativa)
            analise = AnaliseIA.objects.create(
                solicitacao=solicitacao,
                modelo_versao=sugestao.versao[:50],
                categoria=sugestao.categoria,
                recomendacao="SUGESTAO_CATEGORIA",
                score_confianca=sugestao.confianca if sugestao.confianca is not None else 0,
                nivel_risco="NAO_SE_APLICA",
                parecer_resumo=(
                    f"Categoria sugerida: {sugestao.categoria}"
                    + (f" ({sugestao.confianca:.0f}% de confiança)." if sugestao.confianca is not None else
                       " (linha de base por palavras-chave, sem estimativa de confiança).")
                    + " Apoio à decisão — a IA não aprova nem rejeita."
                ),
                fatores_analisados={"fonte": sugestao.fonte, "termos": sugestao.termos},
                tempo_inferencia_ms=sugestao.tempo_ms,
            )
        return solicitacao, av, motivos, analise


def decidir(solicitacao, responsavel, decisao, observacao="", exige_devolucao=False, categoria_confirmada=""):
    """Aprova, aprova com condição ou rejeita (RF-24, RF-27 a RF-29).
    A aprovação reserva o estoque (RF-39)."""
    if decisao not in DECISOES:
        raise RegraViolada("Escolha aprovar, aprovar com condição ou rejeitar.", status=400)
    observacao = (observacao or "").strip()
    categoria_confirmada = (categoria_confirmada or "").strip()
    if categoria_confirmada and categoria_confirmada not in CATEGORIAS:
        raise RegraViolada("Categoria inválida.", status=400)
    if decisao == REJEITAR and not observacao:
        raise RegraViolada("Informe o motivo da rejeição.", status=400)
    if decisao == APROVAR_COM_CONDICAO and not (exige_devolucao or observacao):
        raise RegraViolada("Para aprovar com condição, exija a devolução do EPI ou descreva a condição na observação.",
                           status=400)
    if decisao == APROVAR:
        exige_devolucao = False  # aprovação simples não tem condição

    novo_status = {APROVAR: estados.APROVADA, APROVAR_COM_CONDICAO: estados.APROVADA_CONDICIONAL,
                   REJEITAR: estados.REPROVADA}[decisao]

    with transaction.atomic():
        solicitacao = Solicitacao.objects.select_for_update().get(pk=solicitacao.pk)
        estados.mudar_status(solicitacao, novo_status)

        if novo_status != estados.REPROVADA:
            for item in solicitacao.itens.select_related("produto"):
                item.quantidade_aprovada = item.quantidade_solicitada
                item.save(update_fields=["quantidade_aprovada"])
                estoque.reservar(estoque.travar(solicitacao.totem, item.produto), item.quantidade_aprovada,
                                 responsavel, solicitacao)
        solicitacao.save()

        analise = AnaliseIA.objects.filter(solicitacao=solicitacao).first()
        categoria_ia = analise.categoria if analise else None
        confirmada = categoria_confirmada or categoria_ia
        DecisaoSolicitacao.objects.update_or_create(
            solicitacao=solicitacao,
            defaults={
                "aprovador": responsavel,
                "decisao_final": novo_status,
                "categoria_ia": categoria_ia,
                "categoria_confirmada": confirmada,
                "seguiu_recomendacao_ia": bool(categoria_ia) and confirmada == categoria_ia,
                "exige_devolucao": bool(exige_devolucao) and novo_status == estados.APROVADA_CONDICIONAL,
                "justificativa_decisao": observacao or None,
            },
        )
    return solicitacao


def cancelar(solicitacao, usuario, motivo="Cancelada pelo solicitante"):
    """Cancela antes da entrega e libera a reserva de estoque (RF-50)."""
    with transaction.atomic():
        solicitacao = Solicitacao.objects.select_for_update().get(pk=solicitacao.pk)
        estava_aprovada = estados.normalizar(solicitacao.status) in estados.ESTADOS_APROVADOS
        estados.mudar_status(solicitacao, estados.CANCELADA)
        if estava_aprovada:
            for item in solicitacao.itens.select_related("produto"):
                estoque.liberar(estoque.travar(solicitacao.totem, item.produto),
                                item.quantidade_aprovada or 0, usuario, solicitacao, motivo)
        solicitacao.save()
    return solicitacao
