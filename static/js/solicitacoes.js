/* =====================================================================
   SupplyFlow — Lista de Solicitações (/api/solicitacoes/)
   ---------------------------------------------------------------------
   Monta a tabela de solicitações a partir do banco de dados e filtra
   pelas três abas (Excepcionais, Aguardando análise e Todas).
   Inclui navegação por teclado nas abas (Setas, Home e End) seguindo o
   padrão de acessibilidade WAI-ARIA Tabs.
   ===================================================================== */

(function () {
  var escapar = (window.SF && SF.escapar) || function (texto) {
    var div = document.createElement("div");
    div.textContent = texto || "";
    return div.innerHTML;
  };

  var MAPA_STATUS = {
    "aguardando":        { rotulo: "Aguardando aprovação",  selo: "selo--aguardando" },
    "aprovada":          { rotulo: "Aprovada",              selo: "selo--aprovado" },
    "aprovada-condicao": { rotulo: "Aprovada com condição", selo: "selo--condicional" },
    "rejeitada":         { rotulo: "Rejeitada",             selo: "selo--rejeitado" },
    "entregue":          { rotulo: "Entregue",              selo: "selo--entregue" },
    "cancelada":         { rotulo: "Cancelada",             selo: "selo--cancelado" }
  };

  /* Regras de filtragem para cada aba */
  var FILTROS_ABAS = {
    excepcionais: {
      legenda: "Solicitações excepcionais",
      mostra: function (solicitacao) {
        return Boolean(solicitacao.excepcional || solicitacao.fora_da_cota);
      }
    },
    aguardando: {
      legenda: "Solicitações aguardando análise",
      mostra: function (solicitacao) {
        return solicitacao.status === "aguardando";
      }
    },
    todas: {
      legenda: "Todas as solicitações",
      mostra: function () {
        return true;
      }
    }
  };

  var botoesAbas = Array.prototype.slice.call(document.querySelectorAll('.abas [role="tab"]'));
  var painelTabela = document.getElementById("painel-solicitacoes");
  var corpoTabela = document.getElementById("corpo-tabela");
  var legendaTabela = document.getElementById("legenda-tabela");
  var resumoFiltro = document.getElementById("resumo-filtro");
  var abaAtiva = botoesAbas[0];
  var solicitacoes = [];

  /* ---------- Formatação de uma Linha da Tabela ---------- */
  function criarHtmlClassificacaoIa(solicitacao) {
    if (!solicitacao.ia || !solicitacao.ia.categoria) {
      return (
        '<span class="classificacao-ia classificacao-ia--vazia">' +
          '<span aria-hidden="true">—</span>' +
          '<span class="visually-hidden">Não se aplica</span>' +
        "</span>"
      );
    }

    var htmlConfianca;
    if (solicitacao.ia.confianca != null) {
      htmlConfianca = ' <span class="classificacao-ia__confianca">· ' + Math.round(solicitacao.ia.confianca) + "%</span>";
    } else {
      htmlConfianca = ' <span class="classificacao-ia__confianca">· sem confiança</span>';
    }

    return '<span class="classificacao-ia">' + escapar(solicitacao.ia.categoria) + htmlConfianca + "</span>";
  }

  function criarHtmlLinhaSolicitacao(solicitacao) {
    var chaveStatus = solicitacao.status || "aguardando";
    var infoStatus = MAPA_STATUS[chaveStatus] || {
      rotulo: solicitacao.status_rotulo || chaveStatus,
      selo: "selo--aguardando"
    };

    var codigoExibicao = solicitacao.numero || solicitacao.codigo || solicitacao.id;
    var nomeFuncionario = solicitacao.funcionario || (solicitacao.solicitante && solicitacao.solicitante.nome);

    var textoDataHora = solicitacao.data || "";
    if (solicitacao.data && solicitacao.hora) {
      textoDataHora = solicitacao.data + ", " + solicitacao.hora;
    }

    return (
      "<tr>" +
        '<td><span class="numero">' + escapar(codigoExibicao) + "</span></td>" +
        "<td>" + escapar(nomeFuncionario) + "</td>" +
        "<td>" + escapar(solicitacao.funcao || "—") + "</td>" +
        "<td>" + escapar(solicitacao.centroCusto || "—") + "</td>" +
        "<td>" + escapar(solicitacao.produto || "—") + "</td>" +
        '<td class="text-nowrap">' + escapar(textoDataHora) + "</td>" +
        "<td>" + escapar(solicitacao.motivo || "—") + "</td>" +
        "<td>" + criarHtmlClassificacaoIa(solicitacao) + "</td>" +
        '<td class="tabela-solicitacoes__status">' +
          '<span class="selo ' + infoStatus.selo + '">' + escapar(infoStatus.rotulo) + "</span>" +
        "</td>" +
        '<td class="tabela-solicitacoes__acao">' +
          '<a class="link-abrir" href="solicitacao.html?id=' + encodeURIComponent(solicitacao.id) + '"' +
             ' aria-label="Abrir solicitação ' + escapar(codigoExibicao) + '">' +
            'Abrir <i class="bi bi-chevron-right" aria-hidden="true"></i>' +
          "</a>" +
        "</td>" +
      "</tr>"
    );
  }

  /* ---------- Troca de Aba e Atualização de Acessibilidade ---------- */
  function mostrarAba(abaSelecionada) {
    if (!abaSelecionada || !corpoTabela) {
      return;
    }
    abaAtiva = abaSelecionada;

    var configuracaoFiltro = FILTROS_ABAS[abaSelecionada.dataset.filtro] || FILTROS_ABAS.todas;
    var listaFiltrada = solicitacoes.filter(configuracaoFiltro.mostra);

    botoesAbas.forEach(function (botaoAba) {
      var ehAbaAtiva = (botaoAba === abaSelecionada);
      botaoAba.setAttribute("aria-selected", ehAbaAtiva ? "true" : "false");
      botaoAba.tabIndex = ehAbaAtiva ? 0 : -1;
    });

    if (painelTabela) {
      painelTabela.setAttribute("aria-labelledby", abaSelecionada.id);
    }
    if (legendaTabela) {
      legendaTabela.textContent = configuracaoFiltro.legenda;
    }

    if (listaFiltrada.length === 0) {
      corpoTabela.innerHTML = '<tr><td colspan="10" class="tabela-solicitacoes__vazio">Nenhuma solicitação nesta aba.</td></tr>';
    } else {
      corpoTabela.innerHTML = listaFiltrada.map(criarHtmlLinhaSolicitacao).join("");
    }

    if (resumoFiltro) {
      if (listaFiltrada.length === 1) {
        resumoFiltro.textContent = "1 solicitação encontrada.";
      } else {
        resumoFiltro.textContent = listaFiltrada.length + " solicitações encontradas.";
      }
    }
  }

  botoesAbas.forEach(function (botaoAba, indice) {
    botaoAba.addEventListener("click", function () {
      mostrarAba(botaoAba);
    });

    /* Navegação por teclado nas abas: Setas Esquerda/Direita, Home e End */
    botaoAba.addEventListener("keydown", function (evento) {
      var abaDestino = null;
      if (evento.key === "ArrowRight") {
        abaDestino = botoesAbas[(indice + 1) % botoesAbas.length];
      } else if (evento.key === "ArrowLeft") {
        abaDestino = botoesAbas[(indice - 1 + botoesAbas.length) % botoesAbas.length];
      } else if (evento.key === "Home") {
        abaDestino = botoesAbas[0];
      } else if (evento.key === "End") {
        abaDestino = botoesAbas[botoesAbas.length - 1];
      }

      if (!abaDestino) {
        return;
      }

      evento.preventDefault();
      abaDestino.focus();
      mostrarAba(abaDestino);
    });
  });

  if (corpoTabela) {
    corpoTabela.innerHTML = '<tr><td colspan="10" class="tabela-solicitacoes__vazio">Carregando solicitações do sistema...</td></tr>';
  }

  SF.api.get("/api/solicitacoes/")
    .then(function (dados) {
      solicitacoes = dados.solicitacoes || [];
      mostrarAba(abaAtiva || botoesAbas[0]);
    })
    .catch(function (erro) {
      corpoTabela.innerHTML =
        '<tr><td colspan="10" class="tabela-solicitacoes__vazio" role="alert">' +
          escapar("Não foi possível carregar as solicitações: " + erro.message) +
        "</td></tr>";
    });
})();
