/* =====================================================================
   SupplyFlow — Visão Geral
   Indicadores, pendências e gráficos calculados pelo servidor a partir
   das solicitações, entregas e estoque (RF-48). Sem dados de exemplo:
   se a API falhar, a tela mostra o erro.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  /* ---------- Saudação ---------- */
  function saudar(usuario) {
    if (!usuario) return;
    document.getElementById("saudacao").textContent = "Olá, " + (usuario.nome || "").split(" ")[0];
    var descricao = document.getElementById("descricao-painel");
    descricao.innerHTML = "";
    var negrito = document.createElement("strong");
    negrito.textContent = usuario.perfil || "";
    descricao.append("Painel de ", negrito, " — indicadores operacionais do fornecimento de EPIs e consumíveis.");
  }
  saudar(SF.sessao.usuarioAtual());

  /* ---------- Gráficos ---------- */
  function semDados(canvas, texto) {
    var caixa = canvas.parentElement;
    caixa.innerHTML = '<p class="grafico__vazio">' + escapar(texto) + "</p>";
  }

  function graficos(entregasPorMes, consumo) {
    if (typeof Chart === "undefined") return;
    Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
    Chart.defaults.color = "#64748b";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) Chart.defaults.animation = false;

    var canvasEntregas = document.getElementById("grafico-entregas");
    var total = entregasPorMes.valores.reduce(function (a, b) { return a + b; }, 0);
    if (!total) {
      semDados(canvasEntregas, "Nenhuma entrega confirmada nos últimos 6 meses.");
    } else {
      new Chart(canvasEntregas, {
        type: "bar",
        data: { labels: entregasPorMes.meses,
                datasets: [{ label: "Entregas", data: entregasPorMes.valores, backgroundColor: "#2563eb",
                             borderRadius: 6, maxBarThickness: 44 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
                   scales: { x: { grid: { display: false } },
                             y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0 } } } }
      });
    }

    var canvasConsumo = document.getElementById("grafico-consumo");
    if (!consumo.centros.length) {
      semDados(canvasConsumo, "Sem consumo registrado nos " + consumo.periodo + ".");
    } else {
      new Chart(canvasConsumo, {
        type: "doughnut",
        data: { labels: consumo.centros,
                datasets: [{ data: consumo.valores, borderWidth: 2, borderColor: "#ffffff",
                             backgroundColor: ["#2563eb", "#0d9488", "#d97706", "#64748b", "#8b5cf6"] }] },
        options: {
          maintainAspectRatio: false, cutout: "62%",
          plugins: {
            legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 14 } },
            tooltip: { callbacks: { label: function (ctx) {
              return ctx.label + ": R$ " + ctx.parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
            } } }
          }
        }
      });
    }
  }

  /* ---------- Painel ---------- */
  function painel(dash, solicitacoes) {
    document.getElementById("indicadores").innerHTML = dash.indicadores.map(function (ind) {
      return '<div class="cartao indicador"><div>' +
          '<p class="indicador__rotulo">' + escapar(ind.rotulo) + "</p>" +
          '<p class="indicador__valor">' + escapar(ind.valor) + "</p>" +
        "</div>" +
        '<span class="indicador__icone ' + ind.tom + '" aria-hidden="true"><i class="bi ' + ind.icone + '"></i></span>' +
      "</div>";
    }).join("");

    var pendentes = solicitacoes.filter(function (s) { return s.status === "aguardando"; });
    document.getElementById("lista-solicitacoes").innerHTML = pendentes.length
      ? pendentes.slice(0, 8).map(function (s) {
          return "<li>" +
            '<a class="lista-solicitacoes__link" href="solicitacao.html?id=' + encodeURIComponent(s.id) + '">' +
              '<span class="numero">' + escapar(s.codigo) + "</span> · " + escapar(s.funcionario) + " · " + escapar(s.produto) +
            "</a>" +
            '<span class="status"><span class="selo selo--aguardando">' + escapar(s.status_rotulo) + "</span></span>" +
          "</li>";
        }).join("")
      : "<li>Nenhuma solicitação aguardando análise.</li>";

    graficos(dash.entregasPorMes, dash.consumoPorCentro);
  }

  Promise.all([SF.api.get("/api/dashboard/"), SF.api.get("/api/solicitacoes/")])
    .then(function (r) { painel(r[0], r[1].solicitacoes || []); })
    .catch(function (erro) {
      document.getElementById("indicadores").innerHTML =
        '<div class="alert alert-danger" role="alert">Não foi possível carregar o painel: ' + escapar(erro.message) + "</div>";
    });

  // Se a cópia local do usuário ainda não existia, atualiza a saudação quando a sessão for confirmada
  if (!SF.sessao.usuarioAtual()) {
    SF.sessao.confirmar().then(saudar).catch(function () {});
  }
})();
