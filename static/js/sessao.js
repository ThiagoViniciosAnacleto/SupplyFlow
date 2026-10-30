/* =====================================================================
   SupplyFlow — Dados de Exibição da Sessão
   ---------------------------------------------------------------------
   DECISÃO ARQUITETURAL:
   A sessão real fica no SERVIDOR (cookie HttpOnly do Django).
   Aqui guardamos em sessionStorage apenas uma cópia dos dados visuais
   (nome, iniciais, perfil e ações permitidas) para desenhar o topo e
   o menu da página sem esperar a rede a cada clique.
   Quem decide e bloqueia o que cada perfil pode fazer é sempre o servidor.
   ===================================================================== */

window.SF = window.SF || {};

SF.sessao = (function () {
  var CHAVE_STORAGE = "supplyflow.usuario";

  function lerUsuarioSalvo() {
    try {
      var textoSalvo = window.sessionStorage.getItem(CHAVE_STORAGE);
      if (!textoSalvo) {
        return null;
      }
      return JSON.parse(textoSalvo) || null;
    } catch (erro) {
      return null;
    }
  }

  function gravarUsuarioSalvo(usuario) {
    try {
      window.sessionStorage.setItem(CHAVE_STORAGE, JSON.stringify(usuario));
    } catch (erro) {
      /* Caso o navegador bloqueie sessionStorage, o topo ainda funciona via API */
    }
  }

  function removerUsuarioSalvo() {
    try {
      window.sessionStorage.removeItem(CHAVE_STORAGE);
    } catch (erro) {
      /* Ignora falha de acesso ao sessionStorage */
    }
  }

  return {
    /* Chamado após o login com os dados devolvidos pelo servidor */
    iniciar: gravarUsuarioSalvo,

    /* Retorna a cópia local de quem está logado (ou null se não houver) */
    usuarioAtual: lerUsuarioSalvo,

    /* Confere no servidor quem está logado e atualiza a cópia local.
       Se a sessão expirou, SF.api redireciona automaticamente para o login. */
    confirmar: function () {
      return SF.api.get("/api/sessao/").then(function (resposta) {
        gravarUsuarioSalvo(resposta.usuario);
        return resposta.usuario;
      });
    },

    /* Verifica se o perfil logado possui determinada permissão (ex.: "decidir", "estoque").
       Usado apenas para mostrar ou esconder botões na interface. */
    pode: function (acao) {
      var usuario = lerUsuarioSalvo();
      if (!usuario || !Array.isArray(usuario.acoes)) {
        return false;
      }
      return usuario.acoes.indexOf(acao) !== -1;
    },

    /* Sair: limpa a cópia local e encerra a sessão no servidor */
    encerrar: function () {
      removerUsuarioSalvo();
      return SF.api.post("/api/logout/", {}, { semRedirecionar: true }).catch(function () {});
    }
  };
})();
