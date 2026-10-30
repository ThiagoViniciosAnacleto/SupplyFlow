/* =====================================================================
   SupplyFlow — Ficha de Fornecimento de EPI do Funcionário (RF-43)
   ---------------------------------------------------------------------
   Exibe o histórico individual de entregas de EPI de um colaborador,
   incluindo número do CA, lote, responsável pela entrega e registro de
   devolução, permitindo impressão e exportação em CSV.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var parametrosUrl = new URLSearchParams(window.location.search);
  var idFuncionario = parametrosUrl.get("id") || "";
  var checkboxMostrarTodos = document.getElementById("mostrar-todos");

  function formatarSetorFuncionario(funcionario) {
    if (!funcionario.setor) {
      return "—";
    }
    if (funcionario.centro_custo) {
      return funcionario.setor + " (" + funcionario.centro_custo + ")";
    }
    return funcionario.setor;
  }

  function criarLinhaEntregaFichaHtml(entrega) {
    var htmlDevolucao = "—";
    if (entrega.devolvido_em) {
      htmlDevolucao =
        escapar(entrega.devolvido_em) +
        '<span class="small text-muted d-block">' + escapar(entrega.condicao_devolucao) + "</span>";
    }

    return (
      "<tr>" +
        '<td class="text-nowrap">' + escapar(entrega.data) + "</td>" +
        "<td>" +
          escapar(entrega.produto) +
          '<span class="small text-muted d-block">' + escapar(entrega.solicitacao) + "</span>" +
        "</td>" +
        "<td>" + escapar(entrega.ca || "—") + "</td>" +
        "<td>" + escapar(entrega.lote || "—") + "</td>" +
        "<td>" + escapar(entrega.quantidade) + "</td>" +
        "<td>" + escapar(entrega.motivo) + "</td>" +
        "<td>" + escapar(entrega.almoxarife || "—") + "</td>" +
        "<td>" + htmlDevolucao + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    var incluirConsumiveis = checkboxMostrarTodos.checked;
    var sufixoQuery = incluirConsumiveis ? "&todos=1" : "";
    var queryApi = incluirConsumiveis ? "todos=1" : "";
    var baseEndpoint = "/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/ficha/";

    document.getElementById("btn-csv").href = baseEndpoint + "?formato=csv" + sufixoQuery;

    SF.api.get(baseEndpoint + "?" + queryApi)
      .then(function (dados) {
        var funcionario = dados.funcionario;
        document.title = "Ficha de EPI — " + funcionario.nome + " · SupplyFlow";
        document.getElementById("ficha-emissao").textContent =
          "Registro individual das entregas de EPI (RF-43). Emitida em " + dados.emitida_em + ".";

        var paresDadosFuncionario = [
          ["Nome", funcionario.nome],
          ["Matrícula", funcionario.matricula],
          ["Função", funcionario.cargo || "—"],
          ["Setor", formatarSetorFuncionario(funcionario)],
          ["Situação", funcionario.ativo ? "Ativo" : "Inativo"]
        ];

        document.getElementById("dados-funcionario").innerHTML = paresDadosFuncionario.map(function (par) {
          return "<div><dt>" + escapar(par[0]) + "</dt><dd>" + escapar(par[1]) + "</dd></div>";
        }).join("");

        var listaEntregas = dados.entregas || [];
        var corpoFicha = document.getElementById("corpo-ficha");
        if (listaEntregas.length === 0) {
          corpoFicha.innerHTML = '<tr><td colspan="8" class="tabela-solicitacoes__vazio">Nenhuma entrega registrada.</td></tr>';
          return;
        }
        corpoFicha.innerHTML = listaEntregas.map(criarLinhaEntregaFichaHtml).join("");
      })
      .catch(function (erro) {
        var caixaErro = document.getElementById("erro-ficha");
        if (erro.status === 404) {
          caixaErro.textContent = "Funcionário não encontrado. Volte à lista e abra a ficha por lá.";
        } else {
          caixaErro.textContent = erro.message;
        }
        caixaErro.classList.remove("d-none");
        document.getElementById("corpo-ficha").innerHTML = "";
      });
  }

  checkboxMostrarTodos.addEventListener("change", carregar);
  carregar();
})();
