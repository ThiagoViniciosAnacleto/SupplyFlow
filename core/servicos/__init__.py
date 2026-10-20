"""Regras de negócio do SupplyFlow, separadas das views (RNF-12, RNF-13).

As views só leem a requisição, chamam um serviço e devolvem JSON. Toda regra
(estados, elegibilidade, estoque, decisão, entrega, devolução) mora aqui.
Os serviços levantam RegraViolada com uma mensagem pronta para o usuário.
"""


class RegraViolada(Exception):
    """Operação recusada por uma regra de negócio. `status` é o código HTTP sugerido."""

    def __init__(self, mensagem, status=409):
        super().__init__(mensagem)
        self.status = status
