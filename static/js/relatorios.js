/* =====================================================================
   SupplyFlow — Relatórios de gestão (RF-48, RF-49)
   ===================================================================== */

(function () {
  var esc = SF.escapar;

  function reais(v) {
    return v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(v) { return v == null ? "—" : String(v).replace(".", ",") + "%"; }
  function vazio(colunas, texto) {
    return '<tr><td colspan="' + colunas + '" class="tabela-solicitacoes__vazio">' + esc(texto) + "</td></tr>";
  }
  function lista(itens, rotulo, valor) {
    return itens.length ? itens.map(function (i) {
      return "<li><span>" + esc(i[rotulo]) + '</span><span class="status"><strong>' + esc(i[valor]) + "</strong></span></li>";
    }).join("") : "<li>Nada no período.</li>";
  }

  function periodo() {
    var p = new URLSearchParams();
    var de = document.getElementById("p-de").value, ate = document.getElementById("p-ate").value;
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    return p;
  }

  function carregar() {
    var p = periodo();
    document.querySelectorAll("[data-secao]").forEach(function (a) {
      var q = new URLSearchParams(p);
      q.set("formato", "csv");
      q.set("secao", a.dataset.secao);
      a.href = "/api/relatorios/?" + q.toString();
    });
    document.getElementById("erro-relatorio").classList.add("d-none");

    SF.api.get("/api/relatorios/?" + p.toString()).then(function (d) {
      var r = d.resumo;
      document.getElementById("descricao-periodo").textContent =
        "Período: " + (d.periodo.de || "início") + " a " + d.periodo.ate + ". Calculado das entregas e decisões registradas.";
      document.getElementById("kpis-relatorio").innerHTML = [
        ["Itens entregues", r.itens_entregues, "R$ " + reais(r.valor_entregue) + " em " + r.entregas + " entrega(s)", "tom-azul"],
        ["Solicitações", r.solicitacoes, pct(r.percentual_excecoes) + " foram exceções", "tom-ambar"],
        ["Taxa de aprovação", pct(r.taxa_aprovacao), r.decisoes + " decisão(ões)", "tom-verde"],
        ["Tempo médio até a decisão", r.tempo_medio_decisao_horas == null ? "—" : String(r.tempo_medio_decisao_horas).replace(".", ",") + " h",
         "Concordância com a IA: " + pct(r.concordancia_ia), "tom-indigo"]
      ].map(function (k) {
        return '<div class="cartao indicador"><div><p class="indicador__rotulo">' + esc(k[0]) + '</p><p class="indicador__valor">' +
          esc(k[1]) + '</p><p class="indicador__nota">' + esc(k[2]) + '</p></div><span class="indicador__icone ' + k[3] +
          '" aria-hidden="true"><i class="bi bi-bar-chart"></i></span></div>';
      }).join("");

      document.getElementById("corpo-centros").innerHTML = d.consumo_por_centro.length ? d.consumo_por_centro.map(function (c) {
        return "<tr><td>" + esc(c.centro) + '</td><td class="text-end">' + esc(c.quantidade) + '</td><td class="text-end">' + reais(c.valor) + "</td></tr>";
      }).join("") : vazio(3, "Nenhuma entrega no período.");
      document.getElementById("corpo-produtos").innerHTML = d.consumo_por_produto.length ? d.consumo_por_produto.map(function (c) {
        return "<tr><td>" + esc(c.produto) + "</td><td>" + (c.epi ? "EPI" : "Consumível") + '</td><td class="text-end">' +
          esc(c.quantidade) + '</td><td class="text-end">' + reais(c.valor) + "</td></tr>";
      }).join("") : vazio(4, "Nenhuma entrega no período.");
      document.getElementById("lista-status").innerHTML = lista(d.solicitacoes_por_status, "status", "total");
      document.getElementById("lista-excecoes").innerHTML = lista(d.excecoes_por_motivo, "motivo", "total");
      document.getElementById("corpo-justificativas").innerHTML = d.justificativas_por_categoria.map(function (c) {
        return "<tr><td>" + esc(c.categoria) + '</td><td class="text-end">' + esc(c.sugeridas_ia) + '</td><td class="text-end">' +
          esc(c.confirmadas) + "</td></tr>";
      }).join("");
    }).catch(function (e) {
      var caixa = document.getElementById("erro-relatorio");
      caixa.textContent = e.message;
      caixa.classList.remove("d-none");
    });
  }

  document.getElementById("form-periodo").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });
  carregar();
})();
