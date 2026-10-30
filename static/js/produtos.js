/* =====================================================================
   SupplyFlow — Gestão de Produtos (/api/produtos/)
   ---------------------------------------------------------------------
   Lista o catálogo de EPIs e consumíveis, permitindo filtrar por nome,
   SKU ou categoria, além de cadastrar, editar e ativar/inativar itens
   para perfis com a permissão "produtos".
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var tabelaCorpo = document.getElementById("tabela-produtos-corpo");
  var filtroTermo = document.getElementById("filtro-termo-prod");
  var filtroCategoria = document.getElementById("filtro-categoria-prod");
  var btnFiltrar = document.getElementById("btn-filtrar-prod");
  var btnNovoProd = document.getElementById("btn-novo-produto");
  var podeGerenciarProdutos = SF.sessao.pode("produtos");

  if (btnNovoProd && !podeGerenciarProdutos) {
    btnNovoProd.classList.add("d-none");
  }

  var modalEl = document.getElementById("modal-produto");
  var formProd = document.getElementById("form-produto");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;

  var produtosCache = [];
  var categoriasCache = [];

  /* Adiciona opções (<option>) em um elemento <select> caso ainda não tenha sido populado */
  function popularSelectSeVazio(elementoSelect, listaItens) {
    if (!elementoSelect || elementoSelect.children.length > 1) {
      return;
    }
    listaItens.forEach(function (item) {
      var opcao = document.createElement("option");
      opcao.value = item.id;
      opcao.textContent = item.nome;
      elementoSelect.appendChild(opcao);
    });
  }

  function carregarProdutos() {
    tabelaCorpo.innerHTML =
      '<tr><td colspan="9" class="text-center py-4 text-muted">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando catálogo de produtos...' +
      "</td></tr>";

    SF.api.get("/api/produtos/?todos=true")
      .then(function (dados) {
        produtosCache = dados.produtos || [];
        categoriasCache = dados.categorias || [];

        popularSelectSeVazio(filtroCategoria, categoriasCache);
        popularSelectSeVazio(document.getElementById("prod-categoria"), categoriasCache);
        popularSelectSeVazio(document.getElementById("prod-fornecedor"), dados.fornecedores || []);

        filtrarERenderizar();
      })
      .catch(function (erro) {
        tabelaCorpo.innerHTML =
          '<tr><td colspan="9" class="text-center py-4 text-danger">' +
            "Erro ao carregar catálogo: " + escapar(erro.message) +
          "</td></tr>";
      });
  }

  /* Monta o HTML de uma linha da tabela de produtos */
  function criarLinhaProdutoHtml(produto) {
    var htmlComplementoCa = "";
    if (produto.ca) {
      var textoTamanho = produto.tamanho ? (" · " + escapar(produto.tamanho)) : "";
      htmlComplementoCa = '<span class="small text-muted d-block">CA ' + escapar(produto.ca) + textoTamanho + "</span>";
    }

    var textoCotaMensal = "—";
    if (produto.limite_padrao_mensal != null) {
      textoCotaMensal = escapar(produto.limite_padrao_mensal) + " un./mês";
    }
    var htmlPeriodicidade = "";
    if (produto.periodicidade_dias) {
      htmlPeriodicidade = '<span class="small text-muted d-block">troca a cada ' + escapar(produto.periodicidade_dias) + " dias</span>";
    }

    var badgeJustificativa = '<span class="badge bg-light text-muted border">Não</span>';
    if (produto.requer_justificativa) {
      badgeJustificativa = '<span class="badge bg-amber-subtle text-warning-emphasis border border-warning-subtle">Sim (Exige aprovação)</span>';
    }

    var badgeStatus = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';
    var corBotaoAlternar = "success";
    var rotuloAcaoAlternar = "Ativar";
    var iconeAlternar = "check-circle";

    if (produto.ativo) {
      badgeStatus = '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>';
      corBotaoAlternar = "danger";
      rotuloAcaoAlternar = "Inativar";
      iconeAlternar = "slash-circle";
    }

    var htmlAcoes = "—";
    if (SF.sessao.pode("produtos")) {
      htmlAcoes =
        '<button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-editar-prod" data-id="' + escapar(produto.id) + '"' +
                ' aria-label="Editar ' + escapar(produto.nome) + '" title="Editar">' +
          '<i class="bi bi-pencil" aria-hidden="true"></i>' +
        "</button>" +
        '<button type="button" class="btn btn-sm btn-outline-' + corBotaoAlternar + ' btn-toggle-prod" data-id="' + escapar(produto.id) + '"' +
                ' aria-label="' + rotuloAcaoAlternar + " " + escapar(produto.nome) + '" title="' + rotuloAcaoAlternar + '">' +
          '<i class="bi bi-' + iconeAlternar + '" aria-hidden="true"></i>' +
        "</button>";
    }

    var precoFormatado = "R$ " + produto.custo_unitario.toFixed(2).replace(".", ",");

    return (
      "<tr>" +
        '<td><span class="numero">' + escapar(produto.sku) + "</span></td>" +
        "<td><strong>" + escapar(produto.nome) + "</strong>" + htmlComplementoCa + "</td>" +
        "<td>" + escapar(produto.categoria) + "</td>" +
        '<td><span class="badge bg-light text-dark border">' + escapar(produto.unidade_medida) + "</span></td>" +
        "<td>" + precoFormatado + "</td>" +
        "<td>" + textoCotaMensal + htmlPeriodicidade + "</td>" +
        "<td>" + badgeJustificativa + "</td>" +
        "<td>" + badgeStatus + "</td>" +
        '<td class="text-end text-nowrap">' + htmlAcoes + "</td>" +
      "</tr>"
    );
  }

  function preencherModalParaEdicao(produto) {
    document.getElementById("modalProdTitulo").textContent = "Editar Produto";
    document.getElementById("prod-id").value = produto.id;
    document.getElementById("prod-sku").value = produto.sku;
    document.getElementById("prod-nome").value = produto.nome;
    document.getElementById("prod-descricao").value = produto.descricao;
    document.getElementById("prod-categoria").value = produto.categoria_id || "";
    document.getElementById("prod-unidade").value = produto.unidade_medida;
    document.getElementById("prod-custo").value = produto.custo_unitario;
    document.getElementById("prod-limite").value = (produto.limite_padrao_mensal != null) ? produto.limite_padrao_mensal : "";
    document.getElementById("prod-ca").value = produto.ca || "";
    document.getElementById("prod-validade-ca").value = produto.validade_ca || "";
    document.getElementById("prod-tamanho").value = produto.tamanho || "";
    document.getElementById("prod-periodicidade").value = produto.periodicidade_dias || "";
    document.getElementById("prod-fornecedor").value = produto.fornecedor_id || "";
    document.getElementById("prod-requer-justificativa").checked = produto.requer_justificativa;

    if (modalBs) {
      modalBs.show();
    }
  }

  function filtrarERenderizar() {
    var termoBusca = filtroTermo ? filtroTermo.value.trim().toLowerCase() : "";
    var categoriaSelecionada = filtroCategoria ? filtroCategoria.value : "";

    var listaFiltrada = produtosCache.filter(function (produto) {
      var correspondeAoTermo =
        !termoBusca ||
        produto.nome.toLowerCase().indexOf(termoBusca) !== -1 ||
        produto.sku.toLowerCase().indexOf(termoBusca) !== -1;
      var correspondeACategoria = !categoriaSelecionada || produto.categoria_id === categoriaSelecionada;
      return correspondeAoTermo && correspondeACategoria;
    });

    if (listaFiltrada.length === 0) {
      tabelaCorpo.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted">Nenhum produto atende aos filtros.</td></tr>';
      return;
    }

    tabelaCorpo.innerHTML = listaFiltrada.map(criarLinhaProdutoHtml).join("");

    document.querySelectorAll(".btn-editar-prod").forEach(function (botaoEditar) {
      botaoEditar.addEventListener("click", function () {
        var idProduto = this.dataset.id;
        var produto = produtosCache.find(function (item) {
          return item.id === idProduto;
        });
        if (produto) {
          preencherModalParaEdicao(produto);
        }
      });
    });

    document.querySelectorAll(".btn-toggle-prod").forEach(function (botaoAlternar) {
      botaoAlternar.addEventListener("click", function () {
        var idProduto = this.dataset.id;
        SF.api.post("/api/produtos/" + encodeURIComponent(idProduto) + "/toggle/")
          .then(function () {
            carregarProdutos();
          })
          .catch(function (erro) {
            alert(erro.message);
          });
      });
    });
  }

  if (btnNovoProd) {
    btnNovoProd.addEventListener("click", function () {
      formProd.reset();
      document.getElementById("modalProdTitulo").textContent = "Novo Produto";
      document.getElementById("prod-id").value = "";
      if (modalBs) {
        modalBs.show();
      }
    });
  }

  if (formProd) {
    formProd.addEventListener("submit", function (evento) {
      evento.preventDefault();
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
        requer_justificativa: document.getElementById("prod-requer-justificativa").checked
      };

      SF.api.post("/api/produtos/salvar/", payload)
        .then(function (resposta) {
          if (!resposta.sucesso) {
            throw new Error(resposta.erro || "Falha ao salvar produto.");
          }
          if (modalBs) {
            modalBs.hide();
          }
          carregarProdutos();
        })
        .catch(function (erro) {
          alert(erro.message);
        });
    });
  }

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", filtrarERenderizar);
  }
  if (filtroCategoria) {
    filtroCategoria.addEventListener("change", filtrarERenderizar);
  }
  if (filtroTermo) {
    filtroTermo.addEventListener("input", filtrarERenderizar);
  }

  carregarProdutos();
})();
