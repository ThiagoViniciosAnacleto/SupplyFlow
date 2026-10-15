"""Regras de negócio: elegibilidade, estados, estoque, decisão, entrega e devolução
(RF-15 a RF-20, RF-24 a RF-30, RF-35, RF-39 a RF-42, RF-50, RNF-08, RNF-11)."""
from datetime import timedelta

from django.test import Client
from django.utils import timezone

from core.models import (AnaliseIA, Devolucao, Entrega, EstoqueTotem, MovimentacaoEstoque, RegraFornecimento,
                         Solicitacao)
from core.servicos.solicitacoes import _proximo_codigo

from .base import BaseTeste

JUSTIFICATIVA = "A luva rasgou durante o trabalho com uma peça metálica."


class TotemRegrasTeste(BaseTeste):
    def setUp(self):
        super().setUp()
        self.entrar_no_totem()

    def pedir(self, produto, quantidade=1, **extra):
        return self.post("/api/totem/solicitar/", {"produto_id": str(produto.id), "quantidade": quantidade, **extra})

    def test_retirada_regular_vai_para_aprovacao_sem_ia(self):
        resposta = self.pedir(self.disco, 2)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        s = Solicitacao.objects.get(codigo=resposta.json()["codigo"])
        self.assertEqual(s.status, "AGUARDANDO_DECISAO")  # regra da equipe: tudo passa por aprovação
        self.assertFalse(s.fora_da_cota)
        self.assertFalse(AnaliseIA.objects.filter(solicitacao=s).exists())

    def test_servidor_detecta_acima_da_cota_e_exige_justificativa(self):
        self.estoque_disco.quantidade_disponivel = 50
        self.estoque_disco.save()
        sem = self.pedir(self.disco, 12, tipo="retirada")  # limite mensal = 10
        self.assertEqual(sem.status_code, 400)
        com = self.pedir(self.disco, 12, justificativa="Manutenção corretiva na linha 2 consumiu mais discos.")
        self.assertEqual(com.status_code, 200, com.content)
        s = Solicitacao.objects.get(codigo=com.json()["codigo"])
        self.assertTrue(s.fora_da_cota)
        self.assertEqual(s.motivo_categoria, "Limite mensal excedido")
        analise = AnaliseIA.objects.get(solicitacao=s)
        self.assertEqual(analise.recomendacao, "SUGESTAO_CATEGORIA")  # IA não recomenda aprovar/rejeitar

    def test_substituicao_antecipada_por_periodicidade(self):
        self.luva.periodicidade_dias = 90
        self.luva.save()
        anterior = Solicitacao.objects.create(codigo="SOL-2026-0900", solicitante=self.colaborador, status="RETIRADA")
        item = anterior.itens.create(produto=self.luva, quantidade_solicitada=1, quantidade_aprovada=1)
        Entrega.objects.create(solicitacao=anterior, item=item, colaborador=self.colaborador, produto=self.luva,
                               quantidade=1, produto_nome="Luva", eh_epi=True)
        Entrega.objects.filter(solicitacao=anterior).update(data=timezone.now() - timedelta(days=10))
        produtos = {p["sku"]: p for p in self.client.get("/api/totem/produtos/").json()["produtos"]}
        self.assertEqual(produtos["EPI-LUVA-01"]["situacao"], "excecao")
        resposta = self.pedir(self.luva, justificativa=JUSTIFICATIVA)
        s = Solicitacao.objects.get(codigo=resposta.json()["codigo"])
        self.assertEqual(s.motivo_categoria, "Substituição antecipada")
        self.assertEqual(AnaliseIA.objects.get(solicitacao=s).categoria, "Dano durante atividade")

    def test_politica_por_cargo_sobrepoe_o_padrao(self):
        RegraFornecimento.objects.create(produto=self.disco, cargo="Soldador", limite_mensal=1)
        self.assertEqual(self.pedir(self.disco, 2).status_code, 400)  # 2 > 1: exceção sem justificativa

    def test_sem_estoque_e_recusado_com_mensagem_clara(self):
        resposta = self.pedir(self.disco, 3)  # só há 2
        self.assertEqual(resposta.status_code, 409)
        self.assertIn("Sem estoque", resposta.json()["erro"])

    def test_entradas_invalidas_dao_400(self):
        self.assertEqual(self.pedir(self.luva, -3).status_code, 400)
        self.assertEqual(self.pedir(self.luva, "abc").status_code, 400)
        self.assertEqual(self.post("/api/totem/solicitar/", {"produto_id": "xyz"}).status_code, 404)

    def test_nao_permite_dois_pedidos_do_mesmo_item_em_andamento(self):
        self.assertEqual(self.pedir(self.disco).status_code, 200)
        self.assertEqual(self.pedir(self.disco).status_code, 409)

    def test_colaborador_cancela_e_a_reserva_e_liberada(self):
        codigo = self.pedir(self.disco).json()["codigo"]
        s = Solicitacao.objects.get(codigo=codigo)
        gestor = Client()
        self.entrar(self.gestor, gestor)
        self.post(f"/api/solicitacoes/{s.id}/decidir/", {"decisao": "aprovar"}, gestor)
        self.estoque_disco.refresh_from_db()
        self.assertEqual(self.estoque_disco.quantidade_reservada, 1)
        resposta = self.post(f"/api/totem/solicitacoes/{s.id}/cancelar/")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.estoque_disco.refresh_from_db()
        self.assertEqual(self.estoque_disco.quantidade_reservada, 0)


