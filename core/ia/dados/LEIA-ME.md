# Conjunto de justificativas — SINTÉTICO

`justificativas_sinteticas.csv` foi **escrito para o desenvolvimento** do SupplyFlow. Não contém dados de pessoas reais
e não foi coletado em empresa: são frases inventadas, no estilo de justificativas de substituição de EPI.

- 10 categorias (as da seção 3.5 do TCC), cerca de 25 exemplos cada.
- Há casos ambíguos de propósito (ex.: "rasgou no acidente" pode ser Acidente ou Dano durante atividade).
- Como o texto foi escrito por uma só pessoa, o vocabulário é mais regular que o real: **as métricas obtidas aqui
  tendem a ser otimistas** e não representam o desempenho com justificativas reais.

## Antes de usar os resultados no TCC

1. Revisar os rótulos com profissionais de segurança do trabalho (como prevê a seção 3.5).
2. Acrescentar justificativas reais **anonimizadas** — sem nome, matrícula, CPF ou outros dados pessoais (RNF-06, LGPD).
3. Retreinar: `python manage.py treinar_classificador`.

As categorias confirmadas pelos técnicos no sistema (campo `categoria_confirmada` da decisão) também podem virar
novos exemplos rotulados, depois de revisadas e anonimizadas.
