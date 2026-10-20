/* =====================================================================
   SupplyFlow — Políticas de fornecimento (RF-12, RF-13, RF-14)
   ===================================================================== */

(function () {
  var esc = SF.escapar;
  var aviso = document.getElementById("aviso-regras");
  var modal = new bootstrap.Modal(document.getElementById("modal-regra"));
  var form = document.getElementById("form-regra");
  var regras = [];
  var podeEditar = SF.sessao.pode("produtos");

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function opcoes(lista, vazio) {
    return '<option value="">' + esc(vazio) + "</option>" + lista.map(function (o) {
      return '<option value="' + esc(o.id) + '">' + esc(o.nome) + "</option>";
    }).join("");
  }

  function carregar() {
    SF.api.get("/api/politicas/").then(function (d) {
      regras = d.regras;
      document.getElementById("btn-nova-regra").classList.toggle("d-none", !podeEditar);
      document.getElementById("regra-produto").innerHTML = opcoes(d.produtos, "Selecione…");
      document.getElementById("regra-setor").innerHTML = opcoes(d.setores, "Todos os setores");
      document.getElementById("lista-cargos").innerHTML = d.cargos.map(function (c) {
        return '<option value="' + esc(c) + '">';
      }).join("");

      document.getElementById("corpo-regras").innerHTML = regras.length ? regras.map(function (r) {
        var escopo = [r.setor ? "Setor: " + r.setor : "", r.cargo ? "Cargo: " + r.cargo : ""].filter(Boolean).join(" · ");
        return "<tr>" +
          "<td><strong>" + esc(r.produto) + '</strong><span class="small text-muted d-block">' + esc(r.tipo) + "</span></td>" +
          "<td>" + esc(escopo) + "</td>" +
          "<td>" + (r.limite_mensal != null ? esc(r.limite_mensal) + " un." : '<span class="text-muted">padrão (' + esc(r.padrao_limite != null ? r.padrao_limite : "—") + ")</span>") + "</td>" +
          "<td>" + (r.periodicidade_dias ? esc(r.periodicidade_dias) + " dias" : '<span class="text-muted">padrão (' + esc(r.padrao_periodicidade || "—") + ")</span>") + "</td>" +
          '<td><span class="selo ' + (r.ativo ? "selo--aprovado" : "selo--cancelado") + '">' + (r.ativo ? "Ativa" : "Inativa") + "</span></td>" +
          '<td class="tabela-solicitacoes__acao text-nowrap">' + (podeEditar
            ? '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-editar="' + esc(r.id) + '" aria-label="Editar política de ' + esc(r.produto) + '"><i class="bi bi-pencil" aria-hidden="true"></i></button>' +
              '<button type="button" class="btn btn-sm btn-outline-' + (r.ativo ? "danger" : "success") + '" data-alternar="' + esc(r.id) + '">' + (r.ativo ? "Inativar" : "Ativar") + "</button>"
            : "—") + "</td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhuma política cadastrada: valem os padrões de cada produto.</td></tr>';
    }).catch(function (e) { mostrarAviso(e.message, "danger"); });
  }

  function abrir(regra) {
    form.reset();
    document.getElementById("erro-regra").textContent = "";
    document.getElementById("regra-id").value = regra ? regra.id : "";
    if (regra) {
      document.getElementById("regra-produto").value = regra.produto_id;
      document.getElementById("regra-setor").value = regra.setor_id || "";
      document.getElementById("regra-cargo").value = regra.cargo || "";
      document.getElementById("regra-limite").value = regra.limite_mensal != null ? regra.limite_mensal : "";
      document.getElementById("regra-periodicidade").value = regra.periodicidade_dias || "";
    }
    modal.show();
  }

  document.getElementById("btn-nova-regra").addEventListener("click", function () { abrir(null); });

  document.getElementById("corpo-regras").addEventListener("click", function (evento) {
    var editar = evento.target.closest("[data-editar]");
    var alternar = evento.target.closest("[data-alternar]");
    if (editar) abrir(regras.find(function (r) { return r.id === editar.dataset.editar; }));
    if (alternar) {
      SF.api.post("/api/politicas/" + encodeURIComponent(alternar.dataset.alternar) + "/toggle/")
        .then(carregar).catch(function (e) { mostrarAviso(e.message, "danger"); });
    }
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    SF.api.post("/api/politicas/salvar/", {
      id: document.getElementById("regra-id").value || null,
      produto_id: document.getElementById("regra-produto").value,
      setor_id: document.getElementById("regra-setor").value || null,
      cargo: document.getElementById("regra-cargo").value.trim(),
      limite_mensal: document.getElementById("regra-limite").value,
      periodicidade_dias: document.getElementById("regra-periodicidade").value
    }).then(function (r) {
      modal.hide();
      mostrarAviso(r.mensagem, "success");
      carregar();
    }).catch(function (e) { document.getElementById("erro-regra").textContent = e.message; });
  });

  carregar();
})();
