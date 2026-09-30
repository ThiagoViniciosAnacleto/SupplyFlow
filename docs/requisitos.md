# Requisitos do SupplyFlow

Extraído do Apêndice A do TCC. 50 requisitos funcionais (RF) e 18 não funcionais (RNF). Use os códigos (ex.: RF-27) para dizer qual requisito cada tela atende.

Este apêndice apresenta a especificação preliminar dos requisitos funcionais (RF) e não funcionais (RNF) do sistema, levantados a partir do referencial teórico, da experiência profissional dos autores e do escopo definido nos objetivos geral e específicos. Os requisitos serão revisados e detalhados ao longo do desenvolvimento do artefato.

## Requisitos funcionais

### RF-01 — Gerenciar funcionários

O sistema deve permitir cadastrar, consultar, editar, ativar e inativar funcionários.

### RF-02 — Gerenciar centros de custo

O sistema deve permitir cadastrar, consultar, editar, ativar e inativar centros de custo.

### RF-03 — Gerenciar cargos

O sistema deve permitir cadastrar e manter os cargos existentes na organização.

### RF-04 — Gerenciar funções

O sistema deve permitir cadastrar funções e associá-las aos funcionários.

### RF-05 — Gerenciar fornecedores

O sistema deve permitir cadastrar e manter os fornecedores de EPIs e materiais consumíveis.

### RF-06 — Gerenciar produtos

O sistema deve permitir cadastrar, consultar, editar, ativar e inativar EPIs e materiais consumíveis.

### RF-07 — Manter dados específicos de EPI

O sistema deve permitir registrar atributos específicos de EPIs, como Certificado de Aprovação, tamanho, modelo, lote e validade, quando aplicável.

### RF-08 — Autenticar usuários administrativos

O sistema deve permitir a autenticação dos usuários autorizados a acessar o módulo administrativo.

### RF-09 — Controlar acesso por papéis

O sistema deve restringir funcionalidades conforme o perfil do usuário, como administrador, comprador, almoxarife, técnico de segurança ou gestor.

### RF-10 — Identificar funcionário no autoatendimento

A interface de autoatendimento deve permitir identificar o funcionário por um identificador previsto pelo sistema, como matrícula, CPF ou crachá/RFID.

### RF-11 — Autenticar funcionário no autoatendimento

Após a identificação, o sistema deve validar a autenticação do funcionário antes de permitir uma solicitação.

### RF-12 — Associar produtos a funções e grupos

O sistema deve permitir definir quais EPIs ou materiais consumíveis podem ser fornecidos conforme função, funcionário, setor ou centro de custo.

### RF-13 — Definir periodicidade de EPI

O sistema deve permitir configurar o intervalo mínimo entre fornecimentos de determinado EPI.

### RF-14 — Definir limites para consumíveis

O sistema deve permitir configurar limites de quantidade de materiais consumíveis por período, funcionário, função, setor ou centro de custo.

### RF-15 — Calcular elegibilidade para retirada

O sistema deve verificar automaticamente se um funcionário está autorizado a retirar determinado produto considerando suas regras de fornecimento.

### RF-16 — Exibir produtos disponíveis no autoatendimento

O sistema deve apresentar ao funcionário os produtos disponíveis para retirada.

### RF-17 — Exibir produtos temporariamente indisponíveis

O sistema deve informar os produtos para os quais o funcionário possui vínculo, mas cuja retirada está bloqueada por periodicidade, limite ou outra regra.

### RF-18 — Solicitar retirada de produto

O funcionário deve poder solicitar a retirada de um EPI ou material consumível autorizado.

### RF-19 — Identificar solicitações excepcionais

O sistema deve detectar quando uma solicitação viola uma regra normal de periodicidade, quantidade ou elegibilidade e tratá-la como excepcional.

### RF-20 — Solicitar justificativa para substituição antecipada

Quando o funcionário solicitar antecipadamente um EPI, o sistema deve solicitar uma justificativa textual.

### RF-21 — Permitir acompanhamento da solicitação

O funcionário deve poder consultar o estado de suas solicitações.

### RF-22 — Classificar justificativa por IA

O sistema deve utilizar um modelo de classificação textual para sugerir uma categoria para a justificativa de substituição antecipada.

### RF-23 — Exibir resultado da classificação

O sistema deve apresentar ao técnico de segurança ou gestor a categoria sugerida pela IA.

### RF-24 — Permitir correção humana da classificação

O responsável deve poder confirmar ou alterar a categoria sugerida pelo modelo.

### RF-25 — Impedir decisão autônoma pela IA

A classificação da IA não deve, isoladamente, aprovar ou rejeitar uma solicitação.

### RF-26 — Encaminhar solicitações excepcionais

O sistema deve encaminhar solicitações excepcionais ao responsável autorizado.

### RF-27 — Permitir aprovação ou rejeição

O técnico de segurança ou gestor deve poder aprovar ou rejeitar uma solicitação excepcional.

### RF-28 — Registrar justificativa da decisão

O responsável deve poder registrar o motivo da aprovação ou rejeição.

### RF-29 — Permitir aprovação condicionada

O sistema deve permitir aprovar uma substituição de EPI condicionada ao cumprimento de requisitos adicionais.

### RF-30 — Controlar estados da solicitação

O sistema deve controlar as transições válidas do ciclo de vida de cada solicitação.

### RF-31 — Registrar devolução de EPI

O almoxarife deve poder registrar a devolução do EPI anteriormente fornecido.

### RF-32 — Vincular devolução à entrega original

A devolução deve permanecer associada ao fornecimento original daquele equipamento.

### RF-33 — Registrar condição do EPI devolvido

O sistema deve permitir registrar a condição observada do equipamento.

### RF-34 — Registrar destinação do EPI devolvido

