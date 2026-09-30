/* =====================================================================
   SupplyFlow — Visão Geral
   Preenche a saudação, os indicadores, a lista de solicitações
   pendentes e os dois gráficos a partir de dados-demo.js.
   ===================================================================== */

(function () {
  var usuario = SF.sessao.usuarioAtual();

  /* ---------- Saudação ---------- */
  var primeiroNome = usuario.nome.split(" ")[0];
  document.getElementById("saudacao").textContent = "Olá, " + primeiroNome;

  var descricao = document.getElementById("descricao-painel");
  descricao.innerHTML = "";
  descricao.append("Painel de ");
  var negrito = document.createElement("strong");
  negrito.textContent = usuario.perfil;
  descricao.append(negrito, " — indicadores operacionais do fornecimento de EPIs e consumíveis.");

  /* ---------- Solicitações pendentes (já com as decisões da sessão) ---------- */
  var pendentes = SF.solicitacoes.filter(function (s) {
    return SF.sessao.statusDe(s) === "aguardando";
  });

  /* ---------- Indicadores ---------- */
  document.getElementById("indicadores").innerHTML = SF.indicadores.map(function (ind) {
    var valor = ind.id === "aguardando-aprovacao" ? pendentes.length : ind.valor;
    return '<div class="cartao indicador">' +
      "<div>" +
        '<p class="indicador__rotulo">' + ind.rotulo + "</p>" +
        '<p class="indicador__valor">' + valor + "</p>" +
      "</div>" +
      '<span class="indicador__icone ' + ind.tom + '" aria-hidden="true"><i class="bi ' + ind.icone + '"></i></span>' +
    "</div>";
  }).join("");

  /* ---------- Solicitações aguardando análise ---------- */
  var lista = document.getElementById("lista-solicitacoes");

  if (pendentes.length === 0) {
    lista.innerHTML = "<li>Nenhuma solicitação aguardando análise.</li>";
  } else {
    lista.innerHTML = pendentes.map(function (s) {
      return "<li>" +
        '<span><span class="numero">' + s.numero + "</span> · " + s.funcionario + " · " + s.produto + "</span>" +
        '<span class="status"><span class="selo selo--aguardando">Aguardando aprovação</span></span>' +
      "</li>";
    }).join("");
  }

  /* ---------- Gráficos (Chart.js) ---------- */
  if (typeof Chart === "undefined") return; // se a biblioteca não carregar, o resto da página continua

  var semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
  Chart.defaults.color = "#64748b";
  Chart.defaults.animation = semAnimacao ? false : Chart.defaults.animation;

  new Chart(document.getElementById("grafico-entregas"), {
    type: "bar",
    data: {
      labels: SF.entregasPorMes.meses,
      datasets: [{
        label: "Entregas",
        data: SF.entregasPorMes.valores,
        backgroundColor: "#2563eb",
        borderRadius: 6,
        maxBarThickness: 44
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { precision: 0 } }
      }
    }
  });

  new Chart(document.getElementById("grafico-consumo"), {
    type: "doughnut",
    data: {
      labels: SF.consumoPorCentro.centros,
      datasets: [{
        data: SF.consumoPorCentro.valores,
        backgroundColor: ["#2563eb", "#0d9488", "#d97706", "#94a3b8"],
        borderWidth: 2,
        borderColor: "#ffffff"
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 14 } }
      }
    }
  });
})();
