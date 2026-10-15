"""Carrega dados FICTÍCIOS de demonstração (os do protótipo) no banco local.

Uso:  python manage.py carregar_demo

A senha do backoffice e o PIN do totem vêm das variáveis DEMO_SENHA e DEMO_PIN;
se não existirem, são sorteados e mostrados uma única vez no terminal.
Por segurança só roda com DEBUG=True (use --forcar para outro ambiente de testes).
"""
import os
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from core.contas import garantir_conta
from core.models import CategoriaProduto, Entrega, EstoqueTotem, Produto, Setor, Solicitacao, Totem, Usuario
from core.servicos import entregas as servico_entregas
from core.servicos import solicitacoes as servico_solicitacoes
from core.seguranca import PINS_PROIBIDOS, definir_pin

SETORES = [
    ("Produção Industrial", "CC-100"),
    ("Manutenção", "CC-200"),
    ("Logística", "CC-300"),
    ("Administrativo", "CC-400"),
]

# (matrícula, nome, perfil, cargo, setor, e-mail)
PESSOAS = [
    ("A-001", "Admin Geral", "ADMIN", "Administrador do sistema", "Administrativo", "admin@supplyflow.local"),
    ("T-001", "Carlos Mendes", "TECNICO_SEGURANCA", "Técnico de Segurança", "Produção Industrial", "carlos.mendes@supplyflow.local"),
    ("G-014", "Helena Dias", "GESTOR", "Supervisora de Produção", "Produção Industrial", "helena.dias@supplyflow.local"),
    ("003001", "Marcos Pereira", "OPERADOR", "Almoxarife", "Logística", "marcos.pereira@supplyflow.local"),
    ("C-002", "Paula Souza", "COMPRADOR", "Compradora", "Administrativo", "paula.souza@supplyflow.local"),
    ("001245", "João da Silva", "COLABORADOR", "Soldador", "Produção Industrial", None),
    ("001187", "Carlos Santos", "COLABORADOR", "Mecânico", "Manutenção", None),
    ("001302", "Ana Oliveira", "COLABORADOR", "Operador de Produção", "Produção Industrial", None),
    ("001219", "Pedro Almeida", "COLABORADOR", "Eletricista", "Manutenção", None),
]

# (sku, nome, categoria, custo, limite mensal, requer justificativa, descrição, CA, tamanho, periodicidade em dias)
PRODUTOS = [
    ("EPI-LUVA-01", "Luva de proteção anticorte", "EPI", "35.00", 1, False, "Anticorte nível 5", "12345", "M", 90),
    ("EPI-AURIC-01", "Protetor auricular", "EPI", "4.00", 2, False, "Plugue de inserção em silicone", "23456", "Único", 60),
    ("EPI-BOTINA-01", "Botina de segurança", "EPI", "120.00", 1, False, "Bico composite, sem partes metálicas",
     "34567", "42", 180),
    ("EPI-OCULOS-01", "Óculos de proteção", "EPI", "18.00", 1, False, "Lente incolor antiembaçante", "45678", "Único", 120),
    ("CON-DISCO-01", 'Disco de corte 4½"', "Consumível", "8.50", 10, False, "Disco abrasivo 115 × 1,0 mm", None, None, None),
    ("CON-LUVA-NIT", "Luva nitrílica descartável", "Consumível", "0.90", 20, False, "Caixa com 100 unidades",
     None, None, None),
]

# sku -> (quantidade disponível, mínima)
ESTOQUE = {
    "EPI-LUVA-01": (12, 3),
    "EPI-AURIC-01": (40, 10),
    "EPI-BOTINA-01": (6, 2),
    "EPI-OCULOS-01": (0, 4),
    "CON-DISCO-01": (30, 10),
    "CON-LUVA-NIT": (200, 50),
}


def pin_aleatorio():
    while True:
        pin = f"{secrets.randbelow(10000):04d}"
        if pin not in PINS_PROIBIDOS:
            return pin


