"""Treina o classificador de justificativas e grava modelo + métricas em core/ia/modelo/.

Uso:
  python manage.py treinar_classificador
  python manage.py treinar_classificador --dados caminho/para/justificativas.csv --reais

O CSV precisa das colunas "texto" e "categoria" (uma das 10 categorias do TCC).
Use --reais apenas quando o arquivo tiver justificativas reais anonimizadas e revisadas.
"""
from django.core.management.base import BaseCommand

from core.ia import modelo, treino


class Command(BaseCommand):
    help = "Treina e avalia o classificador TF-IDF de justificativas (scikit-learn)."

    def add_arguments(self, parser):
        parser.add_argument("--dados", default=str(treino.DADOS_PADRAO), help="CSV com colunas texto,categoria")
        parser.add_argument("--reais", action="store_true",
                            help="Marca o conjunto como real (anonimizado), e não sintético.")

    def handle(self, *args, **opcoes):
        treino.treinar(opcoes["dados"], sintetico=not opcoes["reais"], registrar=self.stdout.write)
        modelo.recarregar()
        self.stdout.write(self.style.SUCCESS(f"Modelo salvo em {modelo.ARQUIVO_MODELO}"))
