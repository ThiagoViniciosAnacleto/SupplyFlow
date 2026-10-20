/* =====================================================================
   SupplyFlow — dados de exibição da sessão
   ---------------------------------------------------------------------
   A sessão de verdade fica no SERVIDOR (cookie do Django). Aqui guardamos
   só uma cópia do nome/perfil para desenhar o topo da página sem esperar
   a rede. Quem decide o que cada um pode fazer é sempre o servidor.
   ===================================================================== */

window.SF = window.SF || {};

SF.sessao = (function () {
  var CHAVE = "supplyflow.usuario";

  function ler() {
    try {
      return JSON.parse(window.sessionStorage.getItem(CHAVE)) || null;
    } catch (erro) {
      return null;
    }
  }

  function gravar(usuario) {
    try {
      window.sessionStorage.setItem(CHAVE, JSON.stringify(usuario));
    } catch (erro) { /* sem armazenamento: o topo é atualizado pela API */ }
  }

  return {
    /* Chamado após o login com os dados devolvidos pelo servidor */
    iniciar: gravar,

    /* Cópia local de quem está logado (ou null). */
    usuarioAtual: ler,

    /* Confere no servidor quem está logado e atualiza a cópia local.
       Se a sessão expirou, SF.api volta para o login. */
    confirmar: function () {
      return SF.api.get("/api/sessao/").then(function (resposta) {
        gravar(resposta.usuario);
        return resposta.usuario;
      });
    },

    /* O perfil logado pode executar esta ação? (só para mostrar/esconder botões) */
    pode: function (acao) {
      var usuario = ler();
      return !!(usuario && usuario.acoes && usuario.acoes.indexOf(acao) !== -1);
    },

    /* Sair: encerra a sessão no servidor e limpa a cópia local */
    encerrar: function () {
      try { window.sessionStorage.removeItem(CHAVE); } catch (erro) {}
      return SF.api.post("/api/logout/", {}, { semRedirecionar: true }).catch(function () {});
    }
  };
})();