O sistema deve permitir registrar a destinação do equipamento, como descarte, avaliação técnica, quarentena ou devolução ao fornecedor.

### RF-35 — Bloquear entrega quando condição obrigatória não for cumprida

Caso a autorização exija devolução, o sistema não deve concluir a nova entrega enquanto a condição não for atendida ou formalmente dispensada por usuário autorizado.

### RF-36 — Registrar entradas de estoque

O sistema deve permitir registrar o recebimento de EPIs e materiais consumíveis.

### RF-37 — Controlar saldo de estoque

O sistema deve manter o saldo disponível de cada produto.

### RF-38 — Controlar lotes quando aplicável

O sistema deve permitir rastrear produtos por lote.

### RF-39 — Reservar estoque para solicitação aprovada

Uma solicitação aprovada poderá reservar a quantidade necessária antes da entrega.

### RF-40 — Baixar estoque somente após a entrega

A saída definitiva deve ocorrer somente quando o almoxarife confirmar a entrega física.

### RF-41 — Confirmar entrega

O almoxarife deve confirmar a entrega física do produto ao funcionário.

### RF-42 — Registrar dados da entrega

O sistema deve registrar, quando aplicável: funcionário, produto, quantidade, lote, Certificado de Aprovação, centro de custo ou setor, data e horário da entrega, almoxarife responsável e vínculo com a solicitação de origem.

### RF-43 — Atualizar ficha eletrônica de EPI

Após a entrega de um EPI, o sistema deve atualizar o histórico individual de fornecimento do funcionário.

### RF-44 — Consultar histórico do funcionário

Usuários autorizados devem poder consultar o histórico de retiradas do funcionário.

### RF-45 — Consultar histórico de produto

O sistema deve permitir consultar as movimentações relacionadas a determinado produto.

### RF-46 — Registrar trilha de auditoria

O sistema deve registrar operações críticas, incluindo responsável, ação, data e horário.

### RF-47 — Permitir filtros avançados

O histórico deve poder ser filtrado por critérios como: período, funcionário, função, setor, centro de custo, produto, tipo de movimentação (entrega, devolução, entrada, baixa), status da solicitação e responsável pela operação.

### RF-48 — Gerar indicadores

O sistema deve disponibilizar indicadores operacionais derivados das movimentações.

### RF-49 — Exportar dados

O sistema deve permitir exportar históricos e relatórios em formato adequado, como CSV ou XLSX.

### RF-50 — Cancelar solicitação

O funcionário deve poder cancelar uma solicitação de retirada enquanto esta não tiver sido aprovada ou entregue, liberando eventual reserva de estoque associada.

## Requisitos não funcionais

### RNF-01 — Responsividade

O sistema web deve se adaptar a computadores, notebooks, tablets e dispositivos móveis.

### RNF-02 — Compatibilidade web

O sistema deve funcionar por navegador moderno, sem exigir instalação de aplicativo nativo para as funcionalidades principais.

### RNF-03 — Segurança de autenticação

Funcionalidades administrativas e operações identificadas devem exigir autenticação válida.

### RNF-04 — Controle de autorização

O backend deve validar as permissões do usuário independentemente das restrições apresentadas na interface.

### RNF-05 — Proteção de dados pessoais

O tratamento dos dados dos funcionários deve respeitar finalidade, necessidade, segurança e demais princípios aplicáveis da LGPD.

### RNF-06 — Minimização de dados para IA

O modelo de classificação não deve utilizar CPF, nome, matrícula ou outros identificadores pessoais que não sejam necessários para classificar a justificativa.

### RNF-07 — Auditabilidade

Eventos críticos devem gerar registros suficientes para reconstruir posteriormente quem realizou determinada operação e quando ela ocorreu.

### RNF-08 — Integridade do estoque

Operações de reserva, entrega, cancelamento e baixa não devem resultar em saldos inconsistentes ou negativos decorrentes de concorrência entre operações.

### RNF-09 — Consistência transacional

Uma entrega não deve ser registrada parcialmente.

### RNF-10 — Usabilidade do autoatendimento

A interface destinada aos funcionários deve apresentar fluxo simples, mensagens compreensíveis e quantidade reduzida de etapas para realizar uma solicitação.

### RNF-11 — Clareza das restrições

Quando uma retirada não estiver disponível, o sistema deve informar ao usuário o motivo da restrição, em vez de apresentar apenas erro genérico.

### RNF-12 — Separação modular

O sistema deve manter responsabilidades separadas entre os módulos de autenticação, organização, produtos, estoque, políticas, solicitações, aprovações, devoluções, entregas, relatórios, auditoria e IA.

### RNF-13 — Manutenibilidade

Alterações nas políticas de fornecimento não devem exigir modificações dispersas em módulos não relacionados.

### RNF-14 — Explicabilidade da IA

O sistema deve informar ao responsável pelo menos a categoria sugerida e o indicador de confiança produzido pelo classificador.

### RNF-15 — Supervisão humana da IA

Nenhuma decisão de aprovação, rejeição ou acusação de irregularidade poderá depender exclusivamente do resultado do modelo.

### RNF-16 — Reprodutibilidade da avaliação da IA

Os conjuntos de treinamento e teste devem permanecer separados, permitindo avaliar o classificador sobre dados não utilizados em seu treinamento.

### RNF-17 — Desempenho mensurável da IA

O modelo deverá ser avaliado utilizando, no mínimo: acurácia, precisão, revocação, F1-score e matriz de confusão, com resultados comparados a uma linha de base baseada em palavras-chave.

### RNF-18 — Persistência dos registros históricos

Alterações posteriores em funcionários, funções ou produtos não devem apagar o contexto histórico das entregas já realizadas.

50 requisitos funcionais e 18 requisitos não funcionais.
