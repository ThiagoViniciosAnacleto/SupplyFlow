/* =====================================================================
   SupplyFlow — tela de login
   Envia e-mail + senha para /api/login/. O servidor confere a senha,
   abre a sessão e devolve os dados de exibição do usuário.
   ===================================================================== */

(function () {
  var formulario = document.getElementById("form-login");
  var campoEmail = document.getElementById("email");
  var campoSenha = document.getElementById("senha");
  var caixaErro = document.getElementById("login-erro");
  var botao = document.getElementById("btn-entrar");

  function mostrarErro(mensagem) {
    caixaErro.textContent = mensagem;
    caixaErro.classList.remove("d-none");
    campoSenha.setAttribute("aria-invalid", "true");
    campoSenha.value = "";
    campoSenha.focus();
  }

  /* Só aceita voltar para páginas do próprio sistema (evita redirecionar para outro site) */
  function destinoSeguro() {
    var proximo = new URLSearchParams(window.location.search).get("proximo") || "";
    return /^\/backoffice\/[a-z0-9-]+\.html(\?[^#]*)?$/i.test(proximo) ? proximo : "/backoffice/visao-geral.html";
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

    botao.disabled = true;
    SF.api.post("/api/login/", { email: email, senha: senha }, { semRedirecionar: true })
      .then(function (resposta) {
        SF.sessao.iniciar(resposta.usuario);
        window.location.href = destinoSeguro();
      })
      .catch(function (erro) {
        mostrarErro(erro.message);
      })
      .finally(function () {
        botao.disabled = false;
      });
  });
})();
