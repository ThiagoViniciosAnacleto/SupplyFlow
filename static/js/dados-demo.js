/* =====================================================================
   SupplyFlow — dados de demonstração
   ---------------------------------------------------------------------
   TUDO AQUI É FICTÍCIO. Este arquivo existe só enquanto não há backend.
   Quando o Django e o PostgreSQL entrarem, estes dados passam a vir do
   servidor e este arquivo pode ser apagado.
   ===================================================================== */

window.SF = window.SF || {};

/* Usuários de demonstração do login (os mesmos do protótipo) */
SF.usuarios = [
  { id: "carlos", nome: "Carlos Mendes", iniciais: "CM", perfil: "Técnico de Segurança",
    matricula: "T-001", acesso: "Análise de solicitações e segurança do trabalho." },
  { id: "marcos", nome: "Marcos Pereira", iniciais: "MP", perfil: "Almoxarife",
    matricula: "003001", acesso: "Estoque, entregas e devoluções." },
  { id: "helena", nome: "Helena Dias", iniciais: "HD", perfil: "Gestor / Supervisor",
    matricula: "G-014", acesso: "Aprovações e acompanhamento da equipe." },
  { id: "paula", nome: "Paula Souza", iniciais: "PS", perfil: "Comprador",
    matricula: "C-002", acesso: "Produtos, fornecedores e reposição." },
  { id: "admin", nome: "Admin Geral", iniciais: "AG", perfil: "Administrador",
    matricula: "A-001", acesso: "Acesso geral ao sistema." }
];

/* Usuário marcado por padrão na tela de login */
SF.usuarioPadrao = "admin";

/* Menu lateral do backoffice (mesma estrutura do protótipo).
   "pagina" = nome do arquivo em /backoffice. Telas ainda não
   construídas apontam para em-construcao.html. */
SF.menu = [
  { rotulo: "Visão Geral", icone: "bi-grid-1x2", pagina: "visao-geral" },
  { grupo: "Pessoas", icone: "bi-people", itens: [
      { rotulo: "Funcionários" }
  ]},
  { grupo: "Organização", icone: "bi-diagram-3", itens: [
      { rotulo: "Funções" }, { rotulo: "Cargos" }, { rotulo: "Centros de custo" }
  ]},
  { grupo: "Materiais", icone: "bi-box-seam", itens: [
      { rotulo: "Produtos" }, { rotulo: "Fornecedores" }, { rotulo: "Estoque" }
  ]},
  { grupo: "Operações", icone: "bi-clipboard-check", itens: [
      { rotulo: "Solicitações", pagina: "solicitacoes" }, { rotulo: "Entregas" }, { rotulo: "Devoluções" }
  ]},
  { grupo: "Gestão", icone: "bi-bar-chart-line", itens: [
      { rotulo: "Políticas de fornecimento" }, { rotulo: "Histórico" },
      { rotulo: "Relatórios" }, { rotulo: "Avaliação do modelo (IA)" }
  ]},
  { grupo: "Governança", icone: "bi-shield-check", itens: [
      { rotulo: "Auditoria" }, { rotulo: "Usuários e permissões" }
  ]},
  { rotulo: "Configurações", icone: "bi-gear" }
];

/* Indicadores da Visão Geral.
   O "Aguardando aprovação" não tem valor fixo: visao-geral.js conta as
   solicitações pendentes, já considerando as decisões feitas na sessão. */
SF.indicadores = [
  { rotulo: "Produtos cadastrados",        valor: 9, icone: "bi-box",               tom: "tom-azul" },
  { rotulo: "Funcionários ativos",         valor: 5, icone: "bi-people",            tom: "tom-cinza" },
  { id: "aguardando-aprovacao",
    rotulo: "Aguardando aprovação",        valor: null, icone: "bi-clipboard",      tom: "tom-ambar" },
  { rotulo: "Entregas pendentes",          valor: 0, icone: "bi-truck",             tom: "tom-verde" },
  { rotulo: "EPIs aguardando devolução",   valor: 0, icone: "bi-arrow-counterclockwise", tom: "tom-indigo" },
  { rotulo: "Produtos com estoque baixo",  valor: 1, icone: "bi-exclamation-triangle",  tom: "tom-vermelho" }
];

/* Situações possíveis de uma solicitação: código -> texto e classe do selo */
SF.statusSolicitacao = {
  "aguardando":        { rotulo: "Aguardando aprovação",  selo: "selo--aguardando" },
  "aprovada":          { rotulo: "Aprovada",              selo: "selo--aprovado" },
  "aprovada-condicao": { rotulo: "Aprovada com condição", selo: "selo--condicional" },
  "rejeitada":         { rotulo: "Rejeitada",             selo: "selo--rejeitado" },
  "entregue":          { rotulo: "Entregue",              selo: "selo--entregue" }
};

/* Categorias que o classificador de IA pode sugerir (e o técnico pode confirmar) */
SF.categoriasIA = [
  "Perda", "Desgaste normal", "Desgaste prematuro", "Defeito de fabricação",
  "Dano durante atividade", "Contaminação", "Tamanho inadequado", "Acidente",
  "Mudança de função", "Outro"
];

/* Solicitações (as do protótipo + uma retirada regular).
   - id: vai no endereço (solicitacao.html?id=000127), sem o "#".
   - excepcional: true quando a solicitação fugiu da regra normal e exige análise.
   - ia: sugestão do classificador. É null nas retiradas regulares, porque a
     IA só analisa justificativas de solicitações excepcionais.
   - produtoCampos / regraCampos: pares [rótulo, valor] mostrados no detalhe.
   - decisao: só existe quando a solicitação já foi decidida antes da sessão. */
