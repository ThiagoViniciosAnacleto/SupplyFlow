# SupplyFlow

Sistema web para gestão e rastreabilidade da distribuição de EPIs e materiais consumíveis, com autoatendimento (totem) e classificação, por IA, das justificativas de substituição antecipada.

TCC de Engenharia de Software — UniCesumar, 2026
Matheus Vian Stoco e Thiago V. Anacleto de Almeida P.

---

## O que o sistema faz

- **Backoffice** com login por e-mail e senha, perfis (Administrador, Gestor, Técnico de Segurança, Almoxarife, Comprador) e permissões conferidas no servidor.
- **Totem de autoatendimento**: o colaborador se identifica pela matrícula e PIN, vê o que pode retirar e faz o pedido. O servidor calcula a cota mensal, a periodicidade de troca, o estoque e se o pedido é uma exceção (que exige justificativa).
- **Decisão humana**: toda solicitação passa por aprovação. O responsável aprova, aprova com condição (ex.: devolver o EPI antigo) ou rejeita.
- **IA de apoio**: um classificador TF-IDF (scikit-learn) sugere a categoria da justificativa. **A IA não aprova, não rejeita e não bloqueia nada** — o técnico confirma ou reclassifica, e as duas categorias ficam registradas.
- **Estoque** com reserva na aprovação e baixa só na entrega física; toda movimentação fica registrada.
- **Entregas, devoluções e ficha de EPI** por funcionário, com CA e lote do momento.
- **Gestão**: histórico com filtros, relatórios de consumo e justificativas, exportação CSV e trilha de auditoria.

## Rodar na sua máquina (Windows, Prompt de Comando)

Pré-requisito: Python 3.12 ou mais novo.

```
cd caminho\para\SupplyFlow
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

Abra o `.env` e deixe `DEBUG=True`. Sem `DATABASE_URL`, o projeto usa um SQLite local (`db.sqlite3`, fora do git).

```
venv\Scripts\python.exe manage.py migrate
venv\Scripts\python.exe manage.py carregar_demo
venv\Scripts\python.exe manage.py runserver
```

Abra `http://localhost:8000`. O `carregar_demo` cria dados **fictícios** (os do protótipo) e mostra no terminal a senha e o PIN de demonstração — eles são sorteados a cada execução; para fixá-los, defina `DEMO_SENHA` e `DEMO_PIN` antes do comando. Ele só roda com `DEBUG=True`.

O "Esqueci minha senha" e o convite de primeiro acesso mandam e-mail. Sem `EMAIL_HOST` no `.env`, o e-mail aparece no terminal do `runserver` (é só copiar o link).

### Testes automáticos

```
venv\Scripts\python.exe manage.py test core
```

São 56 testes: login e permissões, regras do totem, estados da solicitação, estoque, decisão, entrega, devolução, IA e relatórios.

### IA: treinar e avaliar

```
venv\Scripts\python.exe manage.py treinar_classificador
```

Separa 75% para treino e 25% para teste (estratificado, semente fixa), compara Regressão Logística, Naive Bayes e SVM linear por validação cruzada só no treino, mede no teste acurácia, precisão, revocação, F1 e matriz de confusão, e compara com uma linha de base por palavras-chave. O modelo e as métricas ficam em `core/ia/modelo/` e aparecem na tela **Avaliação do modelo (IA)**.

> ⚠️ O conjunto atual (`core/ia/dados/justificativas_sinteticas.csv`) é **sintético**. Antes de usar os números no TCC, revise os rótulos com profissionais e acrescente justificativas reais **anonimizadas** — veja `core/ia/dados/LEIA-ME.md`.

## Deploy no Render

Variáveis de ambiente obrigatórias: `SECRET_KEY` (gere com `python -c "import secrets; print(secrets.token_urlsafe(50))"`) e `DATABASE_URL`. Com `DEBUG` ausente, o sistema roda em modo de produção (HTTPS, cookies seguros) e se recusa a subir sem `SECRET_KEY`. O endereço do Render entra sozinho em `ALLOWED_HOSTS`.

