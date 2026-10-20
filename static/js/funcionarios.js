/* =====================================================================
   SupplyFlow — Gestão de Funcionários (Frontend integrado à API Django)
   ===================================================================== */

(function () {
  var tabelaCorpo = document.getElementById("tabela-funcionarios-corpo");
  var filtroTermo = document.getElementById("filtro-termo");
  var filtroSetor = document.getElementById("filtro-setor");
  var btnFiltrar = document.getElementById("btn-filtrar");
  var btnNovoFunc = document.getElementById("btn-novo-funcionario");
  var modalEl = document.getElementById("modal-funcionario");
  var formFunc = document.getElementById("form-funcionario");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;

  var funcionariosCache = [];

  function carregarSetores() {
    SF.api.get("/api/setores/")
      .then(function (d) {
        var setores = d.setores || [];
        var selectFiltro = document.getElementById("filtro-setor");
        var selectModal = document.getElementById("func-setor");

        setores.forEach(function (s) {
          var opt1 = document.createElement("option");
          opt1.value = s.id;
          opt1.textContent = s.nome;
          selectFiltro.appendChild(opt1);

          var opt2 = document.createElement("option");
          opt2.value = s.id;
          opt2.textContent = s.nome + " (" + s.centro_custo + ")";
          selectModal.appendChild(opt2);
        });
      })
      .catch(function (e) { console.warn("Erro ao carregar setores:", e); });
  }

  function carregarFuncionarios() {
    var termo = filtroTermo ? filtroTermo.value.trim() : "";
    var setor = filtroSetor ? filtroSetor.value : "";

    var url = "/api/funcionarios/?q=" + encodeURIComponent(termo) + "&setor=" + encodeURIComponent(setor);
    tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Carregando colaboradores...</td></tr>';

    SF.api.get(url)
      .then(function (dados) {
        funcionariosCache = dados.funcionarios || [];
        renderizarTabela(funcionariosCache);
      })
      .catch(function (err) {
        tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-danger">Falha ao carregar funcionários: ' + err.message + '</td></tr>';
      });
  }

  function renderizarTabela(lista) {
    if (!lista || lista.length === 0) {
      tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Nenhum funcionário encontrado.</td></tr>';
      return;
    }

    var esc = SF.escapar;
    tabelaCorpo.innerHTML = lista.map(function (u) {
      var badgeStatus = u.ativo
        ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>'
        : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';

      var badgePerfil = '<span class="badge bg-light text-dark border">' + esc(u.perfil) + '</span>';

      return (
        '<tr>' +
          '<td>' +
            '<div class="d-flex align-items-center gap-2">' +
              '<span class="usuario__avatar" style="width:34px;height:34px;font-size:12px;" aria-hidden="true">' + esc(u.iniciais) + '</span>' +
              '<div>' +
                '<div class="fw-semibold">' + esc(u.nome) + '</div>' +
                '<small class="text-muted">' + esc(u.email) + '</small>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td><span class="numero">' + esc(u.matricula) + '</span></td>' +
          '<td>' + esc(u.cargo) + '</td>' +
          '<td>' + esc(u.setor_nome) + '</td>' +
          '<td>' + badgePerfil + '</td>' +
          '<td>' + badgeStatus + '</td>' +
          '<td class="text-end text-nowrap">' +
            '<a class="btn btn-sm btn-outline-primary me-1" href="ficha-epi.html?id=' + encodeURIComponent(u.id) + '"' +
              ' aria-label="Ficha de EPI de ' + esc(u.nome) + '" title="Ficha de EPI"><i class="bi bi-card-checklist" aria-hidden="true"></i></a>' +
            '<button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-editar" data-id="' + esc(u.id) + '"' +
              ' aria-label="Editar ' + esc(u.nome) + '" title="Editar"><i class="bi bi-pencil" aria-hidden="true"></i></button>' +
            '<button type="button" class="btn btn-sm btn-outline-' + (u.ativo ? 'danger' : 'success') + ' btn-toggle" data-id="' + esc(u.id) + '"' +
              ' aria-label="' + (u.ativo ? 'Inativar ' : 'Ativar ') + esc(u.nome) + '" title="' + (u.ativo ? 'Inativar' : 'Ativar') + '">' +
              '<i class="bi bi-' + (u.ativo ? 'slash-circle' : 'check-circle') + '" aria-hidden="true"></i>' +
            '</button>' +
          '</td>' +
        '</tr>'
      );
    }).join("");

    // Eventos editar
    document.querySelectorAll(".btn-editar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = this.dataset.id;
        var u = funcionariosCache.find(function (item) { return item.id === id; });
        if (!u) return;

        document.getElementById("modalFuncTitulo").textContent = "Editar Funcionário";
        document.getElementById("func-id").value = u.id;
        document.getElementById("func-nome").value = u.nome;
        document.getElementById("func-matricula").value = u.matricula;
        document.getElementById("func-email").value = u.email === "—" ? "" : u.email;
        document.getElementById("func-cargo").value = u.cargo;
        document.getElementById("func-setor").value = u.setor_id || "";
        document.getElementById("func-perfil").value = u.perfil || "COLABORADOR";
        document.getElementById("func-pin").value = "";

        if (modalBs) modalBs.show();
      });
    });

    // Eventos ativar/inativar
    document.querySelectorAll(".btn-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = this.dataset.id;
        SF.api.post("/api/funcionarios/" + encodeURIComponent(id) + "/toggle/")
          .then(function (res) {
            carregarFuncionarios();
          });
      });
    });
  }

  // Novo Funcionário
  if (btnNovoFunc) {
    btnNovoFunc.addEventListener("click", function () {
      formFunc.reset();
      document.getElementById("modalFuncTitulo").textContent = "Novo Funcionário";
      document.getElementById("func-id").value = "";
      if (modalBs) modalBs.show();
    });
  }

  // Salvar Funcionário
  if (formFunc) {
    formFunc.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        id: document.getElementById("func-id").value || null,
        nome: document.getElementById("func-nome").value.trim(),
        matricula: document.getElementById("func-matricula").value.trim(),
        pin: document.getElementById("func-pin").value.trim(),
        email: document.getElementById("func-email").value.trim(),
        cargo: document.getElementById("func-cargo").value.trim(),
        setor_id: document.getElementById("func-setor").value || null,
        perfil: document.getElementById("func-perfil").value,
      };

      SF.api.post("/api/funcionarios/salvar/", payload)
        .then(function (res) {
          if (!res.sucesso) throw new Error(res.erro || "Falha ao salvar funcionário.");
          if (modalBs) modalBs.hide();
          carregarFuncionarios();
          if (res.convite_enviado) alert(res.mensagem);
        })
        .catch(function (err) {
          alert(err.message);
        });
    });
  }

  if (btnFiltrar) btnFiltrar.addEventListener("click", carregarFuncionarios);
  if (filtroTermo) {
    filtroTermo.addEventListener("keydown", function (e) {
      if (e.key === "Enter") carregarFuncionarios();
    });
  }

  carregarSetores();
  carregarFuncionarios();
})();

