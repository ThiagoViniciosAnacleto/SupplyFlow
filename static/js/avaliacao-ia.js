/* =====================================================================
   SupplyFlow — Avaliação do modelo (IA)
   Tudo vem de /api/avaliacao-ia/: métricas do teste separado (geradas no
   treino) e a concordância dos responsáveis com as sugestões em uso.
   ===================================================================== */

(function () {
  var esc = SF.escapar;

  function pct(valor) {
    return valor == null ? "—" : String(valor).replace(".", ",") + "%";
  }

  function kpis(lista) {
    document.getElementById("kpis").innerHTML = lista.map(function (k) {
      return '<div class="cartao indicador"><div>' +
        '<p class="indicador__rotulo">' + esc(k[0]) + "</p>" +
        '<p class="indicador__valor">' + esc(k[1]) + "</p>" +
        (k[3] ? '<p class="indicador__nota">' + esc(k[3]) + "</p>" : "") +
        '</div><span class="indicador__icone ' + k[2] + '" aria-hidden="true"><i class="bi bi-graph-up"></i></span></div>';
    }).join("");
  }

  function renderizar(d) {
    var m = d.metricas;
    var uso = d.uso;

    if (!m) {
      document.getElementById("aviso-sem-modelo").classList.remove("d-none");
      kpis([["Concordância humana", pct(uso.concordancia), "tom-verde", uso.decisoes_com_ia + (uso.decisoes_com_ia === 1 ? " decisão" : " decisões") + " com sugestão"]]);
    } else {
      document.getElementById("aviso-sintetico").classList.toggle("d-none", !m.dados.sintetico);
      document.getElementById("descricao-modelo").textContent =
        "Modelo " + m.versao + " (TF-IDF + " + m.algoritmo + "), treinado em " + m.treinado_em +
        ". Métricas medidas em " + m.dados.teste + " justificativas de teste que o modelo não viu no treino.";
      kpis([
        ["Acurácia no teste", pct(m.modelo.acuracia), "tom-azul", "Linha de base: " + pct(m.linha_base.acuracia)],
        ["F1 macro no teste", pct(m.modelo.f1_macro), "tom-indigo", "Linha de base: " + pct(m.linha_base.f1_macro)],
        ["Exemplos avaliados", m.dados.teste, "tom-cinza", m.dados.total + " no total (" + m.dados.treino + " de treino)"],
        ["Concordância humana", pct(uso.concordancia), "tom-verde", uso.decisoes_com_ia + (uso.decisoes_com_ia === 1 ? " decisão" : " decisões") + " com sugestão"]
      ]);

      var matriz = m.modelo.matriz_confusao;
      var totalAcertos = 0, totalErros = 0;
      document.getElementById("sub-categorias").textContent =
        "Precisão: das vezes que o modelo sugeriu a categoria, quantas estavam certas. " +
        "Revocação: dos casos da categoria, quantos o modelo reconheceu.";
      document.getElementById("corpo-categorias").innerHTML = m.modelo.por_categoria.map(function (c, i) {
        var acertos = matriz[i][i];
        var erros = c.suporte - acertos;
        totalAcertos += acertos;
        totalErros += erros;
        return "<tr><td>" + esc(c.categoria) + "</td>" +
          '<td class="text-end texto-acerto">' + acertos + "</td>" +
          '<td class="text-end texto-erro">' + erros + "</td>" +
          '<td class="text-end">' + pct(c.precisao) + "</td>" +
          '<td class="text-end">' + pct(c.revocacao) + "</td>" +
          '<td class="text-end">' + pct(c.f1) + "</td></tr>";
      }).join("");
      document.getElementById("rodape-categorias").innerHTML =
        '<tr><th scope="row">Total / média</th>' +
        '<td class="text-end texto-acerto">' + totalAcertos + "</td>" +
        '<td class="text-end texto-erro">' + totalErros + "</td>" +
        '<td class="text-end">' + pct(m.modelo.precisao_macro) + "</td>" +
        '<td class="text-end">' + pct(m.modelo.revocacao_macro) + "</td>" +
        '<td class="text-end">' + pct(m.modelo.f1_macro) + "</td></tr>";

      var maior = Math.max.apply(null, matriz.map(function (l) { return Math.max.apply(null, l); })) || 1;
      document.getElementById("matriz").innerHTML =
        '<thead><tr><th scope="col"><span class="visually-hidden">Correta \\ Sugerida</span></th>' +
        m.categorias.map(function (c) { return '<th scope="col"><span class="matriz__rotulo">' + esc(c) + "</span></th>"; }).join("") +
        "</tr></thead><tbody>" +
        matriz.map(function (linha, i) {
          return '<tr><th scope="row">' + esc(m.categorias[i]) + "</th>" + linha.map(function (v, j) {
            var classe = v === 0 ? "" : i === j ? " matriz__acerto" : " matriz__erro";
            var opacidade = v === 0 ? 0 : 0.15 + 0.85 * v / maior;
            if (opacidade > 0.55) classe += " matriz__forte"; // texto branco só no fundo escuro (contraste)
            return '<td class="matriz__celula' + classe + '" style="--intensidade:' + opacidade.toFixed(2) + '"' +
              ' title="Correta: ' + esc(m.categorias[i]) + " · Sugerida: " + esc(m.categorias[j]) + '">' + (v || "") + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";

      document.getElementById("ficha-modelo").innerHTML = [
        ["Versão", m.versao], ["Algoritmo", "TF-IDF (palavras + trechos de letras) + " + m.algoritmo],
        ["Divisão", Math.round((1 - m.dados.proporcao_teste) * 100) + "% treino / " + Math.round(m.dados.proporcao_teste * 100) + "% teste, estratificada, semente " + m.dados.semente],
        ["Dados", m.dados.sintetico ? "Sintéticos (" + m.dados.arquivo + ")" : "Reais anonimizados (" + m.dados.arquivo + ")"],
        ["Confiança média no teste", pct(m.confianca_media_teste)],
        ["scikit-learn", m.versoes["scikit-learn"]]
      ].map(function (p) { return "<div><dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd></div>"; }).join("");

      var linhas = [["Linha de base (palavras-chave)", m.linha_base.acuracia, m.linha_base.f1_macro, false],
                    ["Modelo escolhido: " + m.algoritmo, m.modelo.acuracia, m.modelo.f1_macro, true]];
      document.getElementById("corpo-comparacao").innerHTML = linhas.map(function (l) {
        return "<tr" + (l[3] ? ' class="fw-semibold"' : "") + "><td>" + esc(l[0]) + '</td><td class="text-end">' + pct(l[1]) +
          '</td><td class="text-end">' + pct(l[2]) + "</td></tr>";
      }).join("");
      document.getElementById("nota-comparacao").textContent = "Algoritmos comparados por validação cruzada (5 dobras) só no treino: " +
        m.comparacao_algoritmos.map(function (a) { return a.algoritmo + " F1 " + pct(a.f1_macro_cv) + " ± " + a.desvio; }).join(" · ") + ".";
    }

    document.getElementById("resumo-uso").textContent = uso.decisoes_com_ia
      ? "Em " + uso.decisoes_com_ia + (uso.decisoes_com_ia === 1 ? " decisão" : " decisões") + " com sugestão da IA, o responsável manteve a categoria em " +
        pct(uso.concordancia) + " e reclassificou " + uso.reclassificadas + "."
      : "Ainda não há decisões sobre solicitações classificadas pela IA.";
    document.getElementById("lista-reclassificacoes").innerHTML = uso.ultimas_reclassificacoes.map(function (r) {
      return '<li><span class="numero">' + esc(r.codigo) + "</span><span>" + esc(r.categoria_ia) + " → <strong>" +
        esc(r.categoria_confirmada) + "</strong> · " + esc(r.responsavel) + " · " + esc(r.data) + "</span></li>";
    }).join("");
  }

  SF.api.get("/api/avaliacao-ia/").then(renderizar).catch(function (erro) {
    document.getElementById("kpis").innerHTML = '<div class="alert alert-danger" role="alert">' + esc(erro.message) + "</div>";
  });
})();
