"""Dados e atalhos comuns aos testes. Tudo aqui é fictício."""
import json
from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase

from core.contas import garantir_conta
from core.models import CategoriaProduto, EstoqueTotem, Produto, Setor, Totem, Usuario
from core.seguranca import definir_pin

SENHA = "Senha-de-teste-2026"
PIN = "4826"


class BaseTeste(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.setor = Setor.objects.create(nome="Produção Industrial", centro_custo="CC-100")
        cls.admin = cls.criar_usuario("A-001", "Admin Teste", "ADMIN", "admin@teste.local")
        cls.gestor = cls.criar_usuario("G-001", "Gestora Teste", "GESTOR", "gestora@teste.local")
        cls.almoxarife = cls.criar_usuario("O-001", "Almoxarife Teste", "OPERADOR", "almox@teste.local")
        cls.comprador = cls.criar_usuario("C-001", "Comprador Teste", "COMPRADOR", "compras@teste.local")
        cls.colaborador = cls.criar_usuario("001245", "João da Silva", "COLABORADOR", None, cargo="Soldador")

        epi = CategoriaProduto.objects.create(nome="EPI")
        consumivel = CategoriaProduto.objects.create(nome="Consumível")
        cls.luva = Produto.objects.create(sku="EPI-LUVA-01", nome="Luva anticorte", categoria=epi,
                                          custo_unitario=Decimal("35.00"), limite_padrao_mensal=1)
        cls.disco = Produto.objects.create(sku="CON-DISCO-01", nome="Disco de corte", categoria=consumivel,
                                           custo_unitario=Decimal("8.50"), limite_padrao_mensal=10)
        cls.totem = Totem.objects.create(codigo="TOTEM-01", nome="Totem Principal")
        cls.estoque_luva = EstoqueTotem.objects.create(totem=cls.totem, produto=cls.luva, quantidade_disponivel=10)
        cls.estoque_disco = EstoqueTotem.objects.create(totem=cls.totem, produto=cls.disco, quantidade_disponivel=2)

    @classmethod
    def criar_usuario(cls, matricula, nome, perfil, email, cargo="", com_senha=True):
        usuario = Usuario.objects.create(codigo_matricula=matricula, nome=nome, perfil=perfil, email=email,
                                         cargo=cargo, setor=cls.setor)
        definir_pin(usuario, PIN)
        usuario.save()
        conta = garantir_conta(usuario)
        if conta is not None and com_senha:
            conta.set_password(SENHA)
            conta.save()
        return usuario

    def setUp(self):
        cache.clear()  # zera o contador de tentativas de login entre os testes

    # ---------- atalhos ----------
    def post(self, url, dados=None, cliente=None):
        return (cliente or self.client).post(url, json.dumps(dados or {}), content_type="application/json")

    def entrar(self, usuario, cliente=None):
        resposta = self.post("/api/login/", {"email": usuario.email, "senha": SENHA}, cliente)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        return resposta

    def entrar_no_totem(self, usuario=None, cliente=None):
        usuario = usuario or self.colaborador
        resposta = self.post("/api/totem/login/", {"matricula": usuario.codigo_matricula, "pin": PIN}, cliente)
        self.assertEqual(resposta.status_code, 200, resposta.content)
        return resposta
