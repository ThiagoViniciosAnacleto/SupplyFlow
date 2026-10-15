/* =====================================================================
   SupplyFlow — Visão Geral integrada à API Django
   Preenche a saudação, os indicadores reais, a lista de solicitações
   pendentes e os gráficos com dados do PostgreSQL via /api/dashboard/
   e /api/solicitacoes/.
   ===================================================================== */

(function () {
  var usuario = SF.sessao.usuarioAtual();

  /* ---------- Saudação ---------- */
  var primeiroNome = (usuario.nome || "Usuário").split(" ")[0];
  var elSaudacao = document.getElementById("saudacao");
  if (elSaudacao) {
    elSaudacao.textContent = "Olá, " + primeiroNome;
  }

  var elDescricao = document.getElementById("descricao-painel");
  if (elDescricao) {
    elDescricao.innerHTML = "";
    elDescricao.append("Painel de ");
    var negrito = document.createElement("strong");
    negrito.textContent = usuario.perfil || "Operador";
    elDescricao.append(negrito, " — indicadores operacionais do fornecimento de EPIs e consumíveis.");
  }

  var graficoEntregasInstancia = null;
  var graficoConsumoInstancia = null;

  function renderizarGraficos(entregasPorMes, consumoPorCentro) {
    if (typeof Chart === "undefined") return;

    var semAnimacao = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
    Chart.defaults.color = "#64748b";
    Chart.defaults.animation = semAnimacao ? false : Chart.defaults.animation;

    var canvasEntregas = document.getElementById("grafico-entregas");
    if (canvasEntregas && entregasPorMes) {
      if (graficoEntregasInstancia) graficoEntregasInstancia.destroy();
      graficoEntregasInstancia = new Chart(canvasEntregas, {
        type: "bar",
        data: {
          labels: entregasPorMes.meses,
          datasets: [{
            label: "Entregas",
            data: entregasPorMes.valores,
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
    }

    var canvasConsumo = document.getElementById("grafico-consumo");
    if (canvasConsumo && consumoPorCentro) {
      if (graficoConsumoInstancia) graficoConsumoInstancia.destroy();
      graficoConsumoInstancia = new Chart(canvasConsumo, {
        type: "doughnut",
        data: {
          labels: consumoPorCentro.centros,
          datasets: [{
            data: consumoPorCentro.valores,
            backgroundColor: ["#2563eb", "#0d9488", "#d97706", "#64748b", "#8b5cf6"],
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
    }
  }

  function renderizarPainel(indicadores, solicitacoes, entregasPorMes, consumoPorCentro) {
    // 1. Identifica solicitações pendentes (considerando decisões na sessão se houver)
    var pendentes = solicitacoes.filter(function (s) {
      return s.status === "aguardando";
    });

    // 2. Indicadores (Cards)
    var elIndicadores = document.getElementById("indicadores");
    if (elIndicadores && indicadores) {
      elIndicadores.innerHTML = indicadores.map(function (ind) {
        var valor = ind.id === "aguardando-aprovacao" ? pendentes.length : ind.valor;
        return '<div class="cartao indicador">' +
          "<div>" +
            '<p class="indicador__rotulo">' + ind.rotulo + "</p>" +
            '<p class="indicador__valor">' + valor + "</p>" +
          "</div>" +
          '<span class="indicador__icone ' + ind.tom + '" aria-hidden="true"><i class="bi ' + ind.icone + '"></i></span>' +
        "</div>";
      }).join("");
    }

    // 3. Solicitações aguardando análise
    var elLista = document.getElementById("lista-solicitacoes");
    if (elLista) {
      if (pendentes.length === 0) {
        elLista.innerHTML = "<li>Nenhuma solicitação aguardando análise.</li>";
      } else {
        elLista.innerHTML = pendentes.map(function (s) {
          return "<li>" +
            '<span><span class="numero">' + (s.numero || s.codigo) + "</span> · " +
            (s.funcionario || (s.solicitante && s.solicitante.nome)) + " · " + s.produto + "</span>" +
            '<span class="status"><span class="selo selo--aguardando">Aguardando aprovação</span></span>' +
          "</li>";
        }).join("");
      }
    }

    // 4. Gráficos
    renderizarGraficos(entregasPorMes, consumoPorCentro);
  }

  // Requisições paralelas para carregar dados consolidados da API
  Promise.all([
    fetch("/api/dashboard/").then(function (r) { return r.ok ? r.json() : null; }),
    fetch("/api/solicitacoes/").then(function (r) { return r.ok ? r.json() : null; })
  ])
  .then(function (respostas) {
    var dadosDash = respostas[0] || {};
    var dadosSols = respostas[1] || {};

    var listaSolicitacoes = dadosSols.solicitacoes || (window.SF && SF.solicitacoes) || [];
    var listaIndicadores = dadosDash.indicadores || (window.SF && SF.indicadores) || [];
    var entregas = dadosDash.entregasPorMes || (window.SF && SF.entregasPorMes);
    var consumo = dadosDash.consumoPorCentro || (window.SF && SF.consumoPorCentro);

    // Atualiza cache global do SupplyFlow
    window.SF = window.SF || {};
    SF.solicitacoes = listaSolicitacoes;
    SF.indicadores = listaIndicadores;
    SF.entregasPorMes = entregas;
    SF.consumoPorCentro = consumo;

    renderizarPainel(listaIndicadores, listaSolicitacoes, entregas, consumo);
  })
  .catch(function (erro) {
    console.warn("Aviso ao carregar dados da Visão Geral via API:", erro);
    if (window.SF && SF.indicadores && SF.solicitacoes) {
      renderizarPainel(SF.indicadores, SF.solicitacoes, SF.entregasPorMes, SF.consumoPorCentro);
    }
  });
})();
