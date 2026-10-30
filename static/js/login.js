/* =====================================================================
   SupplyFlow — Tela de Login do Backoffice
   ---------------------------------------------------------------------
   Envia e-mail e senha para /api/login/. O servidor confere o hash da
   senha, abre a sessão autenticada e devolve os dados de exibição do
   usuário.
   ===================================================================== */

(function () {
  var formulario = document.getElementById("form-login");
  var campoEmail = document.getElementById("email");
  var campoSenha = document.getElementById("senha");
  var caixaErro = document.getElementById("login-erro");
  var botaoEntrar = document.getElementById("btn-entrar");

  function mostrarErro(mensagem) {
    caixaErro.textContent = mensagem;
    caixaErro.classList.remove("d-none");
    campoSenha.setAttribute("aria-invalid", "true");
    campoSenha.value = "";
    campoSenha.focus();
  }

  /* Regra de segurança (evita Open Redirect):
     Só aceita redirecionar para páginas internas dentro de /backoffice/*.html. */
  function destinoSeguro() {
    var parametrosUrl = new URLSearchParams(window.location.search);
    var proximo = parametrosUrl.get("proximo") || "";
    var padraoPaginaInterna = /^\/backoffice\/[a-z0-9-]+\.html(\?[^#]*)?$/i;

    if (padraoPaginaInterna.test(proximo)) {
      return proximo;
    }
    return "/backoffice/visao-geral.html";
  }

  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();
    caixaErro.classList.add("d-none");
    campoSenha.removeAttribute("aria-invalid");

    var email = campoEmail.value.trim();
    var senha = campoSenha.value;
    if (!email || !senha) {
      mostrarErro("Informe e-mail e senha.");
      return;
    }

    botaoEntrar.disabled = true;
    SF.api.post("/api/login/", { email: email, senha: senha }, { semRedirecionar: true })
      .then(function (resposta) {
        SF.sessao.iniciar(resposta.usuario);
        window.location.href = destinoSeguro();
      })
      .catch(function (erro) {
        mostrarErro(erro.message);
      })
      .finally(function () {
        botaoEntrar.disabled = false;
      });
  });
})();
