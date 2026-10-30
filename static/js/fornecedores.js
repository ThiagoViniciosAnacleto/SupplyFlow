/* =====================================================================
   SupplyFlow — Fornecedores (RF-05 · /api/fornecedores/)
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-fornecedores");
  var modal = new bootstrap.Modal(document.getElementById("modal-fornecedor"));
  var form = document.getElementById("form-fornecedor");
  var fornecedores = [];
  var podeEditar = SF.sessao.pode("produtos");

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function criarLinhaFornecedorHtml(fornecedor) {
    var htmlNomeFantasia = "";
    if (fornecedor.nome_fantasia) {
      htmlNomeFantasia = '<span class="small text-muted d-block">' + escapar(fornecedor.nome_fantasia) + "</span>";
    }

    var contatosSecundarios = [fornecedor.email, fornecedor.telefone].filter(Boolean).join(" · ");
    var classeSelo = fornecedor.ativo ? "selo--aprovado" : "selo--cancelado";
    var textoSituacao = fornecedor.ativo ? "Ativo" : "Inativo";

    var htmlAcoes = "—";
    if (podeEditar) {
      var corBotaoAlternar = fornecedor.ativo ? "danger" : "success";
      var rotuloAlternar = fornecedor.ativo ? "Inativar" : "Ativar";
      htmlAcoes =
        '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-editar="' + escapar(fornecedor.id) + '"' +
                ' aria-label="Editar ' + escapar(fornecedor.razao_social) + '">' +
          '<i class="bi bi-pencil" aria-hidden="true"></i>' +
        "</button>" +
        '<button type="button" class="btn btn-sm btn-outline-' + corBotaoAlternar + '" data-alternar="' + escapar(fornecedor.id) + '">' +
          rotuloAlternar +
        "</button>";
    }

    return (
      "<tr>" +
        "<td><strong>" + escapar(fornecedor.razao_social) + "</strong>" + htmlNomeFantasia + "</td>" +
        '<td class="text-nowrap"><span class="numero">' + escapar(fornecedor.cnpj) + "</span></td>" +
        "<td>" +
          escapar(fornecedor.contato || "—") +
          '<span class="small text-muted d-block">' + escapar(contatosSecundarios) + "</span>" +
        "</td>" +
        "<td>" + escapar(fornecedor.produtos) + "</td>" +
        '<td><span class="selo ' + classeSelo + '">' + textoSituacao + "</span></td>" +
        '<td class="tabela-solicitacoes__acao text-nowrap">' + htmlAcoes + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    SF.api.get("/api/fornecedores/")
      .then(function (dados) {
        fornecedores = dados.fornecedores || [];
        document.getElementById("btn-novo-fornecedor").classList.toggle("d-none", !podeEditar);

        var corpo = document.getElementById("corpo-fornecedores");
        if (fornecedores.length === 0) {
          corpo.innerHTML = '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhum fornecedor cadastrado.</td></tr>';
          return;
        }
        corpo.innerHTML = fornecedores.map(criarLinhaFornecedorHtml).join("");
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  function abrirModalFornecedor(fornecedor) {
    form.reset();
    document.getElementById("erro-fornecedor").textContent = "";
    document.getElementById("forn-id").value = fornecedor ? fornecedor.id : "";

    if (fornecedor) {
      document.getElementById("forn-razao").value = fornecedor.razao_social || "";
      document.getElementById("forn-fantasia").value = fornecedor.nome_fantasia || "";
      document.getElementById("forn-cnpj").value = fornecedor.cnpj || "";
      document.getElementById("forn-email").value = fornecedor.email || "";
      document.getElementById("forn-telefone").value = fornecedor.telefone || "";
      document.getElementById("forn-contato").value = fornecedor.contato || "";
    }
    modal.show();
  }

  document.getElementById("btn-novo-fornecedor").addEventListener("click", function () {
    abrirModalFornecedor(null);
  });

  document.getElementById("corpo-fornecedores").addEventListener("click", function (evento) {
    var botaoEditar = evento.target.closest("[data-editar]");
    var botaoAlternar = evento.target.closest("[data-alternar]");

    if (botaoEditar) {
      var fornecedorEncontrado = fornecedores.find(function (item) {
        return item.id === botaoEditar.dataset.editar;
      });
      abrirModalFornecedor(fornecedorEncontrado);
    }

    if (botaoAlternar) {
      SF.api.post("/api/fornecedores/" + encodeURIComponent(botaoAlternar.dataset.alternar) + "/toggle/")
        .then(carregar)
        .catch(function (erro) {
          mostrarAviso(erro.message, "danger");
        });
    }
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var dadosFormulario = {
      id: document.getElementById("forn-id").value || null,
      razao_social: document.getElementById("forn-razao").value.trim(),
      nome_fantasia: document.getElementById("forn-fantasia").value.trim(),
      cnpj: document.getElementById("forn-cnpj").value.trim(),
      email: document.getElementById("forn-email").value.trim(),
      telefone: document.getElementById("forn-telefone").value.trim(),
      contato: document.getElementById("forn-contato").value.trim()
    };

    SF.api.post("/api/fornecedores/salvar/", dadosFormulario)
      .then(function (resposta) {
        modal.hide();
        mostrarAviso(resposta.mensagem, "success");
        carregar();
      })
      .catch(function (erro) {
        document.getElementById("erro-fornecedor").textContent = erro.message;
      });
  });

  carregar();
})();