class Command(BaseCommand):
    help = "Carrega dados fictícios de demonstração (somente desenvolvimento)."

    def add_arguments(self, parser):
        parser.add_argument("--forcar", action="store_true", help="Permite rodar com DEBUG=False (ambiente de testes).")

    @transaction.atomic
    def handle(self, *args, **opcoes):
        if not settings.DEBUG and not opcoes["forcar"]:
            raise CommandError("Recusado: DEBUG=False. Estes dados são fictícios; não carregue em produção.")

        senha = os.getenv("DEMO_SENHA") or secrets.token_urlsafe(9)
        pin = os.getenv("DEMO_PIN") or pin_aleatorio()

        setores = {}
        for nome, cc in SETORES:
            setores[nome], _ = Setor.objects.update_or_create(nome=nome, defaults={"centro_custo": cc, "ativo": True})

        for matricula, nome, perfil, cargo, setor, email in PESSOAS:
            usuario, _ = Usuario.objects.update_or_create(
                codigo_matricula=matricula,
                defaults={"nome": nome, "perfil": perfil, "cargo": cargo, "setor": setores[setor],
                          "email": email, "ativo": True},
            )
            definir_pin(usuario, pin)
            usuario.save(update_fields=["pin_hash"])
            conta = garantir_conta(usuario)
            if conta is not None:
                conta.set_password(senha)
                conta.save(update_fields=["password"])

        categorias = {}
        for nome in ("EPI", "Consumível"):
            categorias[nome], _ = CategoriaProduto.objects.get_or_create(nome=nome)

        produtos = {}
        for sku, nome, cat, custo, limite, requer, descricao, ca, tamanho, periodicidade in PRODUTOS:
            produtos[sku], _ = Produto.objects.update_or_create(
                sku=sku,
                defaults={"nome": nome, "categoria": categorias[cat], "custo_unitario": Decimal(custo),
                          "limite_padrao_mensal": limite, "requer_justificativa": requer,
                          "descricao": descricao, "ca": ca, "tamanho": tamanho,
                          "periodicidade_dias": periodicidade, "ativo": True},
            )

        totem, _ = Totem.objects.update_or_create(
            codigo="TOTEM-01", defaults={"nome": "Totem Principal", "localizacao": "Almoxarifado — Galpão A"}
        )
        for sku, (disponivel, minimo) in ESTOQUE.items():
            EstoqueTotem.objects.update_or_create(
                totem=totem, produto=produtos[sku],
                defaults={"quantidade_disponivel": disponivel, "quantidade_minima": minimo},
            )

        if not Solicitacao.objects.exists():
            self._solicitacoes_do_prototipo(produtos, totem)

        self.stdout.write(self.style.SUCCESS("Dados de demonstração carregados."))
        self.stdout.write("Backoffice: entre com qualquer e-mail @supplyflow.local da lista abaixo.")
        for _, nome, perfil, _, _, email in PESSOAS:
            if email:
                self.stdout.write(f"  {email:<34} {perfil}")
        self.stdout.write(f"Senha de todos (só deste banco local): {senha}")
        self.stdout.write(f"PIN do totem de todos: {pin}")


    def _solicitacoes_do_prototipo(self, produtos, totem):
        """Cria as solicitações do protótipo usando as MESMAS regras do sistema (nada gravado à mão)."""
        pessoa = {u.codigo_matricula: u for u in Usuario.objects.all()}
        tecnico, almoxarife = pessoa["T-001"], pessoa["003001"]

        # Ana: protetor auricular aprovado com devolução, devolvido e entregue
        s, *_ = servico_solicitacoes.criar_no_totem(
            pessoa["001302"], produtos["EPI-AURIC-01"], 1, totem, "substituicao",
            "O protetor endureceu e não veda mais o ouvido, mesmo com pouco tempo de uso.")
        servico_solicitacoes.decidir(s, tecnico, "aprovar_condicao", "Liberado mediante devolução do par antigo.",
                                     exige_devolucao=True)
        servico_entregas.registrar_devolucao(s, almoxarife, "DESGASTE_NORMAL", "DESCARTE")
        servico_entregas.confirmar_entrega(s, almoxarife)

        # João: retirada regular da luva há 10 dias (entregue)...
        s, *_ = servico_solicitacoes.criar_no_totem(pessoa["001245"], produtos["EPI-LUVA-01"], 1, totem)
        servico_solicitacoes.decidir(s, tecnico, "aprovar")
        servico_entregas.confirmar_entrega(s, almoxarife)
        dez_dias = timezone.now() - timedelta(days=10)
        Entrega.objects.filter(solicitacao=s).update(data=dez_dias)
        Solicitacao.objects.filter(pk=s.pk).update(data_solicitacao=dez_dias, data_conclusao=dez_dias)

        # ...e agora pede outra antes do prazo de 90 dias: substituição antecipada aguardando análise
        servico_solicitacoes.criar_no_totem(
            pessoa["001245"], produtos["EPI-LUVA-01"], 1, totem, "substituicao",
            "A luva rasgou durante o trabalho com uma peça metálica.")

        # Carlos Santos: discos acima do limite mensal, aguardando análise
        servico_solicitacoes.criar_no_totem(
            pessoa["001187"], produtos["CON-DISCO-01"], 12, totem, "retirada",
            "Manutenção corretiva na linha 2 consumiu mais discos que o normal neste mês.")