- **Build:** `pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate`
- **Start:** `gunicorn config.wsgi`
- **Banco que já existia antes das migrações** (criado à mão): rode **uma vez** `python manage.py migrate --fake-initial`. A migração `0004` converte os registros antigos (status, categorias da IA, entregas e reservas).
- Senhas e PINs antigos em MD5 continuam funcionando e são convertidos para hash forte no primeiro uso correto.
- Para o e-mail de senha: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` (ou `BREVO_API_KEY` / `RESEND_API_KEY` via HTTPS em ambientes que bloqueiam a porta 587).

## Estrutura

```
SupplyFlow/
├── config/                 Configuração do Django (settings lê tudo do .env)
├── core/
│   ├── models.py           Tabelas do sistema
│   ├── migrations/         Esquema do banco versionado
│   ├── permissoes.py       Perfis e ações permitidas (RF-09)
│   ├── seguranca.py        PIN, senhas antigas e limite de tentativas
│   ├── contas.py           Contas do backoffice e link de senha
│   ├── correio.py          Envio resiliente de e-mail (SMTP com timeout + API HTTPS + fallback console)
│   ├── auditoria.py        Registro das operações críticas
│   ├── servicos/           Regras de negócio (estados, elegibilidade, estoque, decisão, entrega)
│   ├── ia/                 Classificador, linha de base, treino e dados
│   ├── views/              APIs e páginas, divididas por assunto
│   ├── management/         Comandos carregar_demo e treinar_classificador
│   └── tests/              Testes automáticos
├── templates/              Telas de senha e de acesso negado
├── index.html              Login do backoffice
├── backoffice/             Telas do backoffice
├── totem/                  Tela do autoatendimento
└── static/                 CSS, JavaScript e bibliotecas (funcionam sem internet)
```

## Arquitetura do Frontend (`static/js/`, `backoffice/` e `totem/`)

O frontend foi construído em **HTML semântico + Bootstrap 5 + JavaScript puro**, organizado no namespace global `window.SF`:

1. **`static/js/api.js` (`SF.api`)**: centraliza todas as chamadas `fetch()` para `/api/...`, incluindo automaticamente o cookie de sessão e o cabeçalho `X-CSRFToken` nas requisições `POST`. Quando o servidor retorna `401`, redireciona para `/?proximo=...`.
2. **`static/js/sessao.js` (`SF.sessao`)**: mantém em `sessionStorage` apenas um cache visual dos dados de exibição do usuário (`nome`, `iniciais`, `perfil`, `acoes`) para que o topo e o menu não pisquem a cada troca de página. **Decisão de segurança**: a autorização real nunca confia no navegador; toda rota HTML e JSON valida a sessão e o perfil no servidor Django.
3. **`static/js/menu.js` (`SF.menu`) e `static/js/backoffice.js`**: montam dinamicamente a barra lateral (`#sidebar`) e o cabeçalho (`#topbar`) lendo `data-pagina`, `data-menu` e `data-trilha` do `<body>`, além de fornecer `SF.escapar()` para sanitização contra XSS ao montar HTML dinâmico.
4. **Scripts por tela (`static/js/*.js`)**: cada página possui seu próprio módulo em IIFE (`(function () { ... })()`), separando funções de formatação/renderização de linhas (`criarLinha...Html`) dos ouvintes de eventos e chamadas à API.
5. **Acessibilidade e Semântica**:
   - Controles interativos utilizam elementos nativos (`<button type="button">`, `<a>`, `<input>`, `<select>`, `<textarea>`).
   - Todos os campos de formulário e filtros possuem `<label for="...">` associado ao `id` do controle e descrições auxiliares conectadas via `aria-describedby`.
   - Botões que exibem apenas ícones possuem `aria-label` descritivo e ícones decorativos usam `aria-hidden="true"`.

## Perfis e permissões

| Perfil | Pode |
|---|---|
| Administrador | tudo, inclusive funcionários, usuários e auditoria |
| Gestor / Técnico de Segurança | consultar, decidir solicitações, dispensar/registrar devoluções |
| Almoxarife | consultar, confirmar entregas, registrar devoluções, movimentar estoque |
| Comprador | consultar, produtos, fornecedores, políticas e estoque |
| Colaborador | só o totem |

A tela **Usuários e permissões** mostra a matriz completa, lida do servidor.

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | HTML + Bootstrap 5 + JavaScript puro |
| Backend | Python + Django 6 |
| Banco | PostgreSQL (SQLite no desenvolvimento) |
| IA | scikit-learn (TF-IDF + SVM linear calibrado) |
| Hospedagem | Render |
