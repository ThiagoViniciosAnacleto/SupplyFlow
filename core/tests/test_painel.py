"""Visão Geral — painel de prontidão (/api/painel/)."""
from datetime import timedelta

from django.test import Client
from django.utils import timezone

from core.models import Entrega, RegraFornecimento, Solicitacao, SolicitacaoItem
from core.servicos import rh

from .base import BaseTeste


class PainelTeste(BaseTeste):
    def entregar_luva(self, dias_atras):
        sol = Solicitacao.objects.create(codigo=f"SOL-T-{dias_atras}", solicitante=self.colaborador,
                                         totem=self.totem, status="RETIRADA", valor_total_estimado=0)
        item = SolicitacaoItem.objects.create(solicitacao=sol, produto=self.luva, quantidade_solicitada=1,
                                              quantidade_aprovada=1, custo_unitario_momento=self.luva.custo_unitario)
        e = Entrega.objects.create(solicitacao=sol, item=item, colaborador=self.colaborador, produto=self.luva,
                                   totem=self.totem, quantidade=1, produto_nome=self.luva.nome, eh_epi=True,
                                   custo_unitario=self.luva.custo_unitario)
        Entrega.objects.filter(pk=e.pk).update(data=timezone.now() - timedelta(days=dias_atras))

    def faixa(self, dados, codigo):
        return next(f["quantidade"] for f in dados["prontidao"]["faixas"] if f["codigo"] == codigo)

    def test_exige_login(self):
        self.assertEqual(Client().get("/api/painel/").status_code, 401)

    def test_sem_pendencias_todos_em_dia(self):
        self.entrar(self.gestor)
        dados = self.client.get("/api/painel/").json()
        self.assertEqual(dados["prontidao"]["total"], 1)
        self.assertEqual(dados["prontidao"]["percentual"], 100)

    def test_troca_vencida_pela_periodicidade_da_politica(self):
        RegraFornecimento.objects.create(produto=self.luva, cargo="Soldador", periodicidade_dias=30)
        self.entregar_luva(40)
        self.entrar(self.gestor)
        dados = self.client.get("/api/painel/").json()
        self.assertEqual(self.faixa(dados, "troca_vencida"), 1)
        self.assertEqual(dados["prontidao"]["percentual"], 0)
        self.assertTrue(any(a["tipo"] == "risco" and "funcionarios.html?abrir=" in a["link"] for a in dados["acoes"]))

    def test_nr_vencendo_aparece_no_radar(self):
        validade = (timezone.localdate() + timedelta(days=10)).isoformat()
        rh.salvar_metadados_rh(None, self.colaborador, habilitacoes=[{"nome": "NR-35", "validade": validade}])
        self.entrar(self.gestor)
        dados = self.client.get("/api/painel/").json()
        self.assertEqual(self.faixa(dados, "nr_vencendo"), 1)
        self.assertEqual(dados["radar_nrs"]["pontos"][0]["nr"], "NR-35")
        self.assertEqual(dados["radar_nrs"]["pontos"][0]["dias"], 10)

    def test_fila_de_acoes_respeita_o_perfil(self):
        Solicitacao.objects.create(codigo="SOL-T-AG", solicitante=self.colaborador, totem=self.totem,
                                   status="AGUARDANDO_DECISAO", valor_total_estimado=0)
        self.entrar(self.gestor)
        self.assertTrue(any(a["tipo"] == "aprovar" for a in self.client.get("/api/painel/").json()["acoes"]))
        almox = Client()
        self.entrar(self.almoxarife, almox)
        self.assertFalse(any(a["tipo"] == "aprovar" for a in almox.get("/api/painel/").json()["acoes"]))

    def test_cobertura_em_dias_pelo_consumo(self):
        for d in range(1, 4):
            self.entregar_luva(d)  # 3 luvas em 30 dias = 0,1 por dia
        self.entrar(self.gestor)
        itens = self.client.get("/api/painel/").json()["cobertura"]["itens"]
        luva = next(i for i in itens if i["produto"] == self.luva.nome)
        self.assertEqual(luva["dias"], 100)  # 10 livres / 0,1 por dia

    def test_nr_de_usuario_administrativo_entra_no_radar(self):
        """Quem tem perfil do backoffice mas tem NR cadastrada também aparece no painel."""
        validade = (timezone.localdate() + timedelta(days=4)).isoformat()
        rh.salvar_metadados_rh(None, self.gestor, habilitacoes=[{"nome": "NR-10", "validade": validade}])
        self.entrar(self.gestor)
        dados = self.client.get("/api/painel/").json()
        self.assertEqual(dados["prontidao"]["total"], 2)  # o colaborador + o gestor com NR
        self.assertTrue(any(p["pessoa"] == self.gestor.nome and p["dias"] == 4 for p in dados["radar_nrs"]["pontos"]))

    def test_legenda_conta_todas_as_pendencias_da_pessoa(self):
        """NR vencida e outra NR vencendo na mesma pessoa: a barra conta a pior, a legenda conta as duas."""
        hoje = timezone.localdate()
        rh.salvar_metadados_rh(None, self.colaborador, habilitacoes=[
            {"nome": "NR-35", "validade": (hoje - timedelta(days=25)).isoformat()},
            {"nome": "NR-10", "validade": (hoje + timedelta(days=4)).isoformat()},
        ])
        self.entrar(self.gestor)
        faixas = {f["codigo"]: f for f in self.client.get("/api/painel/").json()["prontidao"]["faixas"]}
        self.assertEqual(faixas["nr_vencida"]["quantidade"], 1)
        self.assertEqual(faixas["nr_vencendo"]["quantidade"], 0)
        self.assertEqual(faixas["nr_vencendo"]["pessoas"], 1)
