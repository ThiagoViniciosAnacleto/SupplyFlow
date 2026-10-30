/* =====================================================================
   SupplyFlow — Relatórios de Gestão (RF-48, RF-49 · /api/relatorios/)
   ---------------------------------------------------------------------
   Apresenta os indicadores consolidados do período (consumo por centro
   de custo, consumo por produto, solicitações por situação, exceções
   por motivo e comparativo entre categorias sugeridas pela IA e
   confirmadas na decisão humana), com exportação em CSV por seção.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  function formatarReais(valor) {
    if (valor == null) {
      return "—";
    }
    return valor.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatarPercentual(valor) {
    if (valor == null) {
      return "—";
    }
    return String(valor).replace(".", ",") + "%";
  }

  function criarLinhaTabelaVazia(quantidadeColunas, texto) {
    return '<tr><td colspan="' + quantidadeColunas + '" class="tabela-solicitacoes__vazio">' + escapar(texto) + "</td></tr>";
  }

  function montarListaResumoHtml(itens, chaveRotulo, chaveValor) {
    if (!itens || itens.length === 0) {
      return "<li>Nada no período.</li>";
    }
    return itens.map(function (item) {
      return (
        "<li>" +
          "<span>" + escapar(item[chaveRotulo]) + "</span>" +
          '<span class="status"><strong>' + escapar(item[chaveValor]) + "</strong></span>" +
        "</li>"
      );
    }).join("");
  }

  function obterParametrosPeriodo() {
    var parametros = new URLSearchParams();
    var dataDe = document.getElementById("p-de").value;
    var dataAte = document.getElementById("p-ate").value;
    if (dataDe) {
      parametros.set("de", dataDe);
    }
    if (dataAte) {
      parametros.set("ate", dataAte);
    }
    return parametros;
  }

  function criarCardIndicadorRelatorioHtml(indicador) {
    return (
      '<div class="cartao indicador">' +
        "<div>" +
          '<p class="indicador__rotulo">' + escapar(indicador.rotulo) + "</p>" +
          '<p class="indicador__valor">' + escapar(indicador.valor) + "</p>" +
          '<p class="indicador__nota">' + escapar(indicador.nota) + "</p>" +
        "</div>" +
        '<span class="indicador__icone ' + indicador.tom + '" aria-hidden="true">' +
          '<i class="bi bi-bar-chart"></i>' +
        "</span>" +
      "</div>"
    );
  }

  function carregar() {
    var parametros = obterParametrosPeriodo();

    /* Atualiza os links de exportação CSV de cada seção com o período selecionado */
    document.querySelectorAll("[data-secao]").forEach(function (linkCsv) {
      var parametrosCsv = new URLSearchParams(parametros);
      parametrosCsv.set("formato", "csv");
      parametrosCsv.set("secao", linkCsv.dataset.secao);
      linkCsv.href = "/api/relatorios/?" + parametrosCsv.toString();
    });

    document.getElementById("erro-relatorio").classList.add("d-none");

    SF.api.get("/api/relatorios/?" + parametros.toString())
      .then(function (dados) {
        var resumo = dados.resumo;
        var textoDataInicio = dados.periodo.de || "início";
        document.getElementById("descricao-periodo").textContent =
          "Período: " + textoDataInicio + " a " + dados.periodo.ate + ". Calculado das entregas e decisões registradas.";

        var textoTempoMedio = "—";
        if (resumo.tempo_medio_decisao_horas != null) {
          textoTempoMedio = String(resumo.tempo_medio_decisao_horas).replace(".", ",") + " h";
        }

        var cartoesKpi = [
          {
            rotulo: "Itens entregues",
            valor: resumo.itens_entregues,
            nota: "R$ " + formatarReais(resumo.valor_entregue) + " em " + resumo.entregas + " entrega(s)",
            tom: "tom-azul"
          },
          {
            rotulo: "Solicitações",
            valor: resumo.solicitacoes,
            nota: formatarPercentual(resumo.percentual_excecoes) + " foram exceções",
            tom: "tom-ambar"
          },
          {
            rotulo: "Taxa de aprovação",
            valor: formatarPercentual(resumo.taxa_aprovacao),
            nota: resumo.decisoes + " decisão(ões)",
            tom: "tom-verde"
          },
          {
            rotulo: "Tempo médio até a decisão",
            valor: textoTempoMedio,
            nota: "Concordância com a IA: " + formatarPercentual(resumo.concordancia_ia),
            tom: "tom-indigo"
          }
        ];

        document.getElementById("kpis-relatorio").innerHTML =
          cartoesKpi.map(criarCardIndicadorRelatorioHtml).join("");

        /* Tabela 1: Consumo por centro de custo */
        var corpoCentros = document.getElementById("corpo-centros");
        if (dados.consumo_por_centro.length === 0) {
          corpoCentros.innerHTML = criarLinhaTabelaVazia(3, "Nenhuma entrega no período.");
        } else {
          corpoCentros.innerHTML = dados.consumo_por_centro.map(function (itemCentro) {
            return (
              "<tr>" +
                "<td>" + escapar(itemCentro.centro) + "</td>" +
                '<td class="text-end">' + escapar(itemCentro.quantidade) + "</td>" +
                '<td class="text-end">' + formatarReais(itemCentro.valor) + "</td>" +
              "</tr>"
            );
          }).join("");
        }

        /* Tabela 2: Consumo por produto */
        var corpoProdutos = document.getElementById("corpo-produtos");
        if (dados.consumo_por_produto.length === 0) {
          corpoProdutos.innerHTML = criarLinhaTabelaVazia(4, "Nenhuma entrega no período.");
        } else {
          corpoProdutos.innerHTML = dados.consumo_por_produto.map(function (itemProduto) {
            var rotuloTipo = itemProduto.epi ? "EPI" : "Consumível";
            return (
              "<tr>" +
                "<td>" + escapar(itemProduto.produto) + "</td>" +
                "<td>" + rotuloTipo + "</td>" +
                '<td class="text-end">' + escapar(itemProduto.quantidade) + "</td>" +
                '<td class="text-end">' + formatarReais(itemProduto.valor) + "</td>" +
              "</tr>"
            );
          }).join("");
        }

        /* Listas de solicitações por situação e exceções por motivo */
        document.getElementById("lista-status").innerHTML =
          montarListaResumoHtml(dados.solicitacoes_por_status, "status", "total");
        document.getElementById("lista-excecoes").innerHTML =
          montarListaResumoHtml(dados.excecoes_por_motivo, "motivo", "total");

        /* Tabela 3: Justificativas por categoria (IA vs. Responsável) */
        document.getElementById("corpo-justificativas").innerHTML =
          dados.justificativas_por_categoria.map(function (itemCategoria) {
            return (
              "<tr>" +
                "<td>" + escapar(itemCategoria.categoria) + "</td>" +
                '<td class="text-end">' + escapar(itemCategoria.sugeridas_ia) + "</td>" +
                '<td class="text-end">' + escapar(itemCategoria.confirmadas) + "</td>" +
              "</tr>"
            );
          }).join("");
      })
      .catch(function (erro) {
        var caixaErro = document.getElementById("erro-relatorio");
        caixaErro.textContent = erro.message;
        caixaErro.classList.remove("d-none");
      });
  }

  document.getElementById("form-periodo").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });

  carregar();
})();