class DecisaoEntregaTeste(BaseTeste):
    def criar_pedido(self, produto=None, quantidade=1, justificativa=JUSTIFICATIVA, tipo="substituicao"):
        totem = Client()
        self.entrar_no_totem(cliente=totem)
        produto = produto or self.luva
        resposta = self.post("/api/totem/solicitar/", {"produto_id": str(produto.id), "quantidade": quantidade,
                                                      "tipo": tipo, "justificativa": justificativa}, totem)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        return Solicitacao.objects.get(codigo=resposta.json()["codigo"])

    def decidir(self, s, **dados):
        return self.post(f"/api/solicitacoes/{s.id}/decidir/", dados)

    def test_validacoes_da_decisao(self):
        s = self.criar_pedido()
        self.entrar(self.gestor)
        self.assertEqual(self.decidir(s).status_code, 400)                                   # sem decisão
        self.assertEqual(self.decidir(s, decisao="rejeitar").status_code, 400)               # sem motivo
        self.assertEqual(self.decidir(s, decisao="aprovar_condicao").status_code, 400)       # sem condição
        self.assertEqual(self.decidir(s, decisao="aprovar", categoria_confirmada="X").status_code, 400)

    def test_almoxarife_nao_decide(self):
        s = self.criar_pedido()
        self.entrar(self.almoxarife)
        self.assertEqual(self.decidir(s, decisao="aprovar").status_code, 403)

    def test_aprovacao_reserva_estoque_e_guarda_as_duas_categorias(self):
        s = self.criar_pedido()
        self.entrar(self.gestor)
        resposta = self.decidir(s, decisao="aprovar", categoria_confirmada="Defeito de fabricação")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        s.refresh_from_db()
        self.assertEqual(s.status, "APROVADA")
        self.assertEqual(s.decisao.aprovador, self.gestor)
        self.assertEqual(s.decisao.categoria_ia, "Dano durante atividade")
        self.assertEqual(s.decisao.categoria_confirmada, "Defeito de fabricação")
        self.assertFalse(s.decisao.seguiu_recomendacao_ia)
        self.estoque_luva.refresh_from_db()
        self.assertEqual(self.estoque_luva.quantidade_reservada, 1)
        self.assertTrue(MovimentacaoEstoque.objects.filter(tipo="RESERVA", solicitacao=s).exists())
        self.assertEqual(self.decidir(s, decisao="rejeitar", observacao="x").status_code, 409)  # já decidida

    def test_nao_aprova_sem_estoque_livre(self):
        s = self.criar_pedido(self.disco, 2, justificativa="", tipo="retirada")
        EstoqueTotem.objects.filter(pk=self.estoque_disco.pk).update(quantidade_reservada=1)
        self.entrar(self.gestor)
        self.assertEqual(self.decidir(s, decisao="aprovar").status_code, 409)

    def test_entrega_so_de_aprovada_e_baixa_estoque(self):
        s = self.criar_pedido()
        self.entrar(self.almoxarife)
        self.assertEqual(self.post(f"/api/entregas/{s.id}/confirmar/").status_code, 409)  # ainda não aprovada

        gestor = Client()
        self.entrar(self.gestor, gestor)
        self.post(f"/api/solicitacoes/{s.id}/decidir/", {"decisao": "aprovar"}, gestor)
        resposta = self.post(f"/api/entregas/{s.id}/confirmar/")
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.estoque_luva.refresh_from_db()
        self.assertEqual((self.estoque_luva.quantidade_disponivel, self.estoque_luva.quantidade_reservada), (9, 0))
        entrega = Entrega.objects.get(solicitacao=s)
        self.assertEqual((entrega.almoxarife, entrega.setor_nome), (self.almoxarife, "Produção Industrial"))

        # RF-30: entregue não volta a ser rejeitada
        r = self.post(f"/api/solicitacoes/{s.id}/decidir/", {"decisao": "rejeitar", "observacao": "x"}, gestor)
        self.assertEqual(r.status_code, 409)

    def test_aprovacao_com_devolucao_bloqueia_entrega_ate_registrar(self):
        s = self.criar_pedido()
        gestor = Client()
        self.entrar(self.gestor, gestor)
        r = self.post(f"/api/solicitacoes/{s.id}/decidir/", {"decisao": "aprovar_condicao", "exige_devolucao": True},
                      gestor)
        self.assertEqual(r.status_code, 200, r.content)
        s.refresh_from_db()
        self.assertEqual(s.status, "APROVADA_CONDICIONAL")

        self.entrar(self.almoxarife)
        self.assertEqual(self.post(f"/api/entregas/{s.id}/confirmar/").status_code, 409)       # RF-35
        dispensa = self.post(f"/api/devolucoes/{s.id}/registrar/", {"dispensar": True, "observacao": "x"})
        self.assertEqual(dispensa.status_code, 403)                     # almoxarife não pode dispensar
        incompleta = self.post(f"/api/devolucoes/{s.id}/registrar/", {"condicao": "DANIFICADO"})
        self.assertEqual(incompleta.status_code, 400)
        ok = self.post(f"/api/devolucoes/{s.id}/registrar/", {"condicao": "DANIFICADO", "destinacao": "DESCARTE"})
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(Devolucao.objects.get(solicitacao=s).registrado_por, self.almoxarife)
        self.assertEqual(self.post(f"/api/entregas/{s.id}/confirmar/").status_code, 200)

    def test_gestor_pode_dispensar_devolucao_com_motivo(self):
        s = self.criar_pedido()
        self.entrar(self.gestor)
        self.decidir(s, decisao="aprovar_condicao", exige_devolucao=True)
        self.assertEqual(self.post(f"/api/devolucoes/{s.id}/registrar/", {"dispensar": True}).status_code, 400)
        r = self.post(f"/api/devolucoes/{s.id}/registrar/", {"dispensar": True, "observacao": "EPI extraviado no acidente"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(Devolucao.objects.get(solicitacao=s).dispensada)

    def test_detalhe_mostra_categoria_da_ia_e_dados_reais_do_produto(self):
        self.luva.ca = "12345"
        self.luva.tamanho = "M"
        self.luva.save()
        s = self.criar_pedido()
        self.entrar(self.gestor)
        dados = self.client.get(f"/api/solicitacoes/{s.id}/").json()["solicitacao"]
        self.assertEqual(dados["ia"]["categoria"], "Dano durante atividade")
        self.assertEqual((dados["produto"]["ca"], dados["produto"]["tamanho"]), ("12345", "M"))
        self.assertTrue(dados["pode_decidir"])
        self.assertNotIn("recomendacao", dados["ia"])

    def test_codigo_segue_o_formato_antigo(self):
        Solicitacao.objects.create(codigo=f"SOL-{timezone.localtime().year}-0004", solicitante=self.colaborador)
        self.assertTrue(_proximo_codigo().endswith("-0005"))


class CadastrosValidacaoTeste(BaseTeste):
    def setUp(self):
        super().setUp()
        self.entrar(self.admin)

    def test_produto_custo_invalido_e_epi_sem_ca(self):
        r = self.post("/api/produtos/salvar/", {"sku": "X1", "nome": "X", "custo_unitario": "abc"})
        self.assertEqual(r.status_code, 400)
        r = self.post("/api/produtos/salvar/", {"sku": "X2", "nome": "Capacete",
                                                "categoria_id": str(self.luva.categoria_id)})
        self.assertEqual(r.status_code, 400)

    def test_fornecedor_valida_cnpj(self):
        self.assertEqual(self.post("/api/fornecedores/salvar/", {"razao_social": "A", "cnpj": "11.111.111/1111-11"})
                         .status_code, 400)
        self.assertEqual(self.post("/api/fornecedores/salvar/", {"razao_social": "EPI Brasil Ltda",
                                                                 "cnpj": "11.222.333/0001-81"}).status_code, 200)

    def test_reposicao_registra_movimentacao(self):
        r = self.post("/api/estoque/repor/", {"estoque_id": str(self.estoque_disco.id), "quantidade": "dez"})
        self.assertEqual(r.status_code, 400)
        r = self.post("/api/estoque/repor/", {"estoque_id": str(self.estoque_disco.id), "quantidade": 5, "lote": "L-9"})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(MovimentacaoEstoque.objects.filter(tipo="ENTRADA", quantidade=5, lote="L-9").exists())

    def test_painel_sem_numeros_fixos(self):
        dados = self.client.get("/api/dashboard/").json()
        self.assertEqual(dados["entregasPorMes"]["valores"], [0, 0, 0, 0, 0, 0])
