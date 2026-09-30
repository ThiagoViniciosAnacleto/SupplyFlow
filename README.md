# SupplyFlow

Sistema web para gestão e rastreabilidade da distribuição de EPIs e materiais consumíveis, com autoatendimento e classificação de justificativas de substituição antecipada.

TCC de Engenharia de Software — UniCesumar, 2026
Matheus Vian Stoco e Thiago V. Anacleto de Almeida P.

---

## Estágio atual

**Só front-end, sem backend e sem banco de dados.** Esta primeira etapa traz:

- **Tela de login** com os cinco usuários de demonstração do protótipo. O login é fictício: nenhuma senha é pedida nem verificada — escolha um usuário e clique em **Entrar**.
- **Estrutura do backoffice**: barra lateral com o menu completo do protótipo, topo com o usuário logado e botão **Sair**.
- **Visão Geral**: indicadores, solicitações aguardando análise e os gráficos de entregas por mês e consumo por centro de custo.
- **Página provisória** para os demais itens do menu, que ainda não foram construídos.

Todos os dados exibidos são fictícios e ficam em `static/js/dados-demo.js`.

---

## Como abrir

### Opção 1 — Live Server no VS Code (recomendada)

1. No VS Code, abra a pasta `supplyflow`.
2. Instale a extensão **Live Server** (autor: Ritwick Dey).
3. Clique com o botão direito em `index.html` → **Open with Live Server**.

A página recarrega sozinha sempre que você salvar um arquivo.

### Opção 2 — Servidor do Python, pelo Prompt de Comando

```
cd caminho\para\supplyflow
python -m http.server 8000
```

Depois abra `http://localhost:8000` no navegador. Para parar o servidor: `Ctrl + C`.

### Opção 3 — Duplo clique

Abrir o `index.html` direto também funciona. Mas prefira as opções 1 ou 2: é assim que o sistema vai rodar quando o Django entrar, e alguns navegadores restringem recursos em arquivos abertos direto do disco.

---

## Estrutura

```
supplyflow/
├── index.html                  Tela de login (ponto de entrada)
├── backoffice/
│   ├── visao-geral.html        Painel inicial após o login
│   └── em-construcao.html      Página provisória das telas ainda não feitas
└── static/
    ├── css/supplyflow.css      Cores, fonte e layout do protótipo
    ├── js/
    │   ├── dados-demo.js       Dados FICTÍCIOS (sai quando o backend entrar)
    │   ├── sessao.js           Sessão fictícia: lembra o usuário escolhido
    │   ├── login.js            Comportamento da tela de login
    │   ├── backoffice.js       Monta lateral e topo em todas as páginas
    │   └── visao-geral.js      Indicadores, lista e gráficos
    ├── img/logo.svg
    └── vendor/                 Bibliotecas baixadas (funcionam sem internet)
        ├── bootstrap/          Bootstrap 5.3.3
        ├── bootstrap-icons/    Bootstrap Icons 1.11.3
        ├── chartjs/            Chart.js 4.4.4
        └── inter/              Fonte Inter
```

As bibliotecas estão dentro do projeto, e não carregadas da internet, para que o sistema funcione numa apresentação sem Wi-Fi.

---

## Stack

| Camada          | Tecnologia                         | Situação         |
|-----------------|------------------------------------|------------------|
| Interface       | HTML + Bootstrap + JavaScript puro | ✅ em andamento  |
| Backend         | Python + Django                    | próxima etapa    |
| Banco de dados  | PostgreSQL                         | próxima etapa    |
| Classificador   | scikit-learn + TF-IDF              | próxima etapa    |
| Versionamento   | GitHub                             | ✅               |
| Hospedagem      | Render                             | próxima etapa    |

---

## Subir no GitHub (Prompt de Comando)

**Antes:** crie um repositório **vazio** no GitHub chamado `supplyflow`. Não marque "Add a README" nem ".gitignore" — se o repositório nascer com arquivos, o primeiro `push` é recusado.

```
cd caminho\para\supplyflow
git init
git add .
git commit -m "Tela de login e painel inicial do backoffice (front-end estatico)"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/supplyflow.git
git push -u origin main
```

Troque `SEU-USUARIO` pelo seu usuário do GitHub. Se o Git pedir nome e e-mail na hora do commit, rode antes:

```
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
```

---

## Como isto vira Django depois

A estrutura já foi pensada para a migração:

- `static/` vira a pasta de arquivos estáticos do Django, sem mudanças.
- Os `.html` vão para `templates/`, trocando os caminhos por `{% static '...' %}`.
- O `backoffice.js` (lateral + topo) vira o template base `base.html`, e cada página estende ele com `{% block conteudo %}`.
- `dados-demo.js` e `sessao.js` são **apagados**: os dados passam a vir do banco e o login passa a ser o `django.contrib.auth`, com perfis de verdade.

---

## Próximas telas (seguindo o protótipo)

1. Solicitações — lista com a coluna de classificação da IA
2. Detalhe da solicitação — dados, análise da IA e painel de decisão
3. Totem — boas-vindas, matrícula, senha, produtos disponíveis e justificativa
4. Avaliação do modelo (IA) — matriz de confusão por categoria
