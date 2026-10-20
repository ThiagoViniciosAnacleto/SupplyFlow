"""Sugestão de categoria para a justificativa (RF-22, RNF-14).

Usa o modelo treinado (core/ia/modelo/classificador.joblib) quando ele existe.
Sem o modelo, cai na linha de base por palavras-chave e diz isso claramente
(fonte = "palavras-chave", sem confiança inventada).
"""
import time
from dataclasses import dataclass, field

from ..ia import baseline
from ..ia import modelo as modelo_ia


@dataclass
class Sugestao:
    categoria: str
    confianca: float | None  # 0 a 100; None quando a fonte não estima probabilidade
    fonte: str               # "modelo" ou "palavras-chave"
    versao: str
    termos: list = field(default_factory=list)  # palavras que mais pesaram (explicabilidade)
    tempo_ms: int = 0


def sugerir(texto):
    inicio = time.perf_counter()
    resultado = modelo_ia.prever(texto)
    if resultado is not None:
        categoria, confianca, termos, versao = resultado
        return Sugestao(categoria, round(confianca, 1), "modelo", versao, termos,
                        int((time.perf_counter() - inicio) * 1000))
    categoria, radical = baseline.classificar(texto)
    return Sugestao(categoria, None, "palavras-chave", "baseline-palavras-chave",
                    [radical] if radical else [], int((time.perf_counter() - inicio) * 1000))
