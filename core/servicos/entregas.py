"""Entrega física e devolução do EPI anterior (RF-31 a RF-35, RF-40 a RF-43)."""
from django.db import transaction

from ..models import DecisaoSolicitacao, Devolucao, Entrega, Solicitacao
from ..permissoes import pode
from . import RegraViolada, estados, estoque

CONDICOES = dict(Devolucao.CONDICOES)
DESTINACOES = dict(Devolucao.DESTINACOES)


def devolucao_pendente(solicitacao):
    """True se a aprovação exigiu devolução e ela ainda não foi registrada nem dispensada."""
    decisao = DecisaoSolicitacao.objects.filter(solicitacao=solicitacao).first()
    return bool(decisao and decisao.exige_devolucao) and not Devolucao.objects.filter(solicitacao=solicitacao).exists()


def confirmar_entrega(solicitacao, almoxarife):
    """Baixa definitiva do estoque e registro da entrega com os dados do momento."""
    with transaction.atomic():
        solicitacao = Solicitacao.objects.select_for_update().select_related(
            "solicitante__setor", "totem").get(pk=solicitacao.pk)
        if estados.normalizar(solicitacao.status) not in estados.ESTADOS_APROVADOS:
            raise RegraViolada(
                f"Só é possível entregar solicitações aprovadas. Esta está “{estados.rotulo(solicitacao.status)}”."
            )
        if devolucao_pendente(solicitacao):
            raise RegraViolada(
                "Esta aprovação exige a devolução do EPI anterior. Registre a devolução "
                "(ou peça a um gestor/técnico para dispensá-la) antes de entregar."
            )

        colaborador = solicitacao.solicitante
        setor = colaborador.setor
        entregas = []
        for item in solicitacao.itens.select_related("produto__categoria"):
            quantidade = item.quantidade_aprovada if item.quantidade_aprovada is not None else item.quantidade_solicitada
            linha_estoque = estoque.travar(solicitacao.totem, item.produto)
            estoque.baixar(linha_estoque, quantidade, almoxarife, solicitacao)
            produto = item.produto
            entregas.append(Entrega.objects.create(
                solicitacao=solicitacao, item=item, colaborador=colaborador, produto=produto,
                almoxarife=almoxarife, totem=solicitacao.totem, quantidade=quantidade,
                produto_nome=produto.nome, eh_epi=produto.eh_epi, ca=produto.ca or "",
                lote=(linha_estoque.lote if linha_estoque else "") or "",
                setor_nome=setor.nome if setor else "", centro_custo=(setor.centro_custo or "") if setor else "",
                custo_unitario=item.custo_unitario_momento,
            ))
        estados.mudar_status(solicitacao, estados.RETIRADA)
        solicitacao.save()
    return solicitacao, entregas


def registrar_devolucao(solicitacao, usuario, condicao="", destinacao="", observacao="", dispensar=False):
    """Registra (ou dispensa formalmente) a devolução exigida na aprovação."""
    decisao = DecisaoSolicitacao.objects.filter(solicitacao=solicitacao).first()
    if not decisao or not decisao.exige_devolucao:
        raise RegraViolada("Esta solicitação não exige devolução.")
    if Devolucao.objects.filter(solicitacao=solicitacao).exists():
        raise RegraViolada("A devolução desta solicitação já foi registrada.")
    if estados.normalizar(solicitacao.status) in {estados.REPROVADA, estados.CANCELADA}:
        raise RegraViolada("A solicitação foi encerrada; não há devolução a registrar.")

    observacao = (observacao or "").strip()
    if dispensar:
        if not pode(usuario, "decidir"):
            raise RegraViolada("Só gestor, técnico de segurança ou administrador pode dispensar a devolução.",
                               status=403)
        if not observacao:
            raise RegraViolada("Explique por que a devolução está sendo dispensada.", status=400)
        condicao = destinacao = ""
    else:
        if condicao not in CONDICOES:
            raise RegraViolada("Informe a condição do EPI devolvido.", status=400)
        if destinacao not in DESTINACOES:
            raise RegraViolada("Informe a destinação do EPI devolvido.", status=400)

    item = solicitacao.itens.first()
    entrega_original = (
        Entrega.objects.filter(colaborador=solicitacao.solicitante, produto=item.produto)
        .exclude(solicitacao=solicitacao).order_by("-data").first() if item else None
    )
    return Devolucao.objects.create(
        solicitacao=solicitacao, entrega_original=entrega_original, dispensada=dispensar,
        condicao=condicao, destinacao=destinacao, observacao=observacao, registrado_por=usuario,
    )