SF.solicitacoes = [
  {
    id: "000127", numero: "#000127", status: "aguardando", excepcional: true,
    data: "25/08/2026", hora: "09:14", motivo: "Substituição antecipada",
    funcionario: "João da Silva", matricula: "001245", funcao: "Soldador",
    centroCusto: "Produção Industrial",
    produto: "Luva de proteção anticorte", tipoProduto: "EPI", iconeProduto: "bi-hand-index-thumb",
    produtoCampos: [
      ["Descrição", "Anticorte Nível 5"], ["CA", "12345"], ["Tamanho", "M"],
      ["Lote atual", "L-2026-07"], ["Periodicidade", "90 dias"], ["Quantidade", "1"]
    ],
    regraCampos: [
      ["Escopo", "Função: Soldador"], ["Periodicidade", "90 dias"], ["Exceção", "Exige aprovação"]
    ],
    historico: [
      { data: "18/08/2026", tipo: "Substituição antecipada" },
      { data: "15/07/2026", tipo: "Entrega regular" },
      { data: "20/04/2026", tipo: "Entrega regular" },
      { data: "18/01/2026", tipo: "Entrega regular" }
    ],
    justificativa: "A luva rasgou durante o trabalho com uma peça metálica.",
    ia: { categoria: "Dano durante atividade", confianca: 89 }
  },
  {
    id: "000128", numero: "#000128", status: "aguardando", excepcional: true,
    data: "25/08/2026", hora: "08:40", motivo: "Limite mensal excedido",
    funcionario: "Carlos Santos", matricula: "001187", funcao: "Mecânico",
    centroCusto: "Manutenção",
    produto: "Disco de corte 4½\"", tipoProduto: "Consumível", iconeProduto: "bi-disc",
    produtoCampos: [
      ["Descrição", "Disco abrasivo 115 × 1,0 mm"], ["Tamanho", "4½\" (115 mm)"],
      ["Lote atual", "L-2026-06"], ["Limite", "10 unidades por mês"], ["Quantidade", "5"]
    ],
    regraCampos: [
      ["Escopo", "Função: Mecânico"], ["Limite", "10 unidades por mês"], ["Exceção", "Exige aprovação"]
    ],
    historico: [
      { data: "19/08/2026", tipo: "Retirada regular · 5 un." },
      { data: "05/08/2026", tipo: "Retirada regular · 5 un." },
      { data: "22/07/2026", tipo: "Retirada regular · 5 un." },
      { data: "08/07/2026", tipo: "Retirada regular · 5 un." }
    ],
    justificativa: "Manutenção corretiva na linha 2 consumiu mais discos que o normal neste mês.",
    ia: { categoria: "Outro", confianca: 62 }
  },
  {
    id: "000126", numero: "#000126", status: "entregue", excepcional: true,
    data: "17/08/2026", hora: "11:00", motivo: "Substituição antecipada",
    funcionario: "Ana Oliveira", matricula: "001302", funcao: "Operador de Produção",
    centroCusto: "Produção Industrial",
    produto: "Protetor auricular", tipoProduto: "EPI", iconeProduto: "bi-ear",
    produtoCampos: [
      ["Descrição", "Plugue de inserção em silicone"], ["CA", "23456"], ["Tamanho", "Único"],
      ["Lote atual", "L-2026-05"], ["Periodicidade", "60 dias"], ["Quantidade", "1"]
    ],
    regraCampos: [
      ["Escopo", "Centro de custo: Produção Industrial"], ["Periodicidade", "60 dias"],
      ["Exceção", "Exige aprovação"]
    ],
    historico: [
      { data: "17/08/2026", tipo: "Substituição antecipada" },
      { data: "02/07/2026", tipo: "Entrega regular" },
      { data: "03/05/2026", tipo: "Entrega regular" },
      { data: "04/03/2026", tipo: "Entrega regular" }
    ],
    justificativa: "O protetor endureceu e não veda mais o ouvido, mesmo com pouco tempo de uso.",
    ia: { categoria: "Desgaste prematuro", confianca: 78 },
    decisao: {
      status: "aprovada-condicao",
      categoriaIA: "Desgaste prematuro", categoriaConfirmada: "Desgaste prematuro",
      devolucao: true, observacao: "Liberado mediante devolução do par antigo ao almoxarifado.",
      responsavel: "Carlos Mendes", perfil: "Técnico de Segurança", dataHora: "17/08/2026, 11:42"
    }
  },
  {
    id: "000125", numero: "#000125", status: "entregue", excepcional: false,
    data: "12/08/2026", hora: "07:32", motivo: "Retirada regular",
    funcionario: "Pedro Almeida", matricula: "001219", funcao: "Eletricista",
    centroCusto: "Manutenção",
    produto: "Botina de segurança", tipoProduto: "EPI", iconeProduto: "bi-shield-check",
    produtoCampos: [
      ["Descrição", "Bico composite, sem partes metálicas"], ["CA", "34567"], ["Tamanho", "42"],
      ["Lote atual", "L-2026-04"], ["Periodicidade", "180 dias"], ["Quantidade", "1"]
    ],
    regraCampos: [
      ["Escopo", "Função: Eletricista"], ["Periodicidade", "180 dias"], ["Exceção", "Exige aprovação"]
    ],
    historico: [
      { data: "12/08/2026", tipo: "Entrega regular" },
      { data: "10/02/2026", tipo: "Entrega regular" }
    ],
    justificativa: null,
    ia: null
  }
];

/* Gráficos da Visão Geral */
SF.entregasPorMes = {
  meses: ["Abr", "Mai", "Jun", "Jul", "Ago", "Set"],
  valores: [18, 22, 19, 27, 31, 24]
};

SF.consumoPorCentro = {
  centros: ["Produção Industrial", "Manutenção", "Logística", "Administrativo"],
  valores: [62, 38, 21, 13]
};
