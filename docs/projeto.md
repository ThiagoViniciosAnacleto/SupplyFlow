# Projeto do SupplyFlow — decisões do TCC

Trechos do TCC com os objetivos, o escopo, a arquitetura, o módulo de IA e a proteção de dados. É daqui que saem as regras de negócio: consulte antes de decidir como uma tela deve se comportar.

## 2.1 Objetivo geral

Desenvolver e avaliar um sistema web responsivo para gestão e rastreabilidade do fornecimento de Equipamentos de Proteção Individual e materiais consumíveis, composto por um módulo administrativo e uma interface de autoatendimento, capaz de aplicar regras de elegibilidade, periodicidade e limites de consumo, controlar solicitações e autorizações excepcionais, registrar movimentações de estoque, manter fichas eletrônicas de fornecimento de EPIs e utilizar técnicas de inteligência artificial para classificar justificativas de substituição antecipada de EPIs.

## 2.2 Objetivos específicos

1. Levantar e modelar os processos relacionados ao fornecimento, à reposição, à substituição, à devolução e ao controle de EPIs e materiais consumíveis.

2. Implementar o cadastro de funcionários, cargos, funções, centros de custo, fornecedores, EPIs e materiais consumíveis.

3. Implementar controle de acesso baseado em papéis para diferenciar as permissões de almoxarifes, compradores, gestores, técnicos de segurança e administradores.

4. Desenvolver uma interface administrativa para gestão de funcionários, produtos, estoque, solicitações, aprovações, devoluções e entregas.

5. Desenvolver uma interface de autoatendimento para identificação, autenticação, consulta dos produtos autorizados e solicitação de EPIs e materiais consumíveis pelos funcionários.

6. Implementar regras de fornecimento que considerem função, setor, centro de custo, produtos atribuídos, histórico de retiradas, periodicidade, limites de quantidade e disponibilidade em estoque.

7. Implementar políticas distintas para o fornecimento de EPIs e materiais consumíveis, considerando os requisitos aplicáveis a cada categoria.

8. Implementar um fluxo de autorização para solicitações excepcionais, incluindo substituições antecipadas de EPIs e retiradas de consumíveis acima dos limites definidos.

9. Permitir que autorizações excepcionais de substituição de EPIs sejam condicionadas à devolução e à avaliação do equipamento anteriormente fornecido.

10. Registrar a condição e a destinação dos EPIs devolvidos, vinculando-os à entrega original.

11. Desenvolver e integrar um modelo de classificação textual para categorizar as justificativas apresentadas nas solicitações de substituição antecipada de EPIs.

12. Manter a rastreabilidade das operações, incluindo participantes, produto, lote, Certificado de Aprovação quando aplicável, centro de custo, data, horário, decisão e movimentação de estoque.

13. Disponibilizar históricos de fornecimento, relatórios operacionais, indicadores e exportação dos registros.

14. Avaliar o sistema por meio de testes funcionais, testes de usabilidade e métricas de desempenho do classificador.

3. Metodologia

## 3.3 Levantamento e especificação dos requisitos

O levantamento será realizado a partir da experiência profissional dos autores, de revisão bibliográfica e documental e, quando houver disponibilidade, de entrevistas semiestruturadas com profissionais de almoxarifado, recursos humanos e segurança do trabalho. Os relatos obtidos serão utilizados para identificar participantes, eventos, regras, exceções, dados obrigatórios e dificuldades do processo, sem substituir a validação formal dos requisitos.

Os requisitos serão documentados por meio de histórias de usuário, critérios de aceite, diagramas de fluxo e modelo de domínio. Os cenários relacionados aos EPIs incluirão retirada regular, substituição antecipada, aprovação com devolução obrigatória, dispensa de devolução, rejeição, falta de estoque, cancelamento, confirmação de entrega e atualização da ficha eletrônica. Para os materiais consumíveis, serão contempladas retiradas dentro do limite, solicitações acima da quantidade autorizada, vinculação ao setor ou centro de custo, aprovação por gestor, ausência de saldo e tentativas de solicitação duplicada.

## 3.4 Projeto arquitetural e desenvolvimento

A solução será implementada como um monólito modular, mantendo separação lógica entre os módulos de autenticação e autorização, estrutura organizacional, produtos, estoque, políticas de fornecimento, solicitações, aprovações, devoluções de EPIs, entregas, fichas, auditoria, relatórios e inteligência artificial. Essa escolha reduz a complexidade operacional de microsserviços e preserva limites claros entre as responsabilidades do sistema.

Serão disponibilizadas duas interfaces: um backoffice administrativo e uma interface de autoatendimento. Ambas utilizarão os mesmos serviços de domínio, mas possuirão permissões e fluxos distintos. O acesso administrativo será protegido por controle de acesso baseado em papéis, abordagem consolidada para associar permissões às funções exercidas no sistema (Sandhu et al., 1996).

O ciclo de vida das solicitações será implementado como um fluxo de estados controlados, impedindo alterações arbitrárias. Padrões de workflow permitem representar atividades, decisões, sincronizações e transições de processos organizacionais de forma verificável (van der Aalst et al., 2003). A baixa definitiva do estoque ocorrerá somente após a confirmação da entrega, enquanto solicitações aprovadas poderão gerar reserva de quantidade.

A definição das tecnologias que compõem o artefato foi realizada com base na experiência prévia dos autores e na disponibilidade de recursos gratuitos para hospedagem durante o desenvolvimento acadêmico. O código-fonte será versionado no GitHub, permitindo controle de alterações, histórico de contribuições de cada autor e integração futura com pipelines de implantação contínua.

