/* =====================================================================
   SupplyFlow — Chamadas à API do Django
   ---------------------------------------------------------------------
   Todas as telas usam SF.api.get / SF.api.post em vez de fetch direto:
   - Envia o token CSRF (proteção contra sites de terceiros agindo em
     nome de quem está logado);
   - Quando a sessão expira (HTTP 401) no backoffice, redireciona para
     a tela de login guardando o endereço atual em "?proximo=";
   - Transforma qualquer erro HTTP numa mensagem legível (Error.message).
   ===================================================================== */

window.SF = window.SF || {};

SF.api = (function () {
  /* Busca um cookie do navegador pelo nome (ex.: "csrftoken") */
  function lerCookie(nomeProcurado) {
    if (!document.cookie) {
      return "";
    }
    var listaCookies = document.cookie.split("; ");
    for (var i = 0; i < listaCookies.length; i++) {
      var partesCookie = listaCookies[i].split("=");
      var nomeAtual = partesCookie[0];
      if (nomeAtual === nomeProcurado) {
        var valorCodificado = partesCookie.slice(1).join("=");
        return decodeURIComponent(valorCodificado);
      }
    }
    return "";
  }

  /* Redireciona para o login preservando a página que o usuário tentava abrir */
  function voltarAoLogin() {
    var caminhoAtual = window.location.pathname + window.location.search;
    window.location.href = "/?proximo=" + encodeURIComponent(caminhoAtual);
  }

  /* Traduz códigos de erro HTTP para mensagens amigáveis em português */
  function mensagemPadrao(statusHttp) {
    if (statusHttp === 401) {
      return "Sua sessão expirou. Entre novamente.";
    }
    if (statusHttp === 403) {
      return "Seu perfil não tem permissão para esta ação.";
    }
    if (statusHttp === 404) {
      return "Registro não encontrado.";
    }
    if (statusHttp === 429) {
      return "Muitas tentativas. Aguarde alguns minutos.";
    }
    if (statusHttp >= 500) {
      return "Erro no servidor. Tente novamente em instantes.";
    }
    return "Não foi possível concluir a operação.";
  }

  /* Converte o texto da resposta em objeto JSON com segurança */
  function converterTextoParaJson(textoResposta) {
    if (!textoResposta) {
      return {};
    }
    try {
      return JSON.parse(textoResposta);
    } catch (erroJson) {
      return {};
    }
  }

  /* Função central que envia a requisição HTTP e trata a resposta */
  function requisitar(metodo, url, dados, opcoes) {
    opcoes = opcoes || {};

    var configuracaoFetch = {
      method: metodo,
      credentials: "same-origin",
      headers: {
        "Accept": "application/json"
      }
    };

    /* Pedidos que alteram dados (ex.: POST) enviam JSON e o token CSRF */
    if (metodo !== "GET") {
      configuracaoFetch.headers["Content-Type"] = "application/json";
      configuracaoFetch.headers["X-CSRFToken"] = lerCookie("csrftoken");
      configuracaoFetch.body = JSON.stringify(dados || {});
    }

    return fetch(url, configuracaoFetch).then(function (resposta) {
      return resposta.text().then(function (textoResposta) {
        var corpo = converterTextoParaJson(textoResposta);

        if (resposta.status === 401 && !opcoes.semRedirecionar) {
          voltarAoLogin();
        }

        if (!resposta.ok) {
          var textoErro = corpo.erro || mensagemPadrao(resposta.status);
          var erro = new Error(textoErro);
          erro.status = resposta.status;
          erro.dados = corpo;
          throw erro;
        }

        return corpo;
      });
    });
  }

  return {
    get: function (url, opcoes) {
      return requisitar("GET", url, null, opcoes);
    },
    post: function (url, dados, opcoes) {
      return requisitar("POST", url, dados, opcoes);
    }
  };
})();
