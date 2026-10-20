"""Movimentação de estoque (RF-36, RF-37, RF-39, RF-40, RNF-08).

Regras:
- toda alteração de saldo gera uma MovimentacaoEstoque;
- reservar só o que está livre (disponível - reservado);
- a baixa definitiva acontece apenas na entrega física;
- o saldo nunca fica negativo;
- quem chama deve estar dentro de transaction.atomic() — as funções travam a linha
  do estoque (select_for_update) para que duas operações simultâneas não usem o
  mesmo saldo.
"""
from ..models import EstoqueTotem, MovimentacaoEstoque
from . import RegraViolada


def travar(totem, produto):
    """Busca e trava a linha de estoque do produto no totem (ou None)."""
    if totem is None:
        return None
    return EstoqueTotem.objects.select_for_update().filter(totem=totem, produto=produto).first()


def _registrar(estoque, tipo, quantidade, usuario=None, solicitacao=None, observacao="", lote=""):
    MovimentacaoEstoque.objects.create(
        estoque=estoque, produto_id=estoque.produto_id, tipo=tipo, quantidade=quantidade,
        saldo_disponivel_apos=estoque.quantidade_disponivel, saldo_reservado_apos=estoque.quantidade_reservada,
        lote=lote or estoque.lote or "", solicitacao=solicitacao, usuario=usuario, observacao=observacao[:255],
    )


def entrada(estoque, quantidade, usuario, lote="", observacao=""):
    if quantidade <= 0:
        raise RegraViolada("A quantidade da entrada deve ser maior que zero.", status=400)
    estoque.quantidade_disponivel += quantidade
    if lote:
        estoque.lote = lote
    estoque.save()
    _registrar(estoque, MovimentacaoEstoque.ENTRADA, quantidade, usuario, observacao=observacao, lote=lote)


def reservar(estoque, quantidade, usuario, solicitacao):
    if estoque is None or estoque.livre < quantidade:
        livre = estoque.livre if estoque else 0
        raise RegraViolada(
            f"Estoque insuficiente para reservar {quantidade} un. no totem (livre: {max(livre, 0)} un.). "
            "Reponha o estoque antes de aprovar."
        )
    estoque.quantidade_reservada += quantidade
    estoque.save()
    _registrar(estoque, MovimentacaoEstoque.RESERVA, quantidade, usuario, solicitacao)


def liberar(estoque, quantidade, usuario, solicitacao, observacao=""):
    if estoque is None or quantidade <= 0:
        return
    estoque.quantidade_reservada = max(0, estoque.quantidade_reservada - quantidade)
    estoque.save()
    _registrar(estoque, MovimentacaoEstoque.LIBERACAO, quantidade, usuario, solicitacao, observacao)


def baixar(estoque, quantidade, usuario, solicitacao):
    """Saída definitiva na entrega física: consome a reserva feita na aprovação."""
    if estoque is None or estoque.quantidade_disponivel < quantidade:
        disponivel = estoque.quantidade_disponivel if estoque else 0
        raise RegraViolada(
            f"Saldo físico insuficiente: há {disponivel} un. no totem e a entrega é de {quantidade} un."
        )
    estoque.quantidade_disponivel -= quantidade
    estoque.quantidade_reservada = max(0, estoque.quantidade_reservada - quantidade)
    estoque.save()
    _registrar(estoque, MovimentacaoEstoque.SAIDA, quantidade, usuario, solicitacao)