A interface de usuário, tanto do módulo administrativo quanto da interface de autoatendimento, será construída com HTML, Bootstrap e JavaScript, priorizando simplicidade de manutenção e compatibilidade ampla com navegadores, sem a necessidade de um processo de build ou de um framework de front-end mais complexo. O uso do Bootstrap também contribui diretamente para o atendimento ao requisito de responsividade (RNF-01), por já fornecer um sistema de grid e componentes adaptáveis a diferentes tamanhos de tela.

O backend será desenvolvido em Python, utilizando o framework Django, que fornece um ORM nativo, sistema de autenticação, controle de permissões e um painel administrativo integrado, reduzindo o esforço de implementação de funcionalidades recorrentes em sistemas de gestão. Por ser a mesma linguagem utilizada no módulo de inteligência artificial (seção 3.5), o uso do Python no backend também simplifica a integração entre a aplicação principal e o classificador textual, permitindo que ambos compartilhem o mesmo ambiente de execução sem a necessidade de um serviço externo dedicado.

A persistência dos dados será realizada em um banco de dados PostgreSQL, adequado ao volume de relações do domínio do sistema, como funcionários, centros de custo, produtos, estoque, solicitações e histórico de movimentações, além de oferecer suporte maduro a transações e integridade referencial.

A hospedagem de toda a solução, incluindo aplicação web e banco de dados, será realizada na plataforma Render, escolhida por oferecer um plano gratuito suficiente para as necessidades do protótipo acadêmico e por permitir a implantação contínua a partir do repositório GitHub.

## 3.5 Desenvolvimento do módulo de inteligência artificial

A inteligência artificial será aplicada à classificação supervisionada das justificativas textuais informadas pelos funcionários nas solicitações de substituição antecipada de EPIs. A classificação automática de textos consiste em associar documentos a categorias predefinidas a partir de exemplos previamente rotulados (Sebastiani, 2002).

Será construído um conjunto de justificativas rotuladas em classes como perda, desgaste normal, desgaste prematuro, defeito de fabricação, dano durante a atividade, contaminação, tamanho inadequado, acidente, mudança de função e outros. Os exemplos poderão ser obtidos por meio de relatos anonimizados, entrevistas e dados sintéticos revisados por profissionais do domínio. Os conjuntos de treinamento e teste serão separados para evitar que a avaliação utilize textos já conhecidos pelo modelo.

Inicialmente, os textos serão representados por TF-IDF, técnica tradicional de ponderação de termos em recuperação de informação (Manning; Raghavan; Schütze, 2008). Serão comparados algoritmos de implementação acessível, como regressão logística, Naive Bayes e máquina de vetores de suporte linear. A implementação poderá utilizar a biblioteca scikit-learn, que fornece ferramentas para pré-processamento, treinamento e avaliação de modelos de aprendizado de máquina (Pedregosa et al., 2011).

O classificador apresentará a categoria sugerida e um indicador de confiança. O técnico ou gestor poderá confirmar ou corrigir a classificação antes de decidir sobre a solicitação. A IA não terá permissão para aprovar, rejeitar ou bloquear automaticamente o fornecimento de um equipamento.

## 3.6 Avaliação do artefato

A avaliação funcional será executada a partir de casos de teste derivados dos requisitos e critérios de aceite. Para os EPIs, serão testados os fluxos de elegibilidade, substituição antecipada, autorização condicionada, devolução, reserva, entrega, atualização da ficha e movimentação de estoque. Para os materiais consumíveis, serão avaliados os limites de quantidade, as regras por função, setor ou centro de custo, as autorizações excepcionais, as reservas e as baixas de estoque. Também serão testados o controle de acesso e a trilha de auditoria.

A usabilidade poderá ser avaliada com participantes representando funcionários, almoxarifes e responsáveis pelas aprovações. Serão observados o tempo de conclusão das tarefas, a quantidade de erros, a compreensão das mensagens, a facilidade de navegação e a percepção de utilidade da solução.

O classificador será avaliado por acurácia, precisão, revocação, F1-score e matriz de confusão. A escolha de múltiplas métricas é necessária porque a acurácia isolada pode ocultar desempenho insuficiente em classes menos frequentes (Sokolova; Lapalme, 2009). Os resultados também poderão ser comparados com uma linha de base baseada em palavras-chave.

## 3.7 Proteção de dados e aspectos éticos

O sistema tratará dados de funcionários, vínculos organizacionais, históricos de fornecimento de EPIs e materiais consumíveis e registros de solicitações. A coleta e o uso desses dados deverão observar os princípios da finalidade, adequação, necessidade, segurança e prevenção previstos na Lei Geral de Proteção de Dados Pessoais (Brasil, 2018, art. 6º).

Os dados destinados ao treinamento e à avaliação do classificador serão anonimizados ou pseudonimizados sempre que possível. Nome, CPF, matrícula e outras informações capazes de identificar diretamente o funcionário não são necessários para classificar o conteúdo da justificativa e, portanto, não deverão ser utilizados como atributos do modelo.

Caso sejam avaliados mecanismos biométricos em evoluções futuras, será necessária análise específica, pois dados biométricos vinculados a uma pessoa natural são dados pessoais sensíveis (Brasil, 2018, art. 5º, II). A Autoridade Nacional de Proteção de Dados destaca riscos de privacidade, finalidade secundária, erros de reconhecimento e discriminação em sistemas biométricos e de reconhecimento facial (ANPD, 2024).
