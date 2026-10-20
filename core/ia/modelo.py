"""Carrega o classificador treinado e faz a previsão.

O arquivo do modelo é gerado por `python manage.py treinar_classificador`.
Se ele não existir (ou o scikit-learn não estiver instalado), prever() devolve
None e o sistema usa a linha de base por palavras-chave.
"""
import json
from functools import lru_cache
from pathlib import Path

PASTA = Path(__file__).resolve().parent / "modelo"
ARQUIVO_MODELO = PASTA / "classificador.joblib"
ARQUIVO_METRICAS = PASTA / "metricas.json"

# Usadas só para escolher quais termos mostrar na explicação (o modelo vê o texto inteiro)
PALAVRAS_VAZIAS = set("""a o as os um uma uns umas de da do das dos em na no nas nos com sem por para pra
e ou mas que se ja nao mais muito meu minha meus minhas seu sua eu ele ela ao aos esta este isso foi
era estava tem tinha ter""".split())


@lru_cache(maxsize=1)
def _carregar():
    if not ARQUIVO_MODELO.exists():
        return None
    try:
        import joblib
    except ImportError:
        return None
    return joblib.load(ARQUIVO_MODELO)


def recarregar():
    _carregar.cache_clear()


def prever(texto):
    """(categoria, confiança 0-100, termos que mais pesaram, versão) ou None sem modelo."""
    pacote = _carregar()
    if pacote is None:
        return None
    from .baseline import normalizar

    pipeline = pacote["pipeline"]
    entrada = [normalizar(texto)]
    probabilidades = pipeline.predict_proba(entrada)[0]
    classes = list(pipeline.classes_)
    indice = int(probabilidades.argmax())
    categoria = classes[indice]
    return categoria, float(probabilidades[indice]) * 100, _termos_relevantes(pipeline, entrada, indice), pacote["versao"]


def _termos_relevantes(pipeline, entrada, indice_classe, quantos=3):
    """Palavras do texto que mais empurraram a decisão para a classe escolhida."""
    try:
        vetorizador = pipeline.named_steps["tfidf"]
        classificador = pipeline.named_steps["clf"]
        pesos = getattr(classificador, "coef_", None)
        if pesos is None and hasattr(classificador, "calibrated_classifiers_"):
            # SVM calibrado: média dos pesos dos modelos internos da calibração
            import numpy as np

            pesos = np.mean([c.estimator.coef_ for c in classificador.calibrated_classifiers_], axis=0)
        if pesos is None:
            return []
        vetor = vetorizador.transform(entrada).tocoo()
        nomes = vetorizador.get_feature_names_out()
        contribuicoes = sorted(
            ((valor * pesos[indice_classe][col], nomes[col]) for col, valor in zip(vetor.col, vetor.data)
             if nomes[col].startswith("palavras__")),  # só palavras inteiras: são legíveis para o técnico
            reverse=True,
        )
        termos = []
        for contribuicao, nome in contribuicoes:
            termo = nome.split("__", 1)[1]
            if contribuicao <= 0 or len(termos) == quantos:
                break
            if all(p in PALAVRAS_VAZIAS for p in termo.split()):
                continue  # "uma", "com o"... não explicam nada para o técnico
            termos.append(termo)
        return termos
    except Exception:  # explicabilidade é complemento: nunca derruba a previsão
        return []


def metricas():
    """Métricas da última avaliação (geradas no treino) ou None."""
    if not ARQUIVO_METRICAS.exists():
        return None
    return json.loads(ARQUIVO_METRICAS.read_text(encoding="utf-8"))
