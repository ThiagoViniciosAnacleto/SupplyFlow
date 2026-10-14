/* =====================================================================
   SupplyFlow — tela de login integrada com API Django (/api/usuarios/)
   Carrega os usuários cadastrados no banco PostgreSQL e autentica na sessão.
   ===================================================================== */

(function () {
  var lista = document.getElementById("lista-usuarios");
  var formulario = document.getElementById("form-login");
  var usuariosCarregados = [];

  function renderizarUsuarios(usuarios) {
    if (!lista) return;
    lista.innerHTML = "";

    usuarios.forEach(function (usuario, index) {
      var rotulo = document.createElement("label");
      rotulo.className = "usuario";

      var iniciais = usuario.iniciais || "SF";
      rotulo.innerHTML =
        '<span class="usuario__avatar" aria-hidden="true">' + iniciais + "</span>" +
        '<span class="usuario__texto">' +
          '<span class="usuario__nome">' + usuario.nome + "</span>" +
          '<span class="usuario__detalhe">' + usuario.perfil + " · Matrícula " + usuario.matricula + "</span>" +
        "</span>";

      var radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "usuario";
      radio.value = usuario.id;
      radio.className = "form-check-input";
      // Seleciona o administrador como padrão se houver, ou o primeiro
      radio.checked = (usuario.perfil_codigo === "ADMIN" || usuario.perfil === "Administrador") || index === 0;
      radio.setAttribute("aria-label", usuario.nome + ", " + usuario.perfil);

      rotulo.appendChild(radio);
      lista.appendChild(rotulo);
    });
  }

  // 1. Busca os usuários reais do PostgreSQL
  fetch("/api/usuarios/")
    .then(function (resposta) {
      if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);
      return resposta.json();
    })
    .then(function (dados) {
      usuariosCarregados = dados.usuarios || [];
      if (usuariosCarregados.length > 0) {
        window.SF = window.SF || {};
        SF.usuarios = usuariosCarregados;
        renderizarUsuarios(usuariosCarregados);
      } else if (window.SF && SF.usuarios) {
        renderizarUsuarios(SF.usuarios);
      }
    })
    .catch(function (erro) {
      console.warn("Aviso: carregando usuários de contingência:", erro);
      if (window.SF && SF.usuarios) {
        renderizarUsuarios(SF.usuarios);
      }
    });

  // 2. Entrar: armazena na sessão o usuário escolhido e navega para o backoffice
  if (formulario) {
    formulario.addEventListener("submit", function (evento) {
      evento.preventDefault();

      var selecionado = formulario.querySelector('input[name="usuario"]:checked');
      var usuarioFinal = null;

      if (selecionado && usuariosCarregados.length > 0) {
        usuarioFinal = usuariosCarregados.find(function (u) {
          return String(u.id) === String(selecionado.value);
        });
      }

      if (!usuarioFinal && window.SF && SF.usuarios) {
        usuarioFinal = SF.usuarios[0];
      }

      if (usuarioFinal) {
        SF.sessao.iniciar(usuarioFinal);
      }

      window.location.href = "backoffice/visao-geral.html";
    });
  }
})();
