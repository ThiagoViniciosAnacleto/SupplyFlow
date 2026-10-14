/* =====================================================================
   SupplyFlow — sessão integrada com API Django e sessionStorage
   ---------------------------------------------------------------------
   Armazena no sessionStorage os dados do usuário autenticado e sincroniza
   as decisões tomadas com o backend via /api/solicitacoes/<id>/decidir/.
   ===================================================================== */

window.SF = window.SF || {};

SF.sessao = (function () {
  var CHAVE = "supplyflow.usuario";
  var CHAVE_DECISOES = "supplyflow.decisoes";

  var USUARIO_PADRAO = {
    id: "admin-default",
    nome: "Carlos Mendes",
    iniciais: "CM",
    perfil: "Administrador",
    perfil_codigo: "ADMIN",
    cargo: "Administrador de Sistemas",
    matricula: "MAT-1001",
    email: "admin@supplyflow.com",
    acesso: "Acesso geral ao sistema."
  };

  function lerArmazenamento(chave) {
    try {
      return window.sessionStorage.getItem(chave);
    } catch (erro) {
      return null;
    }
  }

  function lerDecisoes() {
    try {
      return JSON.parse(lerArmazenamento(CHAVE_DECISOES)) || {};
    } catch (erro) {
      return {};
    }
  }

  return {
    /* Salva o usuário escolhido (objeto ou id) */
    iniciar: function (usuarioOuId) {
      try {
        if (typeof usuarioOuId === "object" && usuarioOuId !== null) {
          window.sessionStorage.setItem(CHAVE, JSON.stringify(usuarioOuId));
        } else {
          window.sessionStorage.setItem(CHAVE, usuarioOuId);
        }
      } catch (erro) {
        /* sem armazenamento, continua em memória */
      }
    },

    /* Devolve o usuário atual com fallback seguro */
    usuarioAtual: function () {
      var salvo = lerArmazenamento(CHAVE);
      if (salvo) {
        try {
          var obj = JSON.parse(salvo);
          if (obj && typeof obj === "object" && obj.nome) {
            return obj;
          }
        } catch (e) {
          /* não era json, continua */
        }
        if (window.SF && Array.isArray(SF.usuarios)) {
          var achado = SF.usuarios.find(function (u) { return u.id === salvo; });
          if (achado) return achado;
        }
      }
      return (window.SF && SF.usuarios && SF.usuarios[0]) || USUARIO_PADRAO;
    },

    /* Registra a decisão tomada numa solicitação e sincroniza com a API */
    salvarDecisao: function (idSolicitacao, decisao) {
      var decisoes = lerDecisoes();
      decisoes[idSolicitacao] = decisao;
      try {
        window.sessionStorage.setItem(CHAVE_DECISOES, JSON.stringify(decisoes));
      } catch (erro) {}

      // Tenta persistir no backend remoto
      if (idSolicitacao && decisao) {
        var statusStr = (decisao.status || "").toLowerCase();
        var decisaoFinal = statusStr === "rejeitada" ? "REPROVADA" : "APROVADA";
        var usuario = this.usuarioAtual();

        fetch("/api/solicitacoes/" + encodeURIComponent(idSolicitacao) + "/decidir/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decisao: decisaoFinal,
            justificativa: decisao.observacao || decisao.justificativa_decisao || "",
            seguiu_recomendacao_ia: decisao.seguiu_recomendacao_ia !== false,
            aprovador_id: usuario ? usuario.id : null
          })
        }).catch(function (err) {
          console.warn("Aviso ao persistir decisão na API:", err);
        });
      }

      return true;
    },

    /* Decisão da solicitação: a tomada nesta sessão ou a gravada no banco */
    decisaoDe: function (solicitacao) {
      return lerDecisoes()[solicitacao.id] || solicitacao.decisao || null;
    },

    /* Status exibido na tela, priorizando atualizações em tempo real */
    statusDe: function (solicitacao) {
      var daSessao = lerDecisoes()[solicitacao.id];
      if (daSessao && solicitacao.status === "aguardando") return daSessao.status;
      return solicitacao.status;
    },

    /* Encerra a sessão e limpa os dados */
    encerrar: function () {
      try {
        window.sessionStorage.removeItem(CHAVE);
        window.sessionStorage.removeItem(CHAVE_DECISOES);
      } catch (erro) {}
    }
  };
})();
