"""Módulo de IA do SupplyFlow (seção 3.5 do TCC).

A IA só SUGERE a categoria da justificativa de uma solicitação excepcional.
Ela não aprova, não rejeita e não bloqueia nada (RF-25, RNF-15). O texto da
justificativa é a única entrada: nome, matrícula e outros dados pessoais
nunca chegam ao classificador (RNF-06).
"""

CATEGORIAS = [
    "Perda",
    "Desgaste normal",
    "Desgaste prematuro",
    "Defeito de fabricação",
    "Dano durante atividade",
    "Contaminação",
    "Tamanho inadequado",
    "Acidente",
    "Mudança de função",
    "Outro",
]
