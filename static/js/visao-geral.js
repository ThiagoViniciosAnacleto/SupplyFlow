/* =====================================================================
   SupplyFlow — Visão Geral (/api/dashboard/ e /api/solicitacoes/)
   ---------------------------------------------------------------------
   Exibe os indicadores operacionais, a lista das solicitações que
   aguardam análise e os gráficos de entregas por mês e consumo por
   centro de custo (RF-48). Se a API falhar, mostra o erro na tela.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  /* ---------- Saudação Personalizada ---------- */
  function saudarUsuario(usuario) {
    if (!usuario) {
      return;
    }
    var primeiroNome = (usuario.nome || "").split(" ")[0];
    document.getElementById("saudacao").textContent = "Olá, " + primeiroNome;

    var elementoDescricao = document.getElementById("descricao-painel");
    elementoDescricao.innerHTML = "";

    var elementoPerfil = document.createElement("strong");
    elementoPerfil.textContent = usuario.perfil || "";
    elementoDescricao.append(
      "Painel de ",
      elementoPerfil,
      " — indicadores operacionais do fornecimento de EPIs e consumíveis."
    );
  }

  saudarUsuario(SF.sessao.usuarioAtual());

  /* ---------- Gráficos (Chart.js) ---------- */
  function mostrarMensagemGraficoVazio(elementoCanvas, mensagem) {
    var containerGrafico = elementoCanvas.parentElement;
    containerGrafico.innerHTML = '<p class="grafico__vazio">' + escapar(mensagem) + "</p>";
  }

  function desenharGraficos(entregasPorMes, consumoPorCentro) {
    if (typeof Chart === "undefined") {
      return;
    }

    Chart.defaults.font.family = '"Inter", system-ui, sans-serif';
    Chart.defaults.color = "#64748b";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      Chart.defaults.animation = false;
    }

    /* Gráfico 1: Barras de entregas confirmadas nos últimos 6 meses */
    var canvasEntregas = document.getElementById("grafico-entregas");
    var totalEntregas = entregasPorMes.valores.reduce(function (acumulado, valorMes) {
      return acumulado + valorMes;
    }, 0);

    if (totalEntregas === 0) {
      mostrarMensagemGraficoVazio(canvasEntregas, "Nenhuma entrega confirmada nos últimos 6 meses.");
    } else {
      new Chart(canvasEntregas, {
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

    /* Gráfico 2: Rosca de consumo financeiro por centro de custo */
    var canvasConsumo = document.getElementById("grafico-consumo");
    if (!consumoPorCentro.centros || consumoPorCentro.centros.length === 0) {
      mostrarMensagemGraficoVazio(canvasConsumo, "Sem consumo registrado nos " + consumoPorCentro.periodo + ".");
    } else {
      new Chart(canvasConsumo, {
        type: "doughnut",
        data: {
          labels: consumoPorCentro.centros,
          datasets: [{
            data: consumoPorCentro.valores,
            borderWidth: 2,
            borderColor: "#ffffff",
            backgroundColor: ["#2563eb", "#0d9488", "#d97706", "#64748b", "#8b5cf6"]
          }]
        },
        options: {
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { boxWidth: 10, boxHeight: 10, padding: 14 }
            },
            tooltip: {
              callbacks: {
                label: function (contexto) {
                  var valorFormatado = contexto.parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
                  return contexto.label + ": R$ " + valorFormatado;
                }
              }
            }
          }
        }
      });
    }
  }

  /* ---------- Montagem dos Cartões e Pendências ---------- */
  function criarCardIndicadorHtml(indicador) {
    return (
      '<div class="cartao indicador">' +
        "<div>" +
          '<p class="indicador__rotulo">' + escapar(indicador.rotulo) + "</p>" +
          '<p class="indicador__valor">' + escapar(indicador.valor) + "</p>" +
        "</div>" +
        '<span class="indicador__icone ' + indicador.tom + '" aria-hidden="true">' +
          '<i class="bi ' + indicador.icone + '"></i>' +
        "</span>" +
      "</div>"
    );
  }

  function criarItemPendenciaHtml(solicitacao) {
    return (
      "<li>" +
        '<a class="lista-solicitacoes__link" href="solicitacao.html?id=' + encodeURIComponent(solicitacao.id) + '">' +
          '<span class="numero">' + escapar(solicitacao.codigo) + "</span> · " +
          escapar(solicitacao.funcionario) + " · " +
          escapar(solicitacao.produto) +
        "</a>" +
        '<span class="status">' +
          '<span class="selo selo--aguardando">' + escapar(solicitacao.status_rotulo) + "</span>" +
        "</span>" +
      "</li>"
    );
  }

  function renderizarPainel(dadosDashboard, listaSolicitacoes) {
    document.getElementById("indicadores").innerHTML =
      dadosDashboard.indicadores.map(criarCardIndicadorHtml).join("");

    var solicitacoesPendentes = listaSolicitacoes.filter(function (solicitacao) {
      return solicitacao.status === "aguardando";
    });

    var elementoLista = document.getElementById("lista-solicitacoes");
    if (solicitacoesPendentes.length === 0) {
      elementoLista.innerHTML = "<li>Nenhuma solicitação aguardando análise.</li>";
    } else {
      var primeirasOito = solicitacoesPendentes.slice(0, 8);
      elementoLista.innerHTML = primeirasOito.map(criarItemPendenciaHtml).join("");
    }

    desenharGraficos(dadosDashboard.entregasPorMes, dadosDashboard.consumoPorCentro);
  }

  Promise.all([SF.api.get("/api/dashboard/"), SF.api.get("/api/solicitacoes/")])
    .then(function (respostas) {
      var dadosDashboard = respostas[0];
      var dadosSolicitacoes = respostas[1];
      renderizarPainel(dadosDashboard, dadosSolicitacoes.solicitacoes || []);
    })
    .catch(function (erro) {
      document.getElementById("indicadores").innerHTML =
        '<div class="alert alert-danger" role="alert">' +
          "Não foi possível carregar o painel: " + escapar(erro.message) +
        "</div>";
    });

  /* Caso a sessão ainda não estivesse em cache ao abrir a página, atualiza a saudação após confirmar */
  if (!SF.sessao.usuarioAtual()) {
    SF.sessao.confirmar().then(saudarUsuario).catch(function () {});
  }
})();
