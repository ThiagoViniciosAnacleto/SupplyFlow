/* =====================================================================
   SupplyFlow — Usuários Administrativos e Permissões (/api/usuarios/)
   ---------------------------------------------------------------------
   Gerencia o Domínio 2 (Usuários Administrativos / Governança / RBAC):
   lista todas as contas com acesso ao backoffice, permite cadastrar ou
   editar operadores gerenciais com envio automático do link de criação
   de senha pessoal por e-mail e exibe a matriz oficial de permissões
   validada no servidor.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-usuarios");
  var btnNovoUsuario = document.getElementById("btn-novo-usuario");
  var modalEl = document.getElementById("modal-usuario");
  var formUsuario = document.getElementById("form-usuario");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;
  var usuariosCache = [];

  var MAPA_SITUACOES_CONTA = {
    ativo:            { rotulo: "Ativo",                    selo: "selo--aprovado" },
    convite_pendente: { rotulo: "Aguardando criar senha",   selo: "selo--aguardando" },
    sem_email:        { rotulo: "Sem e-mail cadastrado",    selo: "selo--rejeitado" },
    inativo:          { rotulo: "Inativo",                  selo: "selo--rejeitado" }
  };

  var COLUNAS_ACOES = [
    { chave: "ver",       rotulo: "Consultar telas" },
    { chave: "decidir",   rotulo: "Aprovar / rejeitar" },
    { chave: "entregar",  rotulo: "Confirmar entregas" },
    { chave: "devolucao", rotulo: "Registrar devoluções" },
    { chave: "estoque",   rotulo: "Movimentar estoque" },
    { chave: "produtos",  rotulo: "Cadastrar produtos" },
    { chave: "ia",        rotulo: "Avaliar IA" },
    { chave: "pessoas",   rotulo: "Funcionários e usuários" },
    { chave: "auditoria", rotulo: "Ver auditoria" }
  ];

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
  }

  function carregarSetoresModal() {
    var selectSetor = document.getElementById("usu-setor");
    if (!selectSetor) {
      return;
    }
    SF.api.get("/api/setores/")
      .then(function (dados) {
        var setores = dados.setores || [];
        setores.forEach(function (setor) {
          var opcao = document.createElement("option");
          opcao.value = setor.id;
          opcao.textContent = setor.nome + " (" + setor.centro_custo + ")";
          selectSetor.appendChild(opcao);
        });
      })
      .catch(function (erro) {
        console.warn("Erro ao carregar setores:", erro);
      });
  }

  function criarLinhaUsuarioHtml(usuario) {
    var infoSituacao = MAPA_SITUACOES_CONTA[usuario.situacao] || MAPA_SITUACOES_CONTA.inativo;
    var podeEnviarLink = (usuario.situacao === "ativo" || usuario.situacao === "convite_pendente");

    var htmlBotaoLink = "";
    if (podeEnviarLink) {
      htmlBotaoLink =
        '<button type="button" class="btn btn-sm btn-outline-primary me-1" data-enviar="' + escapar(usuario.id) + '"' +
                ' aria-label="Enviar link de senha para ' + escapar(usuario.nome) + '">' +
          '<i class="bi bi-envelope" aria-hidden="true"></i> Enviar link' +
        "</button>";
    }

    var htmlBotaoEditar =
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-editar="' + escapar(usuario.id) + '"' +
              ' aria-label="Editar acesso de ' + escapar(usuario.nome) + '" title="Editar perfil">' +
        '<i class="bi bi-pencil" aria-hidden="true"></i>' +
      "</button>";

    return (
      "<tr>" +
        "<td>" +
          "<strong>" + escapar(usuario.nome) + "</strong>" +
          '<br><span class="text-muted small">ID ' + escapar(usuario.matricula) + "</span>" +
        "</td>" +
        "<td>" + escapar(usuario.email || "—") + "</td>" +
        "<td>" + escapar(usuario.perfil) + "</td>" +
        '<td><span class="selo ' + infoSituacao.selo + '">' + escapar(infoSituacao.rotulo) + "</span></td>" +
        "<td>" + escapar(usuario.ultimo_acesso || "Nunca") + "</td>" +
        '<td class="tabela-solicitacoes__acao text-nowrap">' + htmlBotaoLink + htmlBotaoEditar + "</td>" +
      "</tr>"
    );
  }

  function criarCelulaPermissaoHtml(possuiPermissao) {
    if (possuiPermissao) {
      return (
        '<td class="text-center">' +
          '<i class="bi bi-check-circle-fill text-success" aria-hidden="true"></i>' +
          '<span class="visually-hidden">Sim</span>' +
        "</td>"
      );
    }
    return (
      '<td class="text-center">' +
        '<span aria-hidden="true" class="text-muted">—</span>' +
        '<span class="visually-hidden">Não</span>' +
      "</td>"
    );
  }

  function montarTabelaPermissoes(matrizPermissoes) {
    var htmlCabecalhos = COLUNAS_ACOES.map(function (coluna) {
      return '<th scope="col" class="text-center">' + escapar(coluna.rotulo) + "</th>";
    }).join("");

    document.getElementById("cabecalho-permissoes").innerHTML =
      '<tr><th scope="col">Perfil</th>' + htmlCabecalhos + "</tr>";

    document.getElementById("corpo-permissoes").innerHTML = matrizPermissoes.map(function (itemPerfil) {
      var htmlCelulas = COLUNAS_ACOES.map(function (coluna) {
        var possuiPermissao = itemPerfil.acoes.indexOf(coluna.chave) !== -1;
        return criarCelulaPermissaoHtml(possuiPermissao);
      }).join("");

      return (
        "<tr>" +
          '<th scope="row">' +
            escapar(itemPerfil.perfil) +
            '<br><span class="text-muted small fw-normal">' + escapar(itemPerfil.acesso) + "</span>" +
          "</th>" +
          htmlCelulas +
        "</tr>"
      );
    }).join("");
  }

  function preencherModalEdicao(usuario) {
    document.getElementById("modalUsuarioTitulo").textContent = "Editar Usuário Administrativo";
    document.getElementById("usu-id").value = usuario.id;
    document.getElementById("usu-nome").value = usuario.nome || "";
    document.getElementById("usu-email").value = usuario.email || "";
    document.getElementById("usu-perfil").value = usuario.perfil_codigo || "OPERADOR";
    document.getElementById("usu-matricula").value = usuario.matricula || "";
    document.getElementById("usu-cargo").value = usuario.cargo || "";
    document.getElementById("usu-setor").value = usuario.setor_id || "";
    if (modalBs) {
      modalBs.show();
    }
  }

  function carregar() {
    SF.api.get("/api/usuarios/")
      .then(function (dados) {
        var corpoUsuarios = document.getElementById("corpo-usuarios");
        usuariosCache = dados.usuarios || [];

        if (usuariosCache.length === 0) {
          corpoUsuarios.innerHTML = '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhum usuário com acesso ao backoffice.</td></tr>';
        } else {
          corpoUsuarios.innerHTML = usuariosCache.map(criarLinhaUsuarioHtml).join("");
        }
        montarTabelaPermissoes(dados.permissoes || []);
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  if (btnNovoUsuario) {
    btnNovoUsuario.addEventListener("click", function () {
      if (formUsuario) {
        formUsuario.reset();
      }
      document.getElementById("modalUsuarioTitulo").textContent = "Novo Usuário Administrativo";
      document.getElementById("usu-id").value = "";
      document.getElementById("usu-perfil").value = "OPERADOR";
      if (modalBs) {
        modalBs.show();
      }
    });
  }

  if (formUsuario) {
    formUsuario.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var payload = {
        id: document.getElementById("usu-id").value || null,
        nome: document.getElementById("usu-nome").value.trim(),
        email: document.getElementById("usu-email").value.trim(),
        perfil: document.getElementById("usu-perfil").value,
        matricula: document.getElementById("usu-matricula").value.trim(),
        cargo: document.getElementById("usu-cargo").value.trim(),
        setor_id: document.getElementById("usu-setor").value || null
      };

      SF.api.post("/api/usuarios/salvar/", payload)
        .then(function (resposta) {
          if (!resposta.sucesso) {
            throw new Error(resposta.erro || "Falha ao salvar usuário administrativo.");
          }
          if (modalBs) {
            modalBs.hide();
          }
          mostrarAviso(resposta.mensagem, "success");
          carregar();
        })
        .catch(function (erro) {
          mostrarAviso(erro.message, "danger");
        });
    });
  }

  document.getElementById("corpo-usuarios").addEventListener("click", function (evento) {
    var botaoEditar = evento.target.closest("[data-editar]");
    if (botaoEditar) {
      var idEditar = botaoEditar.dataset.editar;
      var encontrado = usuariosCache.find(function (u) {
        return u.id === idEditar;
      });
      if (encontrado) {
        preencherModalEdicao(encontrado);
      }
      return;
    }

    var botaoEnviar = evento.target.closest("[data-enviar]");
    if (!botaoEnviar) {
      return;
    }
    botaoEnviar.disabled = true;
    var urlEnviar = "/api/funcionarios/" + encodeURIComponent(botaoEnviar.dataset.enviar) + "/enviar-link-senha/";

    SF.api.post(urlEnviar)
      .then(function (resposta) {
        mostrarAviso(resposta.mensagem, "success");
        carregar();
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
        botaoEnviar.disabled = false;
      });
  });

  carregarSetoresModal();
  carregar();
})();
