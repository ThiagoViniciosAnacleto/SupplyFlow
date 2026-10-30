/* =====================================================================
   SupplyFlow — Avaliação do Modelo de IA (/api/avaliacao-ia/)
   ---------------------------------------------------------------------
   Exibe as métricas do classificador TF-IDF + SVM/Regressão Logística
   medidas no conjunto de teste separado (geradas no treino) e a taxa de
   concordância humana observada nas decisões reais do backoffice.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  function formatarPercentual(valor) {
    if (valor == null) {
      return "—";
    }
    return String(valor).replace(".", ",") + "%";
  }

  function renderizarCartoesKpi(listaIndicadores) {
    document.getElementById("kpis").innerHTML = listaIndicadores.map(function (item) {
      var rotulo = item[0];
      var valor = item[1];
      var classeTom = item[2];
      var nota = item[3];
      var htmlNota = nota ? ('<p class="indicador__nota">' + escapar(nota) + "</p>") : "";

      return (
        '<div class="cartao indicador">' +
          "<div>" +
            '<p class="indicador__rotulo">' + escapar(rotulo) + "</p>" +
            '<p class="indicador__valor">' + escapar(valor) + "</p>" +
            htmlNota +
          "</div>" +
          '<span class="indicador__icone ' + classeTom + '" aria-hidden="true">' +
            '<i class="bi bi-graph-up"></i>' +
          "</span>" +
        "</div>"
      );
    }).join("");
  }

  /* Preenche a tabela de Precisão, Revocação e F1 por categoria */
  function renderizarTabelaMetricasPorCategoria(metricas) {
    var matrizConfusao = metricas.modelo.matriz_confusao;
    var totalAcertos = 0;
    var totalErros = 0;

    document.getElementById("sub-categorias").textContent =
      "Precisão: das vezes que o modelo sugeriu a categoria, quantas estavam certas. " +
      "Revocação: dos casos da categoria, quantos o modelo reconheceu.";

    document.getElementById("corpo-categorias").innerHTML = metricas.modelo.por_categoria.map(function (itemCat, indice) {
      var acertosNaDiagonal = matrizConfusao[indice][indice];
      var errosNaLinha = itemCat.suporte - acertosNaDiagonal;
      totalAcertos += acertosNaDiagonal;
      totalErros += errosNaLinha;

      return (
        "<tr>" +
          "<td>" + escapar(itemCat.categoria) + "</td>" +
          '<td class="text-end texto-acerto">' + acertosNaDiagonal + "</td>" +
          '<td class="text-end texto-erro">' + errosNaLinha + "</td>" +
          '<td class="text-end">' + formatarPercentual(itemCat.precisao) + "</td>" +
          '<td class="text-end">' + formatarPercentual(itemCat.revocacao) + "</td>" +
          '<td class="text-end">' + formatarPercentual(itemCat.f1) + "</td>" +
        "</tr>"
      );
    }).join("");

    document.getElementById("rodape-categorias").innerHTML =
      '<tr><th scope="row">Total / média</th>' +
        '<td class="text-end texto-acerto">' + totalAcertos + "</td>" +
        '<td class="text-end texto-erro">' + totalErros + "</td>" +
        '<td class="text-end">' + formatarPercentual(metricas.modelo.precisao_macro) + "</td>" +
        '<td class="text-end">' + formatarPercentual(metricas.modelo.revocacao_macro) + "</td>" +
        '<td class="text-end">' + formatarPercentual(metricas.modelo.f1_macro) + "</td>" +
      "</tr>";
  }

  /* Desenha a Matriz de Confusão (diagonal principal = acertos em verde; fora = erros em vermelho) */
  function renderizarMatrizConfusao(metricas) {
    var matriz = metricas.modelo.matriz_confusao;
    var maiorValorCelula = Math.max.apply(null, matriz.map(function (linha) {
      return Math.max.apply(null, linha);
    })) || 1;

    var htmlCabecalhosColuna = metricas.categorias.map(function (nomeCategoria) {
      return '<th scope="col"><span class="matriz__rotulo">' + escapar(nomeCategoria) + "</span></th>";
    }).join("");

    var htmlLinhasMatriz = matriz.map(function (linhaValores, indiceReal) {
      var categoriaReal = metricas.categorias[indiceReal];

      var htmlCelulas = linhaValores.map(function (contagem, indiceSugerido) {
        var categoriaSugerida = metricas.categorias[indiceSugerido];
        var classeCor = "";
        var opacidadeFundo = 0;

        if (contagem > 0) {
          classeCor = (indiceReal === indiceSugerido) ? " matriz__acerto" : " matriz__erro";
          opacidadeFundo = 0.15 + (0.85 * contagem / maiorValorCelula);
          /* Usa texto branco apenas quando o fundo fica escuro para garantir contraste de leitura */
          if (opacidadeFundo > 0.55) {
            classeCor += " matriz__forte";
          }
        }

        var textoCelula = contagem ? String(contagem) : "";
        var dicaCelula = "Correta: " + escapar(categoriaReal) + " · Sugerida: " + escapar(categoriaSugerida);

        return (
          '<td class="matriz__celula' + classeCor + '"' +
              ' style="--intensidade:' + opacidadeFundo.toFixed(2) + '"' +
              ' title="' + dicaCelula + '">' +
            textoCelula +
          "</td>"
        );
      }).join("");

      return '<tr><th scope="row">' + escapar(categoriaReal) + "</th>" + htmlCelulas + "</tr>";
    }).join("");

    document.getElementById("matriz").innerHTML =
      "<thead>" +
        "<tr>" +
          '<th scope="col"><span class="visually-hidden">Correta \\ Sugerida</span></th>' +
          htmlCabecalhosColuna +
        "</tr>" +
      "</thead>" +
      "<tbody>" + htmlLinhasMatriz + "</tbody>";
  }

  /* Preenche a ficha técnica do treino e a comparação com a linha de base (palavras-chave) */
  function renderizarFichaEComparacao(metricas) {
    var percentualTreino = Math.round((1 - metricas.dados.proporcao_teste) * 100);
    var percentualTeste = Math.round(metricas.dados.proporcao_teste * 100);
    var origemDados = metricas.dados.sintetico
      ? ("Sintéticos (" + metricas.dados.arquivo + ")")
      : ("Reais anonimizados (" + metricas.dados.arquivo + ")");

    var paresFicha = [
      ["Versão", metricas.versao],
      ["Algoritmo", "TF-IDF (palavras + trechos de letras) + " + metricas.algoritmo],
      ["Divisão", percentualTreino + "% treino / " + percentualTeste + "% teste, estratificada, semente " + metricas.dados.semente],
      ["Dados", origemDados],
      ["Confiança média no teste", formatarPercentual(metricas.confianca_media_teste)],
      ["scikit-learn", metricas.versoes["scikit-learn"]]
    ];

    document.getElementById("ficha-modelo").innerHTML = paresFicha.map(function (par) {
      return "<div><dt>" + escapar(par[0]) + "</dt><dd>" + escapar(par[1]) + "</dd></div>";
    }).join("");

    var linhasComparacao = [
      { nome: "Linha de base (palavras-chave)", acuracia: metricas.linha_base.acuracia, f1: metricas.linha_base.f1_macro, destaque: false },
      { nome: "Modelo escolhido: " + metricas.algoritmo, acuracia: metricas.modelo.acuracia, f1: metricas.modelo.f1_macro, destaque: true }
    ];

    document.getElementById("corpo-comparacao").innerHTML = linhasComparacao.map(function (item) {
      var atributoClasse = item.destaque ? ' class="fw-semibold"' : "";
      return (
        "<tr" + atributoClasse + ">" +
          "<td>" + escapar(item.nome) + "</td>" +
          '<td class="text-end">' + formatarPercentual(item.acuracia) + "</td>" +
          '<td class="text-end">' + formatarPercentual(item.f1) + "</td>" +
        "</tr>"
      );
    }).join("");

    var resumoValidacaoCruzada = metricas.comparacao_algoritmos.map(function (alg) {
      return alg.algoritmo + " F1 " + formatarPercentual(alg.f1_macro_cv) + " ± " + alg.desvio;
    }).join(" · ");

    document.getElementById("nota-comparacao").textContent =
      "Algoritmos comparados por validação cruzada (5 dobras) só no treino: " + resumoValidacaoCruzada + ".";
  }

  function renderizar(dados) {
    var metricas = dados.metricas;
    var uso = dados.uso;
    var rotuloDecisoesComIa = uso.decisoes_com_ia + (uso.decisoes_com_ia === 1 ? " decisão" : " decisões") + " com sugestão";

    if (!metricas) {
      document.getElementById("aviso-sem-modelo").classList.remove("d-none");
      renderizarCartoesKpi([
        ["Concordância humana", formatarPercentual(uso.concordancia), "tom-verde", rotuloDecisoesComIa]
      ]);
    } else {
      document.getElementById("aviso-sintetico").classList.toggle("d-none", !metricas.dados.sintetico);
      document.getElementById("descricao-modelo").textContent =
        "Modelo " + metricas.versao + " (TF-IDF + " + metricas.algoritmo + "), treinado em " + metricas.treinado_em +
        ". Métricas medidas em " + metricas.dados.teste + " justificativas de teste que o modelo não viu no treino.";

      renderizarCartoesKpi([
        ["Acurácia no teste", formatarPercentual(metricas.modelo.acuracia), "tom-azul", "Linha de base: " + formatarPercentual(metricas.linha_base.acuracia)],
        ["F1 macro no teste", formatarPercentual(metricas.modelo.f1_macro), "tom-indigo", "Linha de base: " + formatarPercentual(metricas.linha_base.f1_macro)],
        ["Exemplos avaliados", metricas.dados.teste, "tom-cinza", metricas.dados.total + " no total (" + metricas.dados.treino + " de treino)"],
        ["Concordância humana", formatarPercentual(uso.concordancia), "tom-verde", rotuloDecisoesComIa]
      ]);

      renderizarTabelaMetricasPorCategoria(metricas);
      renderizarMatrizConfusao(metricas);
      renderizarFichaEComparacao(metricas);
    }

    if (uso.decisoes_com_ia) {
      var palavraDecisao = (uso.decisoes_com_ia === 1) ? " decisão" : " decisões";
      document.getElementById("resumo-uso").textContent =
        "Em " + uso.decisoes_com_ia + palavraDecisao + " com sugestão da IA, o responsável manteve a categoria em " +
        formatarPercentual(uso.concordancia) + " e reclassificou " + uso.reclassificadas + ".";
    } else {
      document.getElementById("resumo-uso").textContent =
        "Ainda não há decisões sobre solicitações classificadas pela IA.";
    }

    document.getElementById("lista-reclassificacoes").innerHTML = uso.ultimas_reclassificacoes.map(function (reclassificacao) {
      return (
        "<li>" +
          '<span class="numero">' + escapar(reclassificacao.codigo) + "</span>" +
          "<span>" +
            escapar(reclassificacao.categoria_ia) + " → <strong>" + escapar(reclassificacao.categoria_confirmada) + "</strong> · " +
            escapar(reclassificacao.responsavel) + " · " + escapar(reclassificacao.data) +
          "</span>" +
        "</li>"
      );
    }).join("");
  }

  SF.api.get("/api/avaliacao-ia/")
    .then(renderizar)
    .catch(function (erro) {
      document.getElementById("kpis").innerHTML =
        '<div class="alert alert-danger" role="alert">' + escapar(erro.message) + "</div>";
    });
})();
