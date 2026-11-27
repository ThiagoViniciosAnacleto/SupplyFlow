/* =====================================================================
   SupplyFlow — Visão Geral: painel de prontidão (/api/painel/)
   ---------------------------------------------------------------------
   Em vez de contagens soltas, responde "a equipe está protegida para
   trabalhar hoje?": situação de cada colaborador (troca de EPI e NRs),
   o que está parado esperando alguém, NRs que vencem, em quantos dias
   cada EPI acaba e a atividade do totem hoje. Tudo vem do servidor.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  var CORES_SITUACAO = {
    troca_vencida: "painel--perigo",
    nr_vencida: "painel--perigo",
    troca_vencendo: "painel--alerta",
    nr_vencendo: "painel--nr",
    em_dia: "painel--ok"
  };

  var ICONES_ACAO = {
    aprovar: "bi-hourglass-split",
    entregar: "bi-box-seam",
    risco: "bi-exclamation-triangle"
  };

  /* ---------- Saudação ---------- */
  function saudar(usuario) {
    if (!usuario) {
      return;
    }
    var hora = new Date().getHours();
    var periodo = hora < 12 ? "Bom dia" : (hora < 18 ? "Boa tarde" : "Boa noite");
    var primeiroNome = (usuario.nome || "").split(" ")[0];
    document.getElementById("saudacao").textContent = periodo + (primeiroNome ? ", " + primeiroNome : "");
  }

  saudar(SF.sessao.usuarioAtual());
  SF.sessao.confirmar().then(saudar).catch(function () {});

  /* ---------- 1. Prontidão ---------- */
  function desenharProntidao(dados) {
    var numero = document.getElementById("prontidao-numero");
    var texto = document.getElementById("prontidao-texto");

    if (!dados.total) {
      numero.textContent = "—";
      texto.textContent = "Ninguém com EPI entregue ou NR cadastrada ainda.";
      return;
    }

    numero.textContent = dados.percentual + "%";
    var precisam = dados.total - dados.em_dia;
    texto.textContent = dados.em_dia + " de " + dados.total + " pessoas sem troca de EPI ou NR pendente" +
      (precisam === 1 ? " · 1 precisa de atenção" : (precisam ? " · " + precisam + " precisam de atenção" : ""));

    var faixasVisiveis = dados.faixas.filter(function (faixa) { return faixa.quantidade > 0; });
    document.getElementById("prontidao-faixas").innerHTML = faixasVisiveis.map(function (faixa) {
      return '<span class="painel-faixas__parte ' + CORES_SITUACAO[faixa.codigo] + '" style="flex:' +
        faixa.quantidade + '" title="' + escapar(faixa.rotulo + ": " + faixa.quantidade) + '"></span>';
    }).join("");

    // A barra mostra a situação mais grave de cada pessoa (soma 100%); a legenda conta
    // quantas pessoas têm cada pendência — quem tem NR vencida E outra vencendo entra nas duas.
    document.getElementById("prontidao-legenda").innerHTML = dados.faixas.map(function (faixa) {
      var pessoas = (faixa.pessoas != null) ? faixa.pessoas : faixa.quantidade;
      return '<li class="' + (pessoas ? "" : "painel-legenda__zero") + '">' +
        '<span class="painel-legenda__cor ' + CORES_SITUACAO[faixa.codigo] + '"></span>' +
        '<strong>' + escapar(pessoas) + "</strong> " + escapar(faixa.rotulo) + "</li>";
    }).join("");
  }

  /* ---------- 2. Precisa de você agora ---------- */
  function desenharAcoes(acoes) {
    var lista = document.getElementById("lista-acoes");
    if (!acoes.length) {
      lista.innerHTML = '<li class="painel__vazio"><i class="bi bi-check2-circle" aria-hidden="true"></i> ' +
        "Nada parado esperando por você.</li>";
      return;
    }
    lista.innerHTML = acoes.map(function (item) {
      return '<li class="painel-acoes__item painel-acoes__item--' + escapar(item.tipo) + '">' +
        '<i class="bi ' + (ICONES_ACAO[item.tipo] || "bi-dot") + '" aria-hidden="true"></i>' +
        '<div class="painel-acoes__texto"><span>' + escapar(item.titulo) + "</span>" +
        '<small>' + escapar(item.detalhe) + "</small></div>" +
        '<a class="btn btn-sm painel-acoes__botao" href="' + escapar(item.link) + '">' + escapar(item.acao) + "</a>" +
        "</li>";
    }).join("");
  }

  /* ---------- 3. Radar de NRs ---------- */
  function desenharRadar(radar) {
    var area = document.getElementById("radar-nrs");
    var lista = document.getElementById("radar-lista");
    var horizonte = radar.horizonte_dias;

    if (!radar.pontos.length) {
      area.innerHTML = '<div class="painel-radar__linha"></div>';
      lista.innerHTML = '<li class="painel__vazio">Nenhuma NR vence nos próximos ' + horizonte + " dias.</li>";
      return;
    }

    var marcas = radar.pontos.map(function (ponto) {
      var posicao = Math.max(0, Math.min(ponto.dias, horizonte)) / horizonte * 100;
      var classe = ponto.dias < 0 ? "painel--perigo" : (ponto.dias <= 30 ? "painel--alerta" : "painel--nr");
      return '<span class="painel-radar__ponto ' + classe + '" style="left:' + posicao.toFixed(1) + '%"' +
        ' title="' + escapar(ponto.nr + " · " + ponto.pessoa + " · " + ponto.validade) + '"></span>';
    }).join("");

    area.innerHTML = '<div class="painel-radar__linha"></div>' + marcas +
      '<span class="painel-radar__eixo" style="left:0">hoje</span>' +
      '<span class="painel-radar__eixo" style="left:50%">' + (horizonte / 2) + "d</span>" +
      '<span class="painel-radar__eixo painel-radar__eixo--fim">' + horizonte + "d</span>";

    lista.innerHTML = radar.pontos.slice(0, 4).map(function (ponto) {
      var quando = ponto.dias < 0 ? "vencida há " + (-ponto.dias) + " dia(s)" :
        (ponto.dias === 0 ? "vence hoje" : "vence em " + ponto.dias + " dia(s)");
      return "<li><strong>" + escapar(ponto.nr) + "</strong> · " + escapar(ponto.pessoa) +
        ' <span class="' + (ponto.dias < 0 ? "texto-perigo" : "") + '">' + escapar(quando) + "</span></li>";
    }).join("");
  }

  /* ---------- 4. Cobertura do estoque ---------- */
  function desenharCobertura(cobertura) {
    var prazo = cobertura.prazo_reposicao_dias;
    var escala = prazo * 4; // a barra cheia representa 4x o prazo de reposição
    var marcador = (prazo / escala * 100).toFixed(1);

    document.getElementById("cobertura-nota").textContent =
      "No ritmo dos últimos " + cobertura.janela_dias + " dias · a linha marca o prazo de reposição (" + prazo + " dias).";

    var lista = document.getElementById("lista-cobertura");
    if (!cobertura.itens.length) {
      lista.innerHTML = '<p class="painel__vazio">Nenhum produto com estoque no totem.</p>';
      return;
    }
    lista.innerHTML = cobertura.itens.map(function (item) {
      var semConsumo = item.dias === null;
      var largura = semConsumo ? 100 : Math.min(item.dias, escala) / escala * 100;
      var classe = semConsumo ? "painel--neutro" :
        (item.dias < prazo ? "painel--perigo" : (item.dias < prazo * 2 ? "painel--alerta" : "painel--ok"));
      var rotulo = semConsumo ? "sem uso" : item.dias + " d";
      return '<span class="painel-cobertura__nome" title="' + escapar(item.saldo_livre + " un. livres") + '">' +
          escapar(item.produto) + "</span>" +
        '<span class="painel-cobertura__barra">' +
          '<span class="painel-cobertura__preenchido ' + classe + '" style="width:' + largura.toFixed(1) + '%"></span>' +
          '<span class="painel-cobertura__prazo" style="left:' + marcador + '%"></span>' +
        "</span>" +
        '<span class="painel-cobertura__dias ' + (classe === "painel--perigo" ? "texto-perigo" : "") + '">' +
          escapar(rotulo) + "</span>";
    }).join("");
  }

  /* ---------- 5. Pulso do totem ---------- */
  function desenharPulso(pulso) {
    var maior = 1;
    for (var h = 6; h < 24; h++) {
      maior = Math.max(maior, pulso.pedidos[h] + pulso.entregas[h]);
    }
    var html = "";
    for (var hora = 6; hora < 24; hora++) {
      var pedidos = pulso.pedidos[hora];
      var entregas = pulso.entregas[hora];
      var futuro = hora > pulso.hora_atual;
      html += '<span class="painel-pulso__hora' + (futuro ? " painel-pulso__hora--futuro" : "") +
        (hora === pulso.hora_atual ? " painel-pulso__hora--agora" : "") + '"' +
        ' title="' + hora + 'h: ' + pedidos + " pedido(s), " + entregas + ' entrega(s)">' +
        '<span class="painel-pulso__entrega" style="height:' + (entregas / maior * 100).toFixed(0) + '%"></span>' +
        '<span class="painel-pulso__pedido" style="height:' + (pedidos / maior * 100).toFixed(0) + '%"></span>' +
        "</span>";
    }
    document.getElementById("pulso-barras").innerHTML = html;
  }

  /* ---------- Carga ---------- */
  SF.api.get("/api/painel/")
    .then(function (dados) {
      document.getElementById("painel-atualizado").textContent = dados.data + " · atualizado às " + dados.atualizado_em;
      desenharProntidao(dados.prontidao);
      desenharAcoes(dados.acoes);
      desenharRadar(dados.radar_nrs);
      desenharCobertura(dados.cobertura);
      desenharPulso(dados.pulso);
    })
    .catch(function (erro) {
      var aviso = document.getElementById("aviso-painel");
      aviso.className = "alert alert-danger";
      aviso.textContent = "Não foi possível carregar o painel: " + erro.message;
    });
})();
