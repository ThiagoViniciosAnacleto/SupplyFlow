"""Suporte à gestão: histórico, ficha de EPI, relatórios e exportação (RF-43 a RF-49)."""
from django.test import Client

from core.models import RegistroAuditoria

from .base import BaseTeste

JUSTIFICATIVA = "A luva rasgou durante o trabalho com uma peça metálica."


class RelatoriosTeste(BaseTeste):
    def setUp(self):
        super().setUp()
        # Um ciclo completo: pedido no totem -> aprovação -> entrega
        totem = Client()
        self.entrar_no_totem(cliente=totem)
        r = self.post("/api/totem/solicitar/", {"produto_id": str(self.luva.id), "tipo": "substituicao",
                                                "justificativa": JUSTIFICATIVA}, totem)
        from core.models import Solicitacao

        self.solicitacao = Solicitacao.objects.get(codigo=r.json()["codigo"])
        self.entrar(self.gestor)
        self.post(f"/api/solicitacoes/{self.solicitacao.id}/decidir/",
                  {"decisao": "aprovar", "categoria_confirmada": "Defeito de fabricação"})
        almox = Client()
        self.entrar(self.almoxarife, almox)
        self.post(f"/api/entregas/{self.solicitacao.id}/confirmar/", cliente=almox)

    def test_historico_traz_a_entrega_e_respeita_filtros(self):
        dados = self.client.get("/api/historico/").json()
        entregas = [l for l in dados["linhas"] if l["tipo"] == "ENTREGA"]
        self.assertEqual(len(entregas), 1)
        self.assertEqual(entregas[0]["responsavel"], "Almoxarife Teste")
        self.assertEqual(self.client.get("/api/historico/?funcionario=ninguem").json()["linhas"], [])
        self.assertEqual(len(self.client.get(f"/api/historico/?produto={self.disco.id}").json()["linhas"]), 0)
        solicitacoes = self.client.get("/api/historico/?tipo=SOLICITACAO&status=RETIRADA").json()["linhas"]
        self.assertEqual([l["solicitacao"] for l in solicitacoes], [self.solicitacao.codigo])
        self.assertEqual(self.client.get("/api/historico/?de=2026-13-01").status_code, 400)

    def test_exportacao_csv_abre_no_excel_e_fica_na_auditoria(self):
        resposta = self.client.get("/api/historico/?formato=csv")
        self.assertEqual(resposta.status_code, 200)
        self.assertIn("attachment", resposta["Content-Disposition"])
        conteudo = resposta.content.decode("utf-8")
        self.assertTrue(conteudo.startswith("﻿"))
        self.assertIn("Funcionário;Matrícula", conteudo)
        self.assertIn("João da Silva", conteudo)
        self.assertTrue(RegistroAuditoria.objects.filter(acao="EXPORTACAO_CSV").exists())

    def test_ficha_de_epi_do_funcionario(self):
        dados = self.client.get(f"/api/funcionarios/{self.colaborador.id}/ficha/").json()
        self.assertEqual(dados["funcionario"]["matricula"], "001245")
        self.assertEqual(len(dados["entregas"]), 1)
        self.assertEqual(dados["entregas"][0]["solicitacao"], self.solicitacao.codigo)
        csv = self.client.get(f"/api/funcionarios/{self.colaborador.id}/ficha/?formato=csv")
        self.assertIn("ficha-epi-001245", csv["Content-Disposition"])

    def test_relatorios_somam_o_periodo(self):
        dados = self.client.get("/api/relatorios/").json()
        self.assertEqual(dados["resumo"]["itens_entregues"], 1)
        self.assertEqual(dados["resumo"]["valor_entregue"], 35.0)
        self.assertEqual(dados["consumo_por_centro"][0]["centro"], "Produção Industrial (CC-100)")
        self.assertEqual(dados["resumo"]["taxa_aprovacao"], 100.0)
        self.assertEqual(dados["resumo"]["concordancia_ia"], 0.0)  # o gestor reclassificou
        categorias = {c["categoria"]: c for c in dados["justificativas_por_categoria"]}
        self.assertEqual(categorias["Defeito de fabricação"]["confirmadas"], 1)
        csv = self.client.get("/api/relatorios/?formato=csv&secao=produtos").content.decode("utf-8")
        self.assertIn("Luva anticorte;EPI;1;35,00", csv)

    def test_relatorios_exigem_login(self):
        for url in ["/api/historico/", "/api/relatorios/", f"/api/funcionarios/{self.colaborador.id}/ficha/"]:
            self.assertEqual(Client().get(url).status_code, 401)
