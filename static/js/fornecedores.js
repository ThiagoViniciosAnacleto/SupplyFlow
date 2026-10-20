/* =====================================================================
   SupplyFlow — Fornecedores (RF-05)
   ===================================================================== */

(function () {
  var esc = SF.escapar;
  var aviso = document.getElementById("aviso-fornecedores");
  var modal = new bootstrap.Modal(document.getElementById("modal-fornecedor"));
  var form = document.getElementById("form-fornecedor");
  var fornecedores = [];
  var podeEditar = SF.sessao.pode("produtos");
  var CAMPOS = ["razao_social:razao", "nome_fantasia:fantasia", "cnpj:cnpj", "email:email", "telefone:telefone", "contato:contato"];

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function carregar() {
    SF.api.get("/api/fornecedores/").then(function (d) {
      fornecedores = d.fornecedores;
      document.getElementById("btn-novo-fornecedor").classList.toggle("d-none", !podeEditar);
      document.getElementById("corpo-fornecedores").innerHTML = fornecedores.length ? fornecedores.map(function (f) {
        return "<tr>" +
          "<td><strong>" + esc(f.razao_social) + "</strong>" + (f.nome_fantasia ? '<span class="small text-muted d-block">' + esc(f.nome_fantasia) + "</span>" : "") + "</td>" +
          '<td class="text-nowrap"><span class="numero">' + esc(f.cnpj) + "</span></td>" +
          "<td>" + esc(f.contato || "—") + '<span class="small text-muted d-block">' + esc([f.email, f.telefone].filter(Boolean).join(" · ")) + "</span></td>" +
          "<td>" + esc(f.produtos) + "</td>" +
          '<td><span class="selo ' + (f.ativo ? "selo--aprovado" : "selo--cancelado") + '">' + (f.ativo ? "Ativo" : "Inativo") + "</span></td>" +
          '<td class="tabela-solicitacoes__acao text-nowrap">' + (podeEditar
            ? '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-editar="' + esc(f.id) + '" aria-label="Editar ' + esc(f.razao_social) + '"><i class="bi bi-pencil" aria-hidden="true"></i></button>' +
              '<button type="button" class="btn btn-sm btn-outline-' + (f.ativo ? "danger" : "success") + '" data-alternar="' + esc(f.id) + '">' + (f.ativo ? "Inativar" : "Ativar") + "</button>"
            : "—") + "</td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhum fornecedor cadastrado.</td></tr>';
    }).catch(function (e) { mostrarAviso(e.message, "danger"); });
  }

  function abrir(f) {
    form.reset();
    document.getElementById("erro-fornecedor").textContent = "";
    document.getElementById("forn-id").value = f ? f.id : "";
    if (f) CAMPOS.forEach(function (c) { var p = c.split(":"); document.getElementById("forn-" + p[1]).value = f[p[0]] || ""; });
    modal.show();
  }

  document.getElementById("btn-novo-fornecedor").addEventListener("click", function () { abrir(null); });

  document.getElementById("corpo-fornecedores").addEventListener("click", function (evento) {
    var editar = evento.target.closest("[data-editar]");
    var alternar = evento.target.closest("[data-alternar]");
    if (editar) abrir(fornecedores.find(function (f) { return f.id === editar.dataset.editar; }));
    if (alternar) {
      SF.api.post("/api/fornecedores/" + encodeURIComponent(alternar.dataset.alternar) + "/toggle/")
        .then(carregar).catch(function (e) { mostrarAviso(e.message, "danger"); });
    }
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var dados = { id: document.getElementById("forn-id").value || null };
    CAMPOS.forEach(function (c) { var p = c.split(":"); dados[p[0]] = document.getElementById("forn-" + p[1]).value.trim(); });
    SF.api.post("/api/fornecedores/salvar/", dados)
      .then(function (r) { modal.hide(); mostrarAviso(r.mensagem, "success"); carregar(); })
      .catch(function (e) { document.getElementById("erro-fornecedor").textContent = e.message; });
  });

  carregar();
})();
