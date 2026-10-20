"""Linha de base por palavras-chave (comparação exigida pelo RNF-17).

Regras simples e transparentes: a primeira categoria cujo radical aparece no
texto vence. Serve para medir quanto o modelo treinado ganha sobre uma
abordagem ingênua — não deve ser apresentada como "a IA".
"""
import re
import unicodedata

RADICAIS = [
    ("Acidente", ["acident", "explos", "incendi", "pegou fogo", "queimou", "atropel", "caiu de"]),
    ("Contaminação", ["contamin", "oleo", "graxa", "quimic", "produto toxic", "solvente", "acido", "sangue"]),
    ("Defeito de fabricação", ["defeito", "fabrica", "veio com", "costura solt", "veio rasgad", "novo e ja"]),
    ("Tamanho inadequado", ["apert", "larg", "tamanho", "pequen", "grand", "nao serve", "numeracao"]),
    ("Mudança de função", ["mudei de funcao", "nova funcao", "transferid", "mudanca de setor", "promovid", "novo cargo"]),
    ("Perda", ["perd", "sumiu", "sumid", "extravi", "esqueci", "roubad", "furtad", "nao encontr"]),
    ("Dano durante atividade", ["rasg", "furou", "fur", "quebr", "cort", "danific", "partiu", "trinc"]),
    ("Desgaste prematuro", ["endurec", "rachou", "pouco tempo", "cedo", "antes do prazo", "descolou", "ressec"]),
    ("Desgaste normal", ["desgast", "velh", "gast", "vencid", "tempo de uso", "fim da vida"]),
]


def normalizar(texto):
    """Minúsculas e sem acentos: 'Contaminação' -> 'contaminacao'."""
    texto = unicodedata.normalize("NFD", (texto or "").lower())
    texto = "".join(c for c in texto if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", texto).strip()


def classificar(texto):
    """Devolve (categoria, radical_que_decidiu). O radical precisa estar no começo
    de uma palavra: "sumiu" casa com "sumiu", mas não com "consumiu"."""
    alvo = normalizar(texto)
    for categoria, radicais in RADICAIS:
        for radical in radicais:
            if re.search(r"\b" + re.escape(radical), alvo):
                return categoria, radical
    return "Outro", None
