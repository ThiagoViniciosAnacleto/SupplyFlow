/* =====================================================================
   SupplyFlow — Gestão de Produtos (Frontend integrado à API Django)
   ===================================================================== */

(function () {
  var tabelaCorpo = document.getElementById("tabela-produtos-corpo");
  var filtroTermo = document.getElementById("filtro-termo-prod");
  var filtroCategoria = document.getElementById("filtro-categoria-prod");
  var btnFiltrar = document.getElementById("btn-filtrar-prod");
  var btnNovoProd = document.getElementById("btn-novo-produto");
  if (btnNovoProd && !SF.sessao.pode("produtos")) btnNovoProd.classList.add("d-none");
  var modalEl = document.getElementById("modal-produto");
  var formProd = document.getElementById("form-produto");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;

  var produtosCache = [];
  var categoriasCache = [];

  function carregarProdutos() {
    tabelaCorpo.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Carregando catálogo de produtos...</td></tr>';

    SF.api.get("/api/produtos/?todos=true")
      .then(function (dados) {
        produtosCache = dados.produtos || [];
        categoriasCache = dados.categorias || [];

        // Popula selects de categoria
        if (filtroCategoria && filtroCategoria.children.length <= 1) {
          categoriasCache.forEach(function (c) {
            var opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.nome;
            filtroCategoria.appendChild(opt);
          });
        }

        var selectModal = document.getElementById("prod-categoria");
        if (selectModal && selectModal.children.length <= 1) {
          categoriasCache.forEach(function (c) {
            var opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.nome;
            selectModal.appendChild(opt);
          });
        }

        var selectForn = document.getElementById("prod-fornecedor");
        if (selectForn && selectForn.children.length <= 1) {
          (dados.fornecedores || []).forEach(function (f) {
            var opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.nome;
            selectForn.appendChild(opt);
          });
        }

        filtrarERenderizar();
      })
      .catch(function (err) {
        tabelaCorpo.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger">Erro ao carregar catálogo: ' + SF.escapar(err.message) + '</td></tr>';
      });
  }

  function filtrarERenderizar() {
    var termo = filtroTermo ? filtroTermo.value.trim().toLowerCase() : "";
    var catId = filtroCategoria ? filtroCategoria.value : "";

    var lista = produtosCache.filter(function (p) {
      var matchTermo = !termo || p.nome.toLowerCase().indexOf(termo) !== -1 || p.sku.toLowerCase().indexOf(termo) !== -1;
      var matchCat = !catId || p.categoria_id === catId;
      return matchTermo && matchCat;
    });

    if (lista.length === 0) {
      tabelaCorpo.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">Nenhum produto atende aos filtros.</td></tr>';
      return;
    }

    var esc = SF.escapar;
    tabelaCorpo.innerHTML = lista.map(function (p) {
      var ehEpi = p.tipo === "EPI";
      var badgeTipo = ehEpi
        ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">EPI</span>'
        : '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">Consumível</span>';

      var badgeJust = p.requer_justificativa
        ? '<span class="badge bg-amber-subtle text-warning-emphasis border border-warning-subtle">Sim (Exige aprovação)</span>'
        : '<span class="badge bg-light text-muted border">Não</span>';

      var badgeStatus = p.ativo
        ? '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>'
        : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';

      return (
        '<tr>' +
          '<td><span class="numero">' + esc(p.sku) + '</span></td>' +
          '<td><strong>' + esc(p.nome) + '</strong>' + (p.ca ? '<span class="small text-muted d-block">CA ' + esc(p.ca) + (p.tamanho ? ' · ' + esc(p.tamanho) : '') + '</span>' : '') + '</td>' +
          '<td>' + esc(p.categoria) + '</td>' +
          '<td><span class="badge bg-light text-dark border">' + esc(p.unidade_medida) + '</span></td>' +
          '<td>R$ ' + p.custo_unitario.toFixed(2).replace(".", ",") + '</td>' +
          '<td>' + (p.limite_padrao_mensal != null ? esc(p.limite_padrao_mensal) + ' un./mês' : '—') +
            (p.periodicidade_dias ? '<span class="small text-muted d-block">troca a cada ' + esc(p.periodicidade_dias) + ' dias</span>' : '') + '</td>' +
          '<td>' + badgeJust + '</td>' +
          '<td>' + badgeStatus + '</td>' +
          '<td class="text-end text-nowrap">' + (SF.sessao.pode("produtos")
            ? '<button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-editar-prod" data-id="' + esc(p.id) + '"' +
                ' aria-label="Editar ' + esc(p.nome) + '" title="Editar"><i class="bi bi-pencil" aria-hidden="true"></i></button>' +
              '<button type="button" class="btn btn-sm btn-outline-' + (p.ativo ? 'danger' : 'success') + ' btn-toggle-prod" data-id="' + esc(p.id) + '"' +
                ' aria-label="' + (p.ativo ? 'Inativar ' : 'Ativar ') + esc(p.nome) + '" title="' + (p.ativo ? 'Inativar' : 'Ativar') + '">' +
                '<i class="bi bi-' + (p.ativo ? 'slash-circle' : 'check-circle') + '" aria-hidden="true"></i></button>'
            : '—') +
          '</td>' +
        '</tr>'
      );
    }).join("");

    // Eventos editar
    document.querySelectorAll(".btn-editar-prod").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = this.dataset.id;
        var p = produtosCache.find(function (item) { return item.id === id; });
        if (!p) return;

        document.getElementById("modalProdTitulo").textContent = "Editar Produto";
        document.getElementById("prod-id").value = p.id;
        document.getElementById("prod-sku").value = p.sku;
        document.getElementById("prod-nome").value = p.nome;
        document.getElementById("prod-descricao").value = p.descricao;
        document.getElementById("prod-categoria").value = p.categoria_id || "";
        document.getElementById("prod-unidade").value = p.unidade_medida;
        document.getElementById("prod-custo").value = p.custo_unitario;
        document.getElementById("prod-limite").value = p.limite_padrao_mensal != null ? p.limite_padrao_mensal : "";
        document.getElementById("prod-ca").value = p.ca || "";
        document.getElementById("prod-validade-ca").value = p.validade_ca || "";
        document.getElementById("prod-tamanho").value = p.tamanho || "";
        document.getElementById("prod-periodicidade").value = p.periodicidade_dias || "";
        document.getElementById("prod-fornecedor").value = p.fornecedor_id || "";
        document.getElementById("prod-requer-justificativa").checked = p.requer_justificativa;

        if (modalBs) modalBs.show();
      });
    });

    // Eventos toggle ativo
    document.querySelectorAll(".btn-toggle-prod").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = this.dataset.id;
        SF.api.post("/api/produtos/" + encodeURIComponent(id) + "/toggle/")
          .then(function () {
            carregarProdutos();
          })
          .catch(function (err) { alert(err.message); });
      });
    });
  }

  // Novo Produto
  if (btnNovoProd) {
    btnNovoProd.addEventListener("click", function () {
      formProd.reset();
      document.getElementById("modalProdTitulo").textContent = "Novo Produto";
      document.getElementById("prod-id").value = "";
      if (modalBs) modalBs.show();
    });
  }

  // Salvar Produto
  if (formProd) {
    formProd.addEventListener("submit", function (e) {
      e.preventDefault();
      var payload = {
        id: document.getElementById("prod-id").value || null,
        sku: document.getElementById("prod-sku").value.trim().toUpperCase(),
        nome: document.getElementById("prod-nome").value.trim(),
        descricao: document.getElementById("prod-descricao").value.trim(),
        categoria_id: document.getElementById("prod-categoria").value || null,
        unidade_medida: document.getElementById("prod-unidade").value,
        custo_unitario: document.getElementById("prod-custo").value,
        limite_padrao_mensal: document.getElementById("prod-limite").value,
        periodicidade_dias: document.getElementById("prod-periodicidade").value,
        ca: document.getElementById("prod-ca").value.trim(),
        validade_ca: document.getElementById("prod-validade-ca").value,
        tamanho: document.getElementById("prod-tamanho").value.trim(),
        fornecedor_id: document.getElementById("prod-fornecedor").value || null,
        requer_justificativa: document.getElementById("prod-requer-justificativa").checked,
      };

      SF.api.post("/api/produtos/salvar/", payload)
        .then(function (res) {
          if (!res.sucesso) throw new Error(res.erro || "Falha ao salvar produto.");
          if (modalBs) modalBs.hide();
          carregarProdutos();
        })
        .catch(function (err) {
          alert(err.message);
        });
    });
  }

  if (btnFiltrar) btnFiltrar.addEventListener("click", filtrarERenderizar);
  if (filtroCategoria) filtroCategoria.addEventListener("change", filtrarERenderizar);
  if (filtroTermo) {
    filtroTermo.addEventListener("input", filtrarERenderizar);
  }

  carregarProdutos();
})();

