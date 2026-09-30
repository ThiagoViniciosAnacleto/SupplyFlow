/* =====================================================================
   SupplyFlow — Solicitações (lista)
   Monta a tabela a partir de dados-demo.js e filtra pelas abas, sem
   recarregar a página. O status mostrado já considera as decisões
   tomadas nesta sessão (SF.sessao.statusDe).
   ===================================================================== */

(function () {
  var escapar = SF.escapar;

  /* Cada aba é uma regra que diz se a solicitação aparece ou não */
  var FILTROS = {
    excepcionais: {
      legenda: "Solicitações excepcionais",
      mostra: function (s) { return s.excepcional; }
    },
    aguardando: {
      legenda: "Solicitações aguardando análise",
      mostra: function (s) { return SF.sessao.statusDe(s) === "aguardando"; }
    },
    todas: {
      legenda: "Todas as solicitações",
      mostra: function () { return true; }
    }
  };

  var abas = Array.prototype.slice.call(document.querySelectorAll('.abas [role="tab"]'));
  var painel = document.getElementById("painel-solicitacoes");
  var corpo = document.getElementById("corpo-tabela");
  var legenda = document.getElementById("legenda-tabela");
  var resumo = document.getElementById("resumo-filtro");

  /* ---------- Uma linha da tabela ---------- */
  function htmlClassificacao(s) {
    if (!s.ia) {
      return '<span class="classificacao-ia classificacao-ia--vazia">' +
        '<span aria-hidden="true">—</span><span class="visually-hidden">Não se aplica</span></span>';
    }
    return '<span class="classificacao-ia">' +
      escapar(s.ia.categoria) + ' <span class="classificacao-ia__confianca">· ' + s.ia.confianca + "%</span>" +
    "</span>";
  }

  function htmlLinha(s) {
    var status = SF.statusSolicitacao[SF.sessao.statusDe(s)];
    return "<tr>" +
      '<td><span class="numero">' + escapar(s.numero) + "</span></td>" +
      "<td>" + escapar(s.funcionario) + "</td>" +
      "<td>" + escapar(s.funcao) + "</td>" +
      "<td>" + escapar(s.centroCusto) + "</td>" +
      "<td>" + escapar(s.produto) + "</td>" +
      '<td class="text-nowrap">' + escapar(s.data + ", " + s.hora) + "</td>" +
      "<td>" + escapar(s.motivo) + "</td>" +
      "<td>" + htmlClassificacao(s) + "</td>" +
      '<td class="tabela-solicitacoes__status"><span class="selo ' + status.selo + '">' + escapar(status.rotulo) + "</span></td>" +
      '<td class="tabela-solicitacoes__acao">' +
        '<a class="link-abrir" href="solicitacao.html?id=' + encodeURIComponent(s.id) + '"' +
        ' aria-label="Abrir solicitação ' + escapar(s.numero) + '">' +
          'Abrir <i class="bi bi-chevron-right" aria-hidden="true"></i></a>' +
      "</td>" +
    "</tr>";
  }

  /* ---------- Troca de aba ---------- */
  function mostrar(aba) {
    var filtro = FILTROS[aba.dataset.filtro];
    var lista = SF.solicitacoes.filter(filtro.mostra);

    abas.forEach(function (outra) {
      var ativa = outra === aba;
      outra.setAttribute("aria-selected", ativa ? "true" : "false");
      outra.tabIndex = ativa ? 0 : -1; // só a aba ativa recebe o Tab; as setas passam entre elas
    });
    painel.setAttribute("aria-labelledby", aba.id);
    legenda.textContent = filtro.legenda;

    corpo.innerHTML = lista.length
      ? lista.map(htmlLinha).join("")
      : '<tr><td colspan="10" class="tabela-solicitacoes__vazio">Nenhuma solicitação nesta aba.</td></tr>';

    resumo.textContent = lista.length === 1
      ? "1 solicitação encontrada."
      : lista.length + " solicitações encontradas.";
  }

  abas.forEach(function (aba, posicao) {
    aba.addEventListener("click", function () { mostrar(aba); });

    /* Teclado: setas esquerda/direita, Home e End trocam de aba */
    aba.addEventListener("keydown", function (evento) {
      var destino = null;
      if (evento.key === "ArrowRight") destino = abas[(posicao + 1) % abas.length];
      if (evento.key === "ArrowLeft")  destino = abas[(posicao - 1 + abas.length) % abas.length];
      if (evento.key === "Home")       destino = abas[0];
      if (evento.key === "End")        destino = abas[abas.length - 1];
      if (!destino) return;

      evento.preventDefault();
      destino.focus();
      mostrar(destino);
    });
  });

  mostrar(abas[0]); // começa em "Excepcionais"
})();
