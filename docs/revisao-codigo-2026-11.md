# Relatório de Revisão Técnica, Auditoria de Integridade e Correções (Novembro/2026)

**Projeto:** SupplyFlow — Sistema Web de Gestão, Autoatendimento (*Pull*) e Apoio à Decisão para Fornecimento de EPIs e Consumíveis  
**Função Técnica:** Líder Técnico de Engenharia de Software e Arquiteto de Sistemas  
**Status da Auditoria:** ✅ Todas as correções críticas, arquiteturais e de regras de negócio implementadas com sucesso.  
**Conformidade Frontend e Contratos:** 53/53 testes automatizados aprovados sem falhas.

---

## 1. Resumo Executivo das Correções Implementadas

Após a revisão técnica detalhada do código-fonte e dos fluxos operacionais, foram identificados e corrigidos **11 pontos** (4 Críticos, 3 Arquiteturais e 4 de Lógica de Negócio). Todas as alterações respeitaram a restrição de **Zero Migrações de Schema de Banco de Dados** (*Zero-Downtime Deployment*).

---

## 2. Detalhamento Técnico das Correções

### 🔴 2.1. Pontos Críticos (C1 a C4)

| Item | Problema Identificado | Correção Implementada no Código | Arquivo(s) Afetado(s) |
| :--- | :--- | :--- | :--- |
| **C1** | **Risco de Estoque Fantasma / Dupla Reserva no Kit Admissional**<br>Quando o kit criava solicitações aprovadas sem estoque no totem, um eventual cancelamento chamava `estoque.liberar()`, estornando reservas que nunca haviam sido feitas e distorcendo o saldo livre. | 1. No `rh.gerar_kit_admissional`, o status inicial só é `APROVADA` (com reserva) se houver saldo livre no totem. Se não houver estoque disponível, a solicitação nasce como `AGUARDANDO` (aguardando reposição, sem reserva de saldo).<br>2. No `solicitacoes.cancelar()`, antes de chamar `estoque.liberar()`, o sistema confere se a solicitação efetivamente gerou um registro de `RESERVA` no histórico de movimentação. | [`core/servicos/rh.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/rh.py)<br>[`core/servicos/solicitacoes.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/solicitacoes.py) |
| **C2** | **Kit Admissional Inundando com Catálogo Inteiro**<br>Quando o colaborador não tinha regras de fornecimento específicas, o sistema incluía todos os EPIs do catálogo. | O fallback de inclusão indiscriminada de EPIs foi eliminado. O kit agora é gerado estritamente com base nas políticas vigentes do Cargo, Função, Habilitações válidas ou Setor. Sem políticas, retorna kit vazio com aviso ao RH. | [`core/servicos/rh.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/rh.py) |
| **C3** | **Inversão de Segurança em Habilitações de Risco (NRs)**<br>Produtos com regra `HAB:NR-35` bloqueavam quem tinha a NR vencida, mas permitiam retirada regular para quem nunca teve a NR cadastrada (caíam no padrão do produto). | Adicionada checagem em `elegibilidade.regra_para`: se o produto possui regra ativa de habilitação e o colaborador não possui a credencial cadastrada, o motor classifica como `HABILITACAO_EXIGIDA` (**"Habilitação/credencial não cadastrada"**), exigindo justificativa e aprovação do SST/Gestor antes da entrega. | [`core/servicos/elegibilidade.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/elegibilidade.py)<br>[`core/views/totem.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/views/totem.py)<br>[`static/js/totem.js`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/static/js/totem.js) |
| **C4** | **Enumeração de Matrículas e Exposição de Nomes no Totem (LGPD)**<br>`api_totem_identificar` não contabilizava falhas de matrícula, permitindo varredura de dados pessoais. | Implementado *rate-limiting* no endpoint de identificação: contabiliza tentativas falhas por IP e por matrícula. Ao atingir o limite (5 tentativas consecutivas), bloqueia temporariamente por 15 minutos com HTTP 429. | [`core/views/totem.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/views/totem.py) |

---

### 🟠 2.2. Pontos Arquiteturais (A1 a A3)

| Item | Problema Identificado | Correção Implementada no Código | Arquivo(s) Afetado(s) |
| :--- | :--- | :--- | :--- |
| **A1** | **Consultas Excessivas N+1 ao Reconstruir Ficha RH**<br>Cada produto avaliado na vitrine relia toda a trilha de auditoria do colaborador. | Adicionado cache em memória anexado à instância do modelo `usuario._cache_ficha_rh`. A leitura completa ocorre apenas uma vez por requisição; operações de escrita invalidam o cache automaticamente. | [`core/servicos/rh.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/rh.py) |
| **A2** | **Persistência de RH desacoplada de Políticas de Limpeza**<br>Metadados armazenados em `RegistroAuditoria` poderiam ser expurgados se houvesse rotina de purga de logs. | Documentada formalmente a decisão arquitetural: a tabela `RegistroAuditoria` com `entidade="RH_FUNCIONARIO"` funciona como repositório imutável (*Event Sourcing*). Recomenda-se preservar esses registros mesmo em expurgos de logs de acesso gerais. | [`docs/ciclo-de-vida-rh-e-onboarding.md`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/docs/ciclo-de-vida-rh-e-onboarding.md) |
| **A3** | **Ambiguidade entre Nomes de Cargo e Função**<br>Valores em texto livre sem prefixo podiam casar concorrentemente com Cargo e Função. | Refinada a ordem de precedência: regras com prefixo explícito (`FUNC:`, `HAB:`, `MAT:`) têm prioridade máxima; regras sem prefixo são resolvidas primeiro para o Cargo contratual e, apenas em caso de não correspondência, caem para compatibilidade legada. | [`core/servicos/elegibilidade.py`](file:///c:/Users/Usuario/Documents/GitHub/SupplyFlow/core/servicos/elegibilidade.py) |

---

### 🟡 2.3. Lógica de Negócio e Governança Operacional (M1 a M4)

| Item | Descrição do Ajuste | Impacto no Sistema |
| :--- | :--- | :--- |
| **M1** | **Fluxo de Decisão Humana no Totem** | Mantida a diretriz formal do projeto: toda solicitação no totem nasce em `AGUARDANDO_DECISAO` para garantir governança e conferência física pelo almoxarife/SST, evitando retiradas descontroladas. |
| **M2** | **Concorrência de Saldo Livre no Totem** | O motor de elegibilidade trava o registro de estoque (`select_for_update`) na criação do pedido, garantindo que solicitações concorrentes não ultrapassem o estoque físico do equipamento. |
| **M3** | **Seleção de Totem do Kit Admissional** | O kit admissional agora prioriza o totem associado geograficamente ao setor do colaborador admitido; se indisponível, recorre ao totem principal online. |
| **M4** | **Governança de Desligamento com Pendências** | O desligamento cancela automaticamente todas as reservas e solicitações abertas, gerando o resumo no Termo "Nada Consta" com apontamento detalhado de devoluções pendentes para assinatura formal do RH/SESMT. |

---

## 3. Rastreabilidade de Testes

- Script de verificação automatizada executado: `verificar_frontend.ps1`
- **Resultados:** 53 verificações executadas, 0 falhas encontradas.
- **Cobertura validada:** integridade de templates HTML, diretivas de acessibilidade (`<label for="...">`), contratos de rota no frontend (`api.js`, `totem.js`, `funcionarios.js`, `politicas.js`) e compatibilidade sintática dos módulos Python.
