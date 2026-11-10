/* =====================================================================
   SupplyFlow — Ficha de Fornecimento de EPI, Histórico Funcional e
   Termo de Nada Consta do Funcionário (RF-43)
   ---------------------------------------------------------------------
   Exibe o histórico individual de entregas de EPI de um colaborador,
   Cargo (RH), Função (SST), Habilitações/NRs com validade, grade de
   tamanhos (Calçado, Luva, Vestimenta), histórico funcional e
   declaração formal de Nada Consta de EPI para desligamento/auditoria.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var parametrosUrl = new URLSearchParams(window.location.search);
  var idFuncionario = parametrosUrl.get("id") || "";
  var exibirNadaConstaInicial = parametrosUrl.get("nada_consta") === "1";
  var checkboxMostrarTodos = document.getElementById("mostrar-todos");
  var btnNadaConsta = document.getElementById("btn-nada-consta");
  var secaoNadaConsta = document.getElementById("secao-nada-consta");
  var corpoNadaConsta = document.getElementById("corpo-nada-consta");

  function formatarSetorFuncionario(funcionario) {
    if (!funcionario.setor) {
      return "—";
    }
    if (funcionario.centro_custo) {
      return funcionario.setor + " (" + funcionario.centro_custo + ")";
    }
    return funcionario.setor;
  }

  function obterTamanhosFuncionario(funcionario) {
    var tam = (funcionario && funcionario.tamanhos) || {};
    return {
      calcado: tam.calcado || (funcionario && funcionario.tamanho_calcado) || "",
      luva: tam.luva || (funcionario && funcionario.tamanho_luva) || "",
      vestimenta: tam.vestimenta || (funcionario && funcionario.tamanho_vestimenta) || ""
    };
  }

  function formatarHabilitacoesFichaHtml(funcionario) {
    var habs = (funcionario && funcionario.habilitacoes) || [];
    if (!Array.isArray(habs) || habs.length === 0) {
      return "—";
    }
    return habs.map(function (h) {
      var nome = typeof h === "string" ? h : (h.nome || h.habilitacao || "");
      var validade = (typeof h === "object" && h) ? (h.validade || "") : "";
      var vencida = Boolean(typeof h === "object" && h && h.vencida);
      if (!nome) {
        return "";
      }
      if (vencida) {
        return (
          '<span class="badge bg-danger-subtle text-danger border border-danger-subtle me-1">' +
            '<i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>' +
            escapar(nome) + (validade ? " (val. " + escapar(validade) + " — VENCIDA)" : " (VENCIDA)") +
          "</span>"
        );
      }
      return (
        '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle me-1">' +
          '<i class="bi bi-shield-check me-1" aria-hidden="true"></i>' +
          escapar(nome) + (validade ? " (val. " + escapar(validade) + ")" : "") +
        "</span>"
      );
    }).join(" ");
  }

  function criarLinhaHistoricoFuncionalHtml(item) {
    var dataTxt = item.data || item.criado_em || item.registrado_em || "—";
    var eventoTxt = item.evento || item.tipo_rotulo || item.tipo || item.acao || "Movimentação funcional";

    var cargoAnterior = item.cargo_anterior || item.de_cargo || "";
    var cargoNovo = item.cargo_novo || item.para_cargo || item.cargo || "";
    var htmlCargo = escapar(cargoNovo || cargoAnterior || "—");
    if (cargoAnterior && cargoNovo && cargoAnterior !== cargoNovo) {
      htmlCargo =
        '<span class="text-muted text-decoration-line-through me-1">' + escapar(cargoAnterior) + "</span>" +
        '<i class="bi bi-arrow-right mx-1 text-secondary" aria-hidden="true"></i>' +
        "<strong>" + escapar(cargoNovo) + "</strong>";
    }

    var funcaoAnterior = item.funcao_anterior || "";
    var funcaoNovo = item.funcao_novo || item.funcao || "";
    if (funcaoAnterior || funcaoNovo) {
      var htmlFuncao = escapar(funcaoNovo || funcaoAnterior);
      if (funcaoAnterior && funcaoNovo && funcaoAnterior !== funcaoNovo) {
        htmlFuncao =
          '<span class="text-muted text-decoration-line-through me-1">' + escapar(funcaoAnterior) + "</span>" +
          '<i class="bi bi-arrow-right mx-1 text-secondary" aria-hidden="true"></i>' +
          "<strong>" + escapar(funcaoNovo) + "</strong>";
      }
      htmlCargo += '<div class="small text-secondary mt-1">Função (SST): ' + htmlFuncao + "</div>";
    }

    var setorAnterior = item.setor_anterior || item.de_setor || "";
    var setorNovo = item.setor_novo || item.para_setor || item.setor || "";
    var htmlSetor = escapar(setorNovo || setorAnterior || "—");
    if (setorAnterior && setorNovo && setorAnterior !== setorNovo) {
      htmlSetor =
        '<span class="text-muted text-decoration-line-through me-1">' + escapar(setorAnterior) + "</span>" +
        '<i class="bi bi-arrow-right mx-1 text-secondary" aria-hidden="true"></i>' +
        "<strong>" + escapar(setorNovo) + "</strong>";
    }

    var obs = item.observacao || item.motivo || item.descricao || "";
    var resp = item.responsavel || item.registrado_por || item.usuario || "";
    var htmlObs = obs ? escapar(obs) : "—";
    if (resp) {
      htmlObs += '<span class="small text-muted d-block">Por: ' + escapar(resp) + "</span>";
    }

    return (
      "<tr>" +
        '<td class="text-nowrap">' + escapar(dataTxt) + "</td>" +
        '<td><span class="badge bg-light text-dark border">' + escapar(eventoTxt) + "</span></td>" +
        "<td>" + htmlCargo + "</td>" +
        "<td>" + htmlSetor + "</td>" +
        "<td>" + htmlObs + "</td>" +
      "</tr>"
    );
  }

  function renderizarHistoricoFuncional(dados) {
    var corpoHistorico = document.getElementById("corpo-historico-funcional");
    if (!corpoHistorico) {
      return;
    }
    var lista = dados.historico_funcional || [];
    if (!Array.isArray(lista) || lista.length === 0) {
      corpoHistorico.innerHTML =
        '<tr><td colspan="5" class="tabela-solicitacoes__vazio">Nenhum evento de transição ou histórico funcional registrado.</td></tr>';
      return;
    }
    corpoHistorico.innerHTML = lista.map(criarLinhaHistoricoFuncionalHtml).join("");
  }

  function renderizarTermoNadaConsta(dados) {
    if (!corpoNadaConsta) {
      return;
    }
    var funcionario = dados.funcionario || {};
    var nadaConsta = dados.nada_consta || {};
    var emitidaEm = dados.emitida_em || "";

    var itensPendentes = [];
    if (Array.isArray(nadaConsta.pendentes)) {
      itensPendentes = nadaConsta.pendentes;
    } else if (Array.isArray(nadaConsta.devolucoes_pendentes)) {
      itensPendentes = nadaConsta.devolucoes_pendentes;
    } else if (Array.isArray(nadaConsta.epis_pendentes)) {
      itensPendentes = nadaConsta.epis_pendentes;
    }

    var qtdPendentes = typeof nadaConsta.total_pendentes === "number"
      ? nadaConsta.total_pendentes
      : (typeof nadaConsta.devolucoes_pendentes === "number"
          ? nadaConsta.devolucoes_pendentes
          : itensPendentes.length);

    var possuiPendencias = Boolean(
      nadaConsta.possui_pendencias ||
      (nadaConsta.nada_consta_apto === false) ||
      (nadaConsta.apto === false) ||
      (nadaConsta.liberado === false) ||
      qtdPendentes > 0
    );

    var bannerStatusHtml = "";
    if (possuiPendencias) {
      bannerStatusHtml =
        '<div class="alert alert-warning border mb-3">' +
          '<div class="fw-bold mb-1"><i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>Pendência de Devolução de EPI Constatada</div>' +
          '<div class="small">' +
            "O colaborador <strong>" + escapar(funcionario.nome || "") + "</strong> (Matrícula <strong>" + escapar(funcionario.matricula || "") + "</strong>) " +
            "possui <strong>" + escapar(String(qtdPendentes || itensPendentes.length || 1)) + "</strong> registro(s) com devolução obrigatória pendente no almoxarifado." +
          "</div>" +
        "</div>";
    } else {
      bannerStatusHtml =
        '<div class="alert alert-success border mb-3">' +
          '<div class="fw-bold mb-1"><i class="bi bi-patch-check-fill me-1" aria-hidden="true"></i>NADA CONSTA — Situação Regular de Devolução de EPIs</div>' +
          '<div class="small">' +
            "Declaramos, para fins de desligamento, transferência ou auditoria interna, que o(a) colaborador(a) " +
            "<strong>" + escapar(funcionario.nome || "") + "</strong>, matrícula <strong>" + escapar(funcionario.matricula || "") + "</strong>, " +
            "cargo <strong>" + escapar(funcionario.cargo || "—") + "</strong>, lotado(a) no setor <strong>" + escapar(formatarSetorFuncionario(funcionario)) + "</strong>, " +
            "<strong>não possui pendências obrigatórias de devolução de Equipamentos de Proteção Individual (EPI)</strong> registradas no SupplyFlow até " + escapar(emitidaEm) + "." +
          "</div>" +
        "</div>";
    }

    var listaPendentesHtml = "";
    if (itensPendentes.length > 0) {
      listaPendentesHtml =
        '<div class="mb-3">' +
          '<div class="small fw-bold text-secondary mb-1">Itens pendentes de devolução / baixa:</div>' +
          '<ul class="small mb-0">' +
            itensPendentes.map(function (item) {
              var prod = item.produto || item.produto_nome || item.nome || "EPI";
              var sol = item.solicitacao || item.codigo || "";
              var dt = item.data || item.data_entrega || "";
              return "<li><strong>" + escapar(prod) + "</strong>" +
                (sol ? " — Solicitação " + escapar(sol) : "") +
                (dt ? " (" + escapar(dt) + ")" : "") +
                "</li>";
            }).join("") +
          "</ul>" +
        "</div>";
    }

    var assinaturasHtml =
      '<div class="row g-4 pt-3 mt-2 border-top text-center small">' +
        '<div class="col-12 col-md-6">' +
          '<div class="border-top border-dark pt-2 mt-4 mx-3">' +
            "<strong>" + escapar(funcionario.nome || "Colaborador") + "</strong><br>" +
            '<span class="text-muted">Matrícula: ' + escapar(funcionario.matricula || "—") + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="col-12 col-md-6">' +
          '<div class="border-top border-dark pt-2 mt-4 mx-3">' +
            "<strong>Responsável Almoxarifado / SESMT / RH</strong><br>" +
            '<span class="text-muted">Emitido em ' + escapar(emitidaEm) + "</span>" +
          "</div>" +
        "</div>" +
      "</div>";

    corpoNadaConsta.innerHTML = bannerStatusHtml + listaPendentesHtml + assinaturasHtml;
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
        var tamanhos = obterTamanhosFuncionario(funcionario);
        document.title = "Ficha de EPI — " + funcionario.nome + " · SupplyFlow";
        document.getElementById("ficha-emissao").textContent =
          "Registro individual das entregas de EPI (RF-43). Emitida em " + dados.emitida_em + ".";

        var paresDadosFuncionario = [
          ["Nome", escapar(funcionario.nome)],
          ["Matrícula", escapar(funcionario.matricula)],
          ["Cargo (RH)", escapar(funcionario.cargo || "—")],
          ["Função (SST)", escapar(funcionario.funcao || "—")],
          ["Habilitações / NRs", formatarHabilitacoesFichaHtml(funcionario)],
          ["Setor", escapar(formatarSetorFuncionario(funcionario))],
          ["Situação", escapar(funcionario.ativo ? "Ativo" : "Inativo")],
          ["Calçado", escapar(tamanhos.calcado || "—")],
          ["Luva", escapar(tamanhos.luva || "—")],
          ["Vestimenta", escapar(tamanhos.vestimenta || "—")]
        ];

        document.getElementById("dados-funcionario").innerHTML = paresDadosFuncionario.map(function (par) {
          return "<div><dt>" + escapar(par[0]) + "</dt><dd>" + par[1] + "</dd></div>";
        }).join("");

        renderizarHistoricoFuncional(dados);
        renderizarTermoNadaConsta(dados);

        if (exibirNadaConstaInicial && secaoNadaConsta) {
          secaoNadaConsta.classList.remove("d-none");
        }

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
        var corpoHistorico = document.getElementById("corpo-historico-funcional");
        if (corpoHistorico) {
          corpoHistorico.innerHTML = "";
        }
      });
  }

  if (btnNadaConsta && secaoNadaConsta) {
    btnNadaConsta.addEventListener("click", function () {
      secaoNadaConsta.classList.remove("d-none");
      secaoNadaConsta.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  checkboxMostrarTodos.addEventListener("change", carregar);
  carregar();
})();
