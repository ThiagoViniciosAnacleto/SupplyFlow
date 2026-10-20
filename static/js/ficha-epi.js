/* =====================================================================
   SupplyFlow — Ficha de fornecimento de EPI do funcionário (RF-43)
   ===================================================================== */

(function () {
  var esc = SF.escapar;
  var id = new URLSearchParams(window.location.search).get("id") || "";
  var todos = document.getElementById("mostrar-todos");

  function carregar() {
    var sufixo = todos.checked ? "&todos=1" : "";
    document.getElementById("btn-csv").href = "/api/funcionarios/" + encodeURIComponent(id) + "/ficha/?formato=csv" + sufixo;
    SF.api.get("/api/funcionarios/" + encodeURIComponent(id) + "/ficha/?" + sufixo.slice(1))
      .then(function (d) {
        var f = d.funcionario;
        document.title = "Ficha de EPI — " + f.nome + " · SupplyFlow";
        document.getElementById("ficha-emissao").textContent = "Registro individual das entregas de EPI (RF-43). Emitida em " + d.emitida_em + ".";
        document.getElementById("dados-funcionario").innerHTML = [
          ["Nome", f.nome], ["Matrícula", f.matricula], ["Função", f.cargo || "—"],
          ["Setor", f.setor ? f.setor + (f.centro_custo ? " (" + f.centro_custo + ")" : "") : "—"],
          ["Situação", f.ativo ? "Ativo" : "Inativo"]
        ].map(function (p) { return "<div><dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd></div>"; }).join("");
        document.getElementById("corpo-ficha").innerHTML = d.entregas.length ? d.entregas.map(function (e) {
          return "<tr>" +
            '<td class="text-nowrap">' + esc(e.data) + "</td>" +
            "<td>" + esc(e.produto) + '<span class="small text-muted d-block">' + esc(e.solicitacao) + "</span></td>" +
            "<td>" + esc(e.ca || "—") + "</td>" +
            "<td>" + esc(e.lote || "—") + "</td>" +
            "<td>" + esc(e.quantidade) + "</td>" +
            "<td>" + esc(e.motivo) + "</td>" +
            "<td>" + esc(e.almoxarife || "—") + "</td>" +
            "<td>" + (e.devolvido_em ? esc(e.devolvido_em) + '<span class="small text-muted d-block">' + esc(e.condicao_devolucao) + "</span>" : "—") + "</td>" +
          "</tr>";
        }).join("") : '<tr><td colspan="8" class="tabela-solicitacoes__vazio">Nenhuma entrega registrada.</td></tr>';
      })
      .catch(function (e) {
        var caixa = document.getElementById("erro-ficha");
        caixa.textContent = e.status === 404 ? "Funcionário não encontrado. Volte à lista e abra a ficha por lá." : e.message;
        caixa.classList.remove("d-none");
        document.getElementById("corpo-ficha").innerHTML = "";
      });
  }

  todos.addEventListener("change", carregar);
  carregar();
})();
