"""Classificador de justificativas (RF-22 a RF-25, RNF-06, RNF-14 a RNF-17)."""
from unittest import mock

from django.test import Client, SimpleTestCase

from core.ia import CATEGORIAS, baseline, modelo
from core.servicos import classificador
from core.servicos.classificador import Sugestao

from .base import BaseTeste


class ClassificadorTeste(SimpleTestCase):
    def test_modelo_treinado_esta_no_repositorio_e_sugere_categoria_valida(self):
        self.assertTrue(modelo.ARQUIVO_MODELO.exists(), "rode: python manage.py treinar_classificador")
        s = classificador.sugerir("A luva rasgou durante o trabalho com uma peça metálica.")
        self.assertEqual(s.fonte, "modelo")
        self.assertIn(s.categoria, CATEGORIAS)
        self.assertTrue(0 < s.confianca <= 100)

    def test_sem_modelo_usa_linha_de_base_sem_inventar_confianca(self):
        with mock.patch.object(modelo, "prever", return_value=None):
            s = classificador.sugerir("Perdi a luva no vestiário")
        self.assertEqual((s.categoria, s.fonte, s.confianca), ("Perda", "palavras-chave", None))

    def test_linha_de_base_casa_inicio_de_palavra(self):
        self.assertEqual(baseline.classificar("A manutenção consumiu mais discos")[0], "Outro")
        self.assertEqual(baseline.classificar("Meu protetor sumiu")[0], "Perda")

    def test_metricas_reais_com_teste_separado_e_linha_de_base(self):
        m = modelo.metricas()
        self.assertIsNotNone(m)
        self.assertEqual(m["dados"]["treino"] + m["dados"]["teste"], m["dados"]["total"])
        self.assertEqual(len(m["modelo"]["matriz_confusao"]), len(CATEGORIAS))
        total_matriz = sum(sum(linha) for linha in m["modelo"]["matriz_confusao"])
        self.assertEqual(total_matriz, m["dados"]["teste"])
        for chave in ("acuracia", "precisao_macro", "revocacao_macro", "f1_macro"):
            self.assertIn(chave, m["modelo"])
            self.assertIn(chave, m["linha_base"])


class IAnoFluxoTeste(BaseTeste):
    def test_classificador_recebe_so_o_texto_da_justificativa(self):
        """RNF-06: nome, matrícula e outros dados pessoais não chegam ao modelo."""
        texto = "A luva rasgou durante o trabalho com uma peça metálica."
        falsa = Sugestao("Dano durante atividade", 90.0, "modelo", "teste", [], 1)
        totem = Client()
        self.entrar_no_totem(cliente=totem)
        with mock.patch.object(classificador, "sugerir", return_value=falsa) as espiao:
            self.post("/api/totem/solicitar/", {"produto_id": str(self.luva.id), "tipo": "substituicao",
                                                "justificativa": texto}, totem)
        espiao.assert_called_once_with(texto)

    def test_avaliacao_mostra_concordancia_humana(self):
        totem = Client()
        self.entrar_no_totem(cliente=totem)
        r = self.post("/api/totem/solicitar/", {"produto_id": str(self.luva.id), "tipo": "substituicao",
                                                "justificativa": "Perdi a luva no vestiário ontem"}, totem)
        from core.models import Solicitacao

        s = Solicitacao.objects.get(codigo=r.json()["codigo"])
        self.entrar(self.gestor)
        self.post(f"/api/solicitacoes/{s.id}/decidir/", {"decisao": "aprovar", "categoria_confirmada": "Outro"})
        dados = self.client.get("/api/avaliacao-ia/").json()
        self.assertTrue(dados["modelo_disponivel"])
        self.assertEqual(dados["uso"]["decisoes_com_ia"], 1)
        self.assertEqual(dados["uso"]["reclassificadas"], 1)
        self.assertEqual(dados["uso"]["ultimas_reclassificacoes"][0]["categoria_confirmada"], "Outro")
