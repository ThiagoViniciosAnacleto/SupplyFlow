/* =====================================================================
   SupplyFlow — Histórico com Filtros e Exportação CSV (/api/historico/)
   ---------------------------------------------------------------------
   Consulta movimentações (entregas, devoluções, entradas de estoque) e
   solicitações com múltiplos filtros combinados (RF-44, RF-45, RF-47, RF-49).
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var corpoTabela = document.getElementById("corpo-historico");
  var filtrosJaForamPreenchidos = false;

  /* Mapeia o ID do campo no HTML para o nome do parâmetro na query string da API */
  var MAPA_CAMPOS_FILTRO = {
    "f-tipo": "tipo",
    "f-de": "de",
    "f-ate": "ate",
    "f-funcionario": "funcionario",
    "f-cargo": "cargo",
    "f-setor": "setor",
    "f-produto": "produto",
    "f-status": "status",
    "f-responsavel": "responsavel"
  };

  function montarParametrosBusca() {
    var parametros = new URLSearchParams();
    Object.keys(MAPA_CAMPOS_FILTRO).forEach(function (idCampo) {
      var elemento = document.getElementById(idCampo);
      if (!elemento) {
        return;
      }
      var valor = elemento.value.trim();
      if (valor) {
        var nomeParametro = MAPA_CAMPOS_FILTRO[idCampo];
        parametros.set(nomeParametro, valor);
      }
    });
    return parametros;
  }

  function preencherSelectFiltro(idSelect, listaOpcoes) {
    var elementoSelect = document.getElementById(idSelect);
    if (!elementoSelect) {
      return;
    }
    (listaOpcoes || []).forEach(function (item) {
      var opcao = document.createElement("option");
      opcao.value = item.valor || item.id;
      opcao.textContent = item.rotulo || item.nome;
      elementoSelect.appendChild(opcao);
    });
  }

  function criarLinhaHistoricoHtml(registro) {
    var htmlFuncionario = "—";
    if (registro.funcionario) {
      htmlFuncionario =
        escapar(registro.funcionario) +
        '<span class="small text-muted d-block">' + escapar(registro.matricula) + "</span>";
    }

    var textoCentroCusto = registro.centro_custo || registro.setor || "—";
    var textoQuantidade = (registro.quantidade != null) ? registro.quantidade : "—";
    var textoCaOuLote = [registro.ca, registro.lote].filter(Boolean).join(" / ") || "—";

    var prefixoSolicitacao = "";
    if (registro.solicitacao) {
      prefixoSolicitacao = '<span class="numero">' + escapar(registro.solicitacao) + "</span> ";
    }

    return (
      "<tr>" +
        '<td class="text-nowrap">' + escapar(registro.data) + "</td>" +
        '<td><span class="selo selo--neutro">' + escapar(registro.tipo_rotulo) + "</span></td>" +
        "<td>" + htmlFuncionario + "</td>" +
        "<td>" + escapar(textoCentroCusto) + "</td>" +
        "<td>" + escapar(registro.produto || "—") + "</td>" +
        "<td>" + escapar(textoQuantidade) + "</td>" +
        "<td>" + escapar(textoCaOuLote) + "</td>" +
        "<td>" + escapar(registro.responsavel || "—") + "</td>" +
        "<td>" + prefixoSolicitacao + escapar(registro.detalhe) + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    var parametros = montarParametrosBusca();
    var queryTexto = parametros.toString();
    var separadorCsv = queryTexto ? "&" : "";

    document.getElementById("btn-csv").href = "/api/historico/?" + queryTexto + separadorCsv + "formato=csv";
    corpoTabela.innerHTML = '<tr><td colspan="9" class="tabela-solicitacoes__vazio">Carregando…</td></tr>';

    SF.api.get("/api/historico/?" + queryTexto)
      .then(function (dados) {
        if (!filtrosJaForamPreenchidos) {
          preencherSelectFiltro("f-tipo", dados.filtros.tipos);
          preencherSelectFiltro("f-cargo", dados.filtros.cargos);
          preencherSelectFiltro("f-setor", dados.filtros.setores);
          preencherSelectFiltro("f-produto", dados.filtros.produtos);
          preencherSelectFiltro("f-status", dados.filtros.status);
          filtrosJaForamPreenchidos = true;
        }

        var linhas = dados.linhas || [];
        var textoMeta = linhas.length + " registro(s)";
        if (linhas.length >= dados.limite) {
          textoMeta += " — mostrando os " + dados.limite + " mais recentes; refine os filtros";
        }
        document.getElementById("meta-historico").textContent = textoMeta;

        if (linhas.length === 0) {
          corpoTabela.innerHTML = '<tr><td colspan="9" class="tabela-solicitacoes__vazio">Nenhum registro com esses filtros.</td></tr>';
          return;
        }
        corpoTabela.innerHTML = linhas.map(criarLinhaHistoricoHtml).join("");
      })
      .catch(function (erro) {
        corpoTabela.innerHTML = '<tr><td colspan="9" class="tabela-solicitacoes__vazio" role="alert">' + escapar(erro.message) + "</td></tr>";
      });
  }

  document.getElementById("form-filtros").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });

  carregar();
})();
