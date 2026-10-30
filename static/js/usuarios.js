/* =====================================================================
   SupplyFlow — Usuários e Permissões (somente ADMIN · /api/usuarios/)
   ---------------------------------------------------------------------
   Lista todas as contas com acesso ao backoffice, permite enviar ou
   reenviar o link de redefinição de senha por e-mail e exibe a matriz
   oficial de permissões por perfil vinda do servidor.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-usuarios");

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

  function criarLinhaUsuarioHtml(usuario) {
    var infoSituacao = MAPA_SITUACOES_CONTA[usuario.situacao] || MAPA_SITUACOES_CONTA.inativo;
    var podeEnviarLink = (usuario.situacao === "ativo" || usuario.situacao === "convite_pendente");

    var htmlBotaoLink = "—";
    if (podeEnviarLink) {
      htmlBotaoLink =
        '<button type="button" class="btn btn-sm btn-outline-primary" data-enviar="' + escapar(usuario.id) + '"' +
                ' aria-label="Enviar link de senha para ' + escapar(usuario.nome) + '">' +
          '<i class="bi bi-envelope" aria-hidden="true"></i> Enviar link' +
        "</button>";
    }

    return (
      "<tr>" +
        "<td>" +
          "<strong>" + escapar(usuario.nome) + "</strong>" +
          '<br><span class="text-muted small">Matrícula ' + escapar(usuario.matricula) + "</span>" +
        "</td>" +
        "<td>" + escapar(usuario.email || "—") + "</td>" +
        "<td>" + escapar(usuario.perfil) + "</td>" +
        '<td><span class="selo ' + infoSituacao.selo + '">' + escapar(infoSituacao.rotulo) + "</span></td>" +
        "<td>" + escapar(usuario.ultimo_acesso || "Nunca") + "</td>" +
        '<td class="tabela-solicitacoes__acao">' + htmlBotaoLink + "</td>" +
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

  function carregar() {
    SF.api.get("/api/usuarios/")
      .then(function (dados) {
        var corpoUsuarios = document.getElementById("corpo-usuarios");
        var listaUsuarios = dados.usuarios || [];

        if (listaUsuarios.length === 0) {
          corpoUsuarios.innerHTML = '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhum usuário com acesso ao backoffice.</td></tr>';
        } else {
          corpoUsuarios.innerHTML = listaUsuarios.map(criarLinhaUsuarioHtml).join("");
        }
        montarTabelaPermissoes(dados.permissoes || []);
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  document.getElementById("corpo-usuarios").addEventListener("click", function (evento) {
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

  carregar();
})();
