/* =====================================================================
   SupplyFlow — sessão fictícia
   ---------------------------------------------------------------------
   Guarda no navegador QUAL usuário de demonstração foi escolhido no
   login, só para mostrar o nome e o perfil no topo das páginas.
   Também guarda as DECISÕES tomadas nas solicitações durante a
   demonstração, para que a lista e a Visão Geral mostrem o novo status.
   NÃO é autenticação nem banco: não há senha, não há servidor. Quando o
   Django entrar, isto é substituído pelo login de verdade
   (django.contrib.auth) e as decisões passam a ser gravadas no banco.
   ===================================================================== */

window.SF = window.SF || {};

SF.sessao = (function () {
  var CHAVE = "supplyflow.usuario";
  var CHAVE_DECISOES = "supplyflow.decisoes";

  function lerArmazenamento(chave) {
    try {
      return window.sessionStorage.getItem(chave);
    } catch (erro) {
      return null; // navegador bloqueou o armazenamento: segue sem ele
    }
  }

  /* O sessionStorage só guarda texto. Por isso as decisões são
     convertidas em texto JSON para salvar, e de volta para ler. */
  function lerDecisoes() {
    try {
      return JSON.parse(lerArmazenamento(CHAVE_DECISOES)) || {};
    } catch (erro) {
      return {}; // texto corrompido: começa do zero em vez de quebrar a página
    }
  }

  return {
    /* Salva o id do usuário escolhido */
    iniciar: function (idUsuario) {
      try {
        window.sessionStorage.setItem(CHAVE, idUsuario);
      } catch (erro) {
        /* sem armazenamento, o backoffice usa o usuário padrão */
      }
    },

    /* Devolve o usuário atual. Se ninguém "entrou" (ou o navegador
       bloqueou o armazenamento), usa o Administrador — assim a página
       nunca quebra durante uma demonstração. */
    usuarioAtual: function () {
      var id = lerArmazenamento(CHAVE) || SF.usuarioPadrao;
      var usuario = SF.usuarios.find(function (u) { return u.id === id; });
      return usuario || SF.usuarios.find(function (u) { return u.id === SF.usuarioPadrao; });
    },

    /* Registra a decisão tomada numa solicitação (id sem "#") */
    salvarDecisao: function (idSolicitacao, decisao) {
      var decisoes = lerDecisoes();
      decisoes[idSolicitacao] = decisao;
      try {
        window.sessionStorage.setItem(CHAVE_DECISOES, JSON.stringify(decisoes));
        return true;
      } catch (erro) {
        return false; // a página avisa que a decisão não pôde ser guardada
      }
    },

    /* Decisão da solicitação: a tomada nesta sessão ou, se não houver,
       a que já veio registrada nos dados. null se ainda não foi decidida. */
    decisaoDe: function (solicitacao) {
      return lerDecisoes()[solicitacao.id] || solicitacao.decisao || null;
    },

    /* Status que deve aparecer na tela. Uma decisão da sessão só muda o
       status de quem estava aguardando (ex.: "entregue" continua entregue). */
    statusDe: function (solicitacao) {
      var daSessao = lerDecisoes()[solicitacao.id];
      if (daSessao && solicitacao.status === "aguardando") return daSessao.status;
      return solicitacao.status;
    },

    /* Sair: apaga o usuário e as decisões simuladas */
    encerrar: function () {
      try {
        window.sessionStorage.removeItem(CHAVE);
        window.sessionStorage.removeItem(CHAVE_DECISOES);
      } catch (erro) { /* nada a limpar */ }
    }
  };
})();
