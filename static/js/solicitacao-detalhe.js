/* =====================================================================
   SupplyFlow — Detalhe da Solicitação e Tomada de Decisão
   ---------------------------------------------------------------------
   Lê /api/solicitacoes/<id>/ e envia a decisão para .../decidir/.
   REGRA DE NEGÓCIO IMPORTANTE:
   A IA apenas sugere uma categoria para apoiar a triagem. Quem aprova,
   aprova com condição ou rejeita é sempre o profissional habilitado,
   podendo manter ou reclassificar a categoria sugerida.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var parametrosUrl = new URLSearchParams(window.location.search);
  var idSolicitacao = parametrosUrl.get("id") || "";
  var solicitacaoAtual = null;

  var CLASSES_SELO_STATUS = {
    "aguardando": "selo--aguardando",
    "aprovada": "selo--aprovado",
    "aprovada-condicao": "selo--condicional",
    "rejeitada": "selo--rejeitado",
    "cancelada": "selo--cancelado",
    "entregue": "selo--entregue"
  };

  function obterElemento(idElemento) {
    return document.getElementById(idElemento);
  }

  /* Monta uma lista de definições (<dt>/<dd>) substituindo valores vazios por "—" */
  function montarListaDadosHtml(listaPares) {
    return listaPares.map(function (par) {
      var rotulo = par[0];
      var valorBruto = par[1];
      var valorExibicao = "—";

      if (valorBruto !== null && valorBruto !== undefined && valorBruto !== "") {
        valorExibicao = valorBruto;
      }
      return "<div><dt>" + escapar(rotulo) + "</dt><dd>" + escapar(valorExibicao) + "</dd></div>";
    }).join("");
  }

  function mostrarTelaNaoEncontrada(mensagemPersonalizada) {
    obterElemento("conteudo-detalhe").classList.add("d-none");
    obterElemento("nao-encontrada").classList.remove("d-none");
    if (mensagemPersonalizada) {
      obterElemento("nao-encontrada-texto").textContent = mensagemPersonalizada;
    }
  }

  function formatarCentroCustoSolicitante(solicitante) {
    if (!solicitante || !solicitante.setor) {
      return null;
    }
    if (solicitante.centro_custo) {
      return solicitante.setor + " (" + solicitante.centro_custo + ")";
    }
    return solicitante.setor;
  }

  function renderizarSolicitacao(solicitacao, categoriasDisponiveis) {
    solicitacaoAtual = solicitacao;
    obterElemento("conteudo-detalhe").classList.remove("d-none");
    document.title = "Solicitação " + solicitacao.codigo + " · SupplyFlow";

    obterElemento("det-codigo").textContent = solicitacao.codigo;
    var elementoSelo = obterElemento("det-status");
    var classeSelo = CLASSES_SELO_STATUS[solicitacao.status] || "selo--aguardando";
    elementoSelo.className = "selo " + classeSelo;
    elementoSelo.textContent = solicitacao.status_rotulo;

    obterElemento("det-motivo").textContent = solicitacao.motivo;
    obterElemento("det-data-hora").textContent = solicitacao.data + ", " + solicitacao.hora;

    /* 1. Dados do Funcionário */
    var solicitante = solicitacao.solicitante;
    obterElemento("dados-funcionario").innerHTML = montarListaDadosHtml([
      ["Nome", solicitante.nome],
      ["Matrícula", solicitante.matricula],
      ["Função", solicitante.cargo],
      ["Centro de custo", formatarCentroCustoSolicitante(solicitante)]
    ]);
    obterElemento("link-ficha").href = "ficha-epi.html?id=" + encodeURIComponent(solicitante.id);

    /* 2. Dados do Produto Solicitado */
    var produto = solicitacao.produto;
    obterElemento("det-prod-nome").textContent = produto.nome || "—";
    obterElemento("det-prod-tipo").textContent = produto.tipo || "";

    var textoQuantidade = null;
    if (produto.quantidade != null) {
      textoQuantidade = produto.quantidade + " " + (produto.unidade || "");
    }
    obterElemento("dados-produto").innerHTML = montarListaDadosHtml([
      ["Descrição", produto.descricao],
      ["CA", produto.ca],
      ["Validade do CA", produto.validade_ca],
      ["Tamanho", produto.tamanho],
      ["Quantidade", textoQuantidade]
    ]);

    /* 3. Regra de Fornecimento Aplicada */
    var regra = solicitacao.regra || {};
    var textoPeriodicidade = regra.periodicidade_dias ? (regra.periodicidade_dias + " dias") : null;
    var textoLimiteMensal = (regra.limite_mensal != null) ? (regra.limite_mensal + " un.") : null;

    obterElemento("dados-regra").innerHTML = montarListaDadosHtml([
      ["Escopo", regra.origem],
      ["Periodicidade", textoPeriodicidade],
      ["Limite mensal", textoLimiteMensal],
      ["Exceção", regra.excecao]
    ]);

    /* 4. Histórico de Entregas Anteriores deste Item */
    var elementoHistorico = obterElemento("det-historico");
    if (!solicitacao.historico || solicitacao.historico.length === 0) {
      elementoHistorico.innerHTML = "<li>Nenhuma entrega anterior deste item.</li>";
    } else {
      elementoHistorico.innerHTML = solicitacao.historico.map(function (itemHistorico) {
        return (
          "<li>" +
            '<span class="numero">' + escapar(itemHistorico.data) + "</span>" +
            "<span>" +
              escapar(itemHistorico.tipo) + " · " +
              escapar(itemHistorico.quantidade) + " un. · " +
              escapar(itemHistorico.solicitacao) +
            "</span>" +
          "</li>"
        );
      }).join("");
    }

    /* 5. Justificativa do Funcionário */
    var elementoJustificativa = obterElemento("det-justificativa");
    if (solicitacao.justificativa) {
      elementoJustificativa.textContent = "“" + solicitacao.justificativa + "”";
      elementoJustificativa.classList.remove("citacao--vazia");
    } else {
      elementoJustificativa.textContent = "Retirada regular — sem justificativa.";
      elementoJustificativa.classList.add("citacao--vazia");
    }

    renderizarBlocoIa(solicitacao, categoriasDisponiveis);
    renderizarBlocoDecisao(solicitacao);
  }

  function obterTextoFonteIa(dadosIa) {
    if (dadosIa.fonte === "modelo") {
      var complementoTermos = "";
      if (dadosIa.termos && dadosIa.termos.length > 0) {
        complementoTermos = " · termos que mais pesaram: " + dadosIa.termos.join(", ");
      }
      return "Modelo " + dadosIa.modelo_versao + complementoTermos;
    }
    if (dadosIa.fonte === "palavras-chave") {
      return "Linha de base por palavras-chave (modelo treinado indisponível): sem estimativa de confiança.";
    }
    if (dadosIa.fonte === "legado") {
      return "Classificação feita pela versão anterior do sistema.";
    }
    return "";
  }

  function renderizarBlocoIa(solicitacao, categoriasDisponiveis) {
    var dadosIa = solicitacao.ia;
    var cartaoIa = obterElemento("cartao-ia");

    if (!dadosIa) {
      cartaoIa.querySelector(".cartao__corpo").innerHTML =
        '<p class="mb-0 text-muted">A IA só analisa justificativas de solicitações excepcionais. Esta é uma retirada regular.</p>';
      return;
    }

    obterElemento("ia-categoria").textContent = dadosIa.categoria || "—";
    obterElemento("ia-confianca").textContent = (dadosIa.confianca != null) ? (Math.round(dadosIa.confianca) + "%") : "—";
    obterElemento("ia-fonte").textContent = obterTextoFonteIa(dadosIa);

    var seletorReclassificacao = obterElemento("reclassificar");
    seletorReclassificacao.innerHTML = (categoriasDisponiveis || []).map(function (categoria) {
      var atributoSelected = (categoria === dadosIa.categoria) ? " selected" : "";
      return '<option value="' + escapar(categoria) + '"' + atributoSelected + ">" + escapar(categoria) + "</option>";
    }).join("");

    var decisao = solicitacao.decisao;
    obterElemento("bloco-reclassificar").classList.toggle("d-none", !solicitacao.pode_decidir);

    var quadroCategoriasDecisao = obterElemento("ia-categorias-decisao");
    if (decisao && decisao.categoria_confirmada) {
      quadroCategoriasDecisao.classList.remove("d-none");
      if (decisao.reclassificada) {
        quadroCategoriasDecisao.innerHTML = montarListaDadosHtml([
          ["Sugerida pela IA", decisao.categoria_ia],
          ["Confirmada pelo responsável", decisao.categoria_confirmada]
        ]);
      } else {
        quadroCategoriasDecisao.innerHTML = montarListaDadosHtml([
          ["Categoria confirmada", decisao.categoria_confirmada + " (igual à sugerida)"]
        ]);
      }
    } else {
      quadroCategoriasDecisao.classList.add("d-none");
    }
  }

  function renderizarBlocoDecisao(solicitacao) {
    var formularioDecisao = obterElemento("form-decisao");
    var caixaResultadoDecisao = obterElemento("decisao-tomada");
    var avisoSemPermissao = obterElemento("sem-permissao");

    formularioDecisao.classList.toggle("d-none", !solicitacao.pode_decidir);

    var deveEsconderAvisoSemPermissao =
      solicitacao.pode_decidir || Boolean(solicitacao.decisao) || solicitacao.status !== "aguardando";
    avisoSemPermissao.classList.toggle("d-none", deveEsconderAvisoSemPermissao);

    var decisao = solicitacao.decisao;
    if (!decisao) {
      caixaResultadoDecisao.classList.add("d-none");
      return;
    }

    var linhasResumo = [
      "<strong>" + escapar(decisao.rotulo) + "</strong> por " +
      escapar(decisao.responsavel || "—") + " em " + escapar(decisao.data_hora)
    ];

    if (decisao.observacao) {
      linhasResumo.push("Observação: " + escapar(decisao.observacao));
    }

    if (decisao.exige_devolucao) {
      var devolucao = solicitacao.devolucao || {};
      var detalheCondicaoDevolucao = "";
      if (devolucao.condicao) {
        detalheCondicaoDevolucao = " (" + escapar(devolucao.condicao) + ", destino: " + escapar(devolucao.destinacao) + ")";
      }
      linhasResumo.push(
        "Condição: devolução do EPI anterior — <strong>" +
        escapar(devolucao.rotulo || "pendente") + "</strong>" + detalheCondicaoDevolucao
      );
    }

    caixaResultadoDecisao.innerHTML = '<div class="alert alert-light border mb-0">' + linhasResumo.join("<br>") + "</div>";
    caixaResultadoDecisao.classList.remove("d-none");
  }

  /* ---------- Validação e Envio da Decisão ---------- */
  function mostrarErroDecisao(mensagemErro, idsCamposInvalidos) {
    var caixaErro = obterElemento("erro-decisao");
    caixaErro.textContent = mensagemErro;

    ["observacao", "exigir-devolucao"].forEach(function (idCampo) {
      var campo = obterElemento(idCampo);
      campo.removeAttribute("aria-invalid");
      campo.classList.remove("is-invalid");
    });

    if (idsCamposInvalidos && idsCamposInvalidos.length > 0) {
      idsCamposInvalidos.forEach(function (idCampo) {
        var campo = obterElemento(idCampo);
        campo.setAttribute("aria-invalid", "true");
        campo.classList.add("is-invalid");
        campo.setAttribute("aria-describedby", "erro-decisao");
      });
      obterElemento(idsCamposInvalidos[0]).focus();
    }
  }

  function definirBotoesDecisaoDesabilitados(desabilitado) {
    document.querySelectorAll("[data-decisao]").forEach(function (botao) {
      botao.disabled = desabilitado;
    });
  }

  obterElemento("form-decisao").addEventListener("click", function (evento) {
    var botaoClicado = evento.target.closest("[data-decisao]");
    if (!botaoClicado || !solicitacaoAtual) {
      return;
    }

    var tipoDecisao = botaoClicado.dataset.decisao;
    var textoObservacao = obterElemento("observacao").value.trim();
    var exigeDevolucao = obterElemento("exigir-devolucao").checked;
    mostrarErroDecisao("");

    /* Validações de regra de negócio antes do envio ao servidor */
    if (tipoDecisao === "rejeitar" && !textoObservacao) {
      mostrarErroDecisao("Para rejeitar, explique o motivo na observação.", ["observacao"]);
      return;
    }
    if (tipoDecisao === "aprovar_condicao" && !exigeDevolucao && !textoObservacao) {
      mostrarErroDecisao(
        "Para aprovar com condição, marque a devolução do EPI ou descreva a condição na observação.",
        ["exigir-devolucao", "observacao"]
      );
      return;
    }
    if (tipoDecisao === "aprovar" && exigeDevolucao) {
      mostrarErroDecisao(
        "A devolução marcada é uma condição: use “Aprovar com condição” ou desmarque-a.",
        ["exigir-devolucao"]
      );
      return;
    }

    definirBotoesDecisaoDesabilitados(true);
    var seletorReclassificacao = obterElemento("reclassificar");
    var categoriaConfirmada = "";
    if (solicitacaoAtual.ia && seletorReclassificacao) {
      categoriaConfirmada = seletorReclassificacao.value;
    }

    var payload = {
      decisao: tipoDecisao,
      observacao: textoObservacao,
      exige_devolucao: exigeDevolucao,
      categoria_confirmada: categoriaConfirmada
    };

    SF.api.post("/api/solicitacoes/" + encodeURIComponent(solicitacaoAtual.id) + "/decidir/", payload)
      .then(function (resposta) {
        renderizarSolicitacao(resposta.solicitacao, []);
        obterElemento("decisao-tomada").focus();
      })
      .catch(function (erro) {
        mostrarErroDecisao(erro.message);
        definirBotoesDecisaoDesabilitados(false);
      });
  });

  /* ---------- Carregamento Inicial ---------- */
  var padraoUuid = /^[0-9a-f-]{36}$/i;
  if (!padraoUuid.test(idSolicitacao)) {
    mostrarTelaNaoEncontrada("Abra uma solicitação a partir da lista.");
    return;
  }

  SF.api.get("/api/solicitacoes/" + encodeURIComponent(idSolicitacao) + "/")
    .then(function (resposta) {
      renderizarSolicitacao(resposta.solicitacao, resposta.categorias);
    })
    .catch(function (erro) {
      var mensagem = (erro.status === 404) ? null : erro.message;
      mostrarTelaNaoEncontrada(mensagem);
    });
})();
