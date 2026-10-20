"""Treino e avaliação do classificador de justificativas (seção 3.5 e 3.6 do TCC).

Passos (todos reproduzíveis — semente fixa, RNF-16):
1. lê o CSV rotulado e normaliza o texto (minúsculas, sem acentos);
2. separa TREINO (75%) e TESTE (25%) de forma estratificada; o teste não é
   usado em nenhuma escolha;
3. compara Regressão Logística, Naive Bayes e SVM linear por validação
   cruzada (5 dobras) SÓ no treino, pela F1 macro;
4. treina o vencedor no treino inteiro e mede no teste: acurácia, precisão,
   revocação, F1 e matriz de confusão (RNF-17);
5. mede a linha de base por palavras-chave no MESMO teste, para comparação.
"""
import csv
import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, precision_recall_fscore_support
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

from . import CATEGORIAS, baseline
from .modelo import ARQUIVO_METRICAS, ARQUIVO_MODELO, PASTA

DADOS_PADRAO = Path(__file__).resolve().parent / "dados" / "justificativas_sinteticas.csv"
SEMENTE = 42
PROPORCAO_TESTE = 0.25


def ler_dados(caminho):
    textos, rotulos = [], []
    with open(caminho, encoding="utf-8", newline="") as arquivo:
        for linha in csv.DictReader(arquivo):
            texto, categoria = (linha.get("texto") or "").strip(), (linha.get("categoria") or "").strip()
            if not texto:
                continue
            if categoria not in CATEGORIAS:
                raise ValueError(f"Categoria desconhecida no CSV: {categoria!r}")
            textos.append(baseline.normalizar(texto))
            rotulos.append(categoria)
    return textos, rotulos


def candidatos():
    def tfidf():
        # Palavras (1 e 2 seguidas) + pedaços de 3 a 5 letras: "rasgou", "rasgada" e "rasgado"
        # ficam parecidos para o modelo. Escolhido por validação cruzada no treino.
        return FeatureUnion([
            ("palavras", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
            ("letras", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),
        ])

    return {
        "Regressão Logística": Pipeline([("tfidf", tfidf()), ("clf", LogisticRegression(max_iter=2000, C=10))]),
        "Naive Bayes": Pipeline([("tfidf", tfidf()), ("clf", MultinomialNB(alpha=0.1))]),
        "SVM linear": Pipeline([("tfidf", tfidf()),
                                ("clf", CalibratedClassifierCV(LinearSVC(C=1.0), cv=3))]),
    }


def metricas_de(rotulos_reais, previstos):
    precisao, revocacao, f1, suporte = precision_recall_fscore_support(
        rotulos_reais, previstos, labels=CATEGORIAS, zero_division=0)
    macro = precision_recall_fscore_support(rotulos_reais, previstos, labels=CATEGORIAS,
                                            average="macro", zero_division=0)
    return {
        "acuracia": round(float(accuracy_score(rotulos_reais, previstos)) * 100, 1),
        "precisao_macro": round(float(macro[0]) * 100, 1),
        "revocacao_macro": round(float(macro[1]) * 100, 1),
        "f1_macro": round(float(macro[2]) * 100, 1),
        "por_categoria": [
            {"categoria": c, "precisao": round(float(p) * 100, 1), "revocacao": round(float(r) * 100, 1),
             "f1": round(float(f) * 100, 1), "suporte": int(s)}
            for c, p, r, f, s in zip(CATEGORIAS, precisao, revocacao, f1, suporte)
        ],
        "matriz_confusao": confusion_matrix(rotulos_reais, previstos, labels=CATEGORIAS).tolist(),
    }


def treinar(caminho_dados=DADOS_PADRAO, sintetico=True, registrar=print):
    textos, rotulos = ler_dados(caminho_dados)
    x_treino, x_teste, y_treino, y_teste = train_test_split(
        textos, rotulos, test_size=PROPORCAO_TESTE, stratify=rotulos, random_state=SEMENTE)
    registrar(f"{len(textos)} exemplos: {len(x_treino)} para treino, {len(x_teste)} para teste.")

    dobras = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEMENTE)
    comparacao = []
    for nome, pipeline in candidatos().items():
        notas = cross_val_score(pipeline, x_treino, y_treino, cv=dobras, scoring="f1_macro")
        comparacao.append({"algoritmo": nome, "f1_macro_cv": round(float(np.mean(notas)) * 100, 1),
                           "desvio": round(float(np.std(notas)) * 100, 1)})
        registrar(f"  {nome:<20} F1 macro (validação cruzada no treino): {np.mean(notas):.3f} ± {np.std(notas):.3f}")

    vencedor = max(comparacao, key=lambda c: c["f1_macro_cv"])["algoritmo"]
    pipeline = candidatos()[vencedor]
    pipeline.fit(x_treino, y_treino)
    modelo = metricas_de(y_teste, pipeline.predict(x_teste))
    linha_base = metricas_de(y_teste, [baseline.classificar(t)[0] for t in x_teste])
    confianca_media = float(np.mean(np.max(pipeline.predict_proba(x_teste), axis=1))) * 100

    agora = datetime.now()
    versao = f"tfidf-{'lr' if 'Log' in vencedor else 'nb' if 'Naive' in vencedor else 'svm'}-{agora:%Y%m%d}"
    PASTA.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": pipeline, "versao": versao, "categorias": CATEGORIAS}, ARQUIVO_MODELO, compress=3)

    resultado = {
        "versao": versao,
        "algoritmo": vencedor,
        "treinado_em": agora.strftime("%d/%m/%Y %H:%M"),
        "dados": {
            "arquivo": Path(caminho_dados).name,
            "sintetico": sintetico,
            "total": len(textos),
            "treino": len(x_treino),
            "teste": len(x_teste),
            "proporcao_teste": PROPORCAO_TESTE,
            "semente": SEMENTE,
        },
        "categorias": CATEGORIAS,
        "comparacao_algoritmos": comparacao,
        "modelo": modelo,
        "linha_base": linha_base,
        "confianca_media_teste": round(confianca_media, 1),
        "versoes": {"scikit-learn": sklearn.__version__},
    }
    ARQUIVO_METRICAS.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
    registrar(f"Vencedor: {vencedor}. Teste: acurácia {modelo['acuracia']}%, F1 macro {modelo['f1_macro']}% "
              f"(linha de base: acurácia {linha_base['acuracia']}%, F1 macro {linha_base['f1_macro']}%).")
    return resultado
