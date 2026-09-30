/* =====================================================================
   SupplyFlow — tela de login (fictícia)
   Monta os cartões de usuário e, ao clicar em Entrar, vai direto para
   o backoffice. Nada é validado: é só para navegar pelas telas.
   ===================================================================== */

(function () {
  var lista = document.getElementById("lista-usuarios");
  var formulario = document.getElementById("form-login");

  /* 1. Cria um cartão (rádio) para cada usuário de demonstração */
  SF.usuarios.forEach(function (usuario) {
    var rotulo = document.createElement("label");
    rotulo.className = "usuario";

    rotulo.innerHTML =
      '<span class="usuario__avatar" aria-hidden="true">' + usuario.iniciais + "</span>" +
      '<span class="usuario__texto">' +
        '<span class="usuario__nome">' + usuario.nome + "</span>" +
        '<span class="usuario__detalhe">' + usuario.perfil + " · Matrícula " + usuario.matricula + "</span>" +
      "</span>";

    var radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "usuario";
    radio.value = usuario.id;
    radio.className = "form-check-input";
    radio.checked = usuario.id === SF.usuarioPadrao;
    radio.setAttribute("aria-label", usuario.nome + ", " + usuario.perfil);

    rotulo.appendChild(radio);
    lista.appendChild(rotulo);
  });

  /* 2. Entrar: guarda o usuário escolhido e abre o backoffice */
  formulario.addEventListener("submit", function (evento) {
    evento.preventDefault();

    var escolhido = formulario.querySelector('input[name="usuario"]:checked');
    SF.sessao.iniciar(escolhido ? escolhido.value : SF.usuarioPadrao);

    window.location.href = "backoffice/visao-geral.html";
  });
})();
