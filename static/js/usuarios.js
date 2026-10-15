/* =====================================================================
   SupplyFlow — Usuários e permissões (somente ADMIN)
   Lista quem acessa o backoffice, a situação da conta e a matriz de
   permissões por perfil (vinda do servidor, a mesma usada para bloquear).
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-usuarios");

  var SITUACOES = {
    ativo: { rotulo: "Ativo", selo: "selo--aprovado" },
    convite_pendente: { rotulo: "Aguardando criar senha", selo: "selo--aguardando" },
    sem_email: { rotulo: "Sem e-mail cadastrado", selo: "selo--rejeitado" },
    inativo: { rotulo: "Inativo", selo: "selo--rejeitado" }
  };

  var ACOES = [
    ["ver", "Consultar telas"],
    ["decidir", "Aprovar / rejeitar"],
    ["entregar", "Confirmar entregas"],
    ["devolucao", "Registrar devoluções"],
    ["estoque", "Movimentar estoque"],
    ["produtos", "Cadastrar produtos"],
    ["ia", "Avaliar IA"],
    ["pessoas", "Funcionários e usuários"],
    ["auditoria", "Ver auditoria"]
  ];

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
  }

  function linhaUsuario(u) {
    var sit = SITUACOES[u.situacao] || SITUACOES.inativo;
    var podeEnviar = u.situacao === "ativo" || u.situacao === "convite_pendente";
    return "<tr>" +
      "<td><strong>" + escapar(u.nome) + '</strong><br><span class="text-muted small">Matrícula ' + escapar(u.matricula) + "</span></td>" +
      "<td>" + escapar(u.email || "—") + "</td>" +
      "<td>" + escapar(u.perfil) + "</td>" +
      '<td><span class="selo ' + sit.selo + '">' + escapar(sit.rotulo) + "</span></td>" +
      "<td>" + escapar(u.ultimo_acesso || "Nunca") + "</td>" +
      '<td class="tabela-solicitacoes__acao">' +
        (podeEnviar
          ? '<button type="button" class="btn btn-sm btn-outline-primary" data-enviar="' + escapar(u.id) + '"' +
            ' aria-label="Enviar link de senha para ' + escapar(u.nome) + '"><i class="bi bi-envelope" aria-hidden="true"></i> Enviar link</button>'
          : "—") +
      "</td>" +
    "</tr>";
  }

  function montarPermissoes(matriz) {
    document.getElementById("cabecalho-permissoes").innerHTML =
      '<tr><th scope="col">Perfil</th>' +
      ACOES.map(function (a) { return '<th scope="col" class="text-center">' + escapar(a[1]) + "</th>"; }).join("") +
      "</tr>";
    document.getElementById("corpo-permissoes").innerHTML = matriz.map(function (p) {
      return '<tr><th scope="row">' + escapar(p.perfil) + '<br><span class="text-muted small fw-normal">' + escapar(p.acesso) + "</span></th>" +
        ACOES.map(function (a) {
          var tem = p.acoes.indexOf(a[0]) !== -1;
          return '<td class="text-center">' + (tem
            ? '<i class="bi bi-check-circle-fill text-success" aria-hidden="true"></i><span class="visually-hidden">Sim</span>'
            : '<span aria-hidden="true" class="text-muted">—</span><span class="visually-hidden">Não</span>') + "</td>";
        }).join("") + "</tr>";
    }).join("");
  }

  function carregar() {
    SF.api.get("/api/usuarios/")
      .then(function (dados) {
        var corpo = document.getElementById("corpo-usuarios");
        corpo.innerHTML = dados.usuarios.length
          ? dados.usuarios.map(linhaUsuario).join("")
          : '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhum usuário com acesso ao backoffice.</td></tr>';
        montarPermissoes(dados.permissoes);
      })
      .catch(function (erro) { mostrarAviso(erro.message, "danger"); });
  }

  document.getElementById("corpo-usuarios").addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-enviar]");
    if (!botao) return;
    botao.disabled = true;
    SF.api.post("/api/funcionarios/" + encodeURIComponent(botao.dataset.enviar) + "/enviar-link-senha/")
      .then(function (res) { mostrarAviso(res.mensagem, "success"); carregar(); })
      .catch(function (erro) { mostrarAviso(erro.message, "danger"); botao.disabled = false; });
  });

  carregar();
})();
