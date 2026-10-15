/* =====================================================================
   SupplyFlow — chamadas à API do Django
   ---------------------------------------------------------------------
   Todas as telas usam SF.api.get / SF.api.post em vez de fetch direto:
   - envia o token CSRF (proteção contra sites de terceiros agindo em
     nome de quem está logado);
   - sessão expirada (401) no backoffice volta para o login;
   - transforma qualquer erro numa mensagem legível (Error.message).
   ===================================================================== */

window.SF = window.SF || {};

SF.api = (function () {
  function lerCookie(nome) {
    var partes = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < partes.length; i++) {
      var par = partes[i].split("=");
      if (par[0] === nome) return decodeURIComponent(par.slice(1).join("="));
    }
    return "";
  }

  function voltarAoLogin() {
    var proximo = window.location.pathname + window.location.search;
    window.location.href = "/?proximo=" + encodeURIComponent(proximo);
  }

  function requisitar(metodo, url, dados, opcoes) {
    opcoes = opcoes || {};
    var config = {
      method: metodo,
      credentials: "same-origin",
      headers: { "Accept": "application/json" }
    };
    if (metodo !== "GET") {
      config.headers["Content-Type"] = "application/json";
      config.headers["X-CSRFToken"] = lerCookie("csrftoken");
      config.body = JSON.stringify(dados || {});
    }

    return fetch(url, config).then(function (resposta) {
      return resposta.text().then(function (texto) {
        var corpo = {};
        try { corpo = texto ? JSON.parse(texto) : {}; } catch (e) { corpo = {}; }

        if (resposta.status === 401 && !opcoes.semRedirecionar) {
          voltarAoLogin();
        }
        if (!resposta.ok) {
          var erro = new Error(corpo.erro || mensagemPadrao(resposta.status));
          erro.status = resposta.status;
          erro.dados = corpo;
          throw erro;
        }
        return corpo;
      });
    });
  }

  function mensagemPadrao(status) {
    if (status === 401) return "Sua sessão expirou. Entre novamente.";
    if (status === 403) return "Seu perfil não tem permissão para esta ação.";
    if (status === 404) return "Registro não encontrado.";
    if (status === 429) return "Muitas tentativas. Aguarde alguns minutos.";
    if (status >= 500) return "Erro no servidor. Tente novamente em instantes.";
    return "Não foi possível concluir a operação.";
  }

  return {
    get: function (url, opcoes) { return requisitar("GET", url, null, opcoes); },
    post: function (url, dados, opcoes) { return requisitar("POST", url, dados, opcoes); }
  };
})();
