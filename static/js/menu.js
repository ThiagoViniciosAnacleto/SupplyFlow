/* =====================================================================
   SupplyFlow — menu lateral do backoffice
   ---------------------------------------------------------------------
   "pagina" = nome do arquivo em /backoffice (sem pagina: tela ainda não
   construída, abre em-construcao.html).
   "acao"   = permissão exigida (padrão "ver"); o menu esconde o que o
   perfil não pode usar — quem bloqueia de verdade é o servidor.
   ===================================================================== */

window.SF = window.SF || {};

SF.menu = [
  { rotulo: "Visão Geral", icone: "bi-grid-1x2", pagina: "visao-geral" },
  { grupo: "Pessoas", icone: "bi-people", itens: [
      { rotulo: "Funcionários", pagina: "funcionarios", acao: "pessoas" }
  ]},
  { grupo: "Organização", icone: "bi-diagram-3", itens: [
      { rotulo: "Funções", pagina: "funcoes" }, { rotulo: "Cargos", pagina: "cargos" }, { rotulo: "Centros de custo", pagina: "centros-de-custo" }
  ]},
  { grupo: "Materiais", icone: "bi-box-seam", itens: [
      { rotulo: "Produtos", pagina: "produtos" }, { rotulo: "Fornecedores", pagina: "fornecedores" }, { rotulo: "Estoque", pagina: "estoque" }
  ]},
  { grupo: "Operações", icone: "bi-clipboard-check", itens: [
      { rotulo: "Solicitações", pagina: "solicitacoes" }, { rotulo: "Entregas", pagina: "entregas" }, { rotulo: "Devoluções", pagina: "devolucoes" }
  ]},
  { grupo: "Gestão", icone: "bi-bar-chart-line", itens: [
      { rotulo: "Políticas de fornecimento", pagina: "politicas" }, { rotulo: "Histórico", pagina: "historico" },
      { rotulo: "Relatórios", pagina: "relatorios" }, { rotulo: "Avaliação do modelo (IA)", pagina: "avaliacao-ia" }
  ]},
  { grupo: "Governança", icone: "bi-shield-check", itens: [
      { rotulo: "Auditoria", pagina: "auditoria", acao: "auditoria" },
      { rotulo: "Usuários e permissões", pagina: "usuarios", acao: "pessoas" }
  ]},
  { rotulo: "Configurações", icone: "bi-gear", acao: "pessoas" }
];
