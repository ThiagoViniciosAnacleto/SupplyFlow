/* =====================================================================
   SupplyFlow — Solicitações (lista integrada à API Django /api/solicitacoes/)
   Monta a tabela a partir de dados reais do PostgreSQL e filtra pelas abas.
   O status, a categoria da IA e a decisão vêm sempre do servidor.
   ===================================================================== */

(function () {
  var escapar = (window.SF && SF.escapar) || function (texto) {
    var div = document.createElement("div");
    div.textContent = texto || "";
    return div.innerHTML;
  };

  var STATUS_MAP = {
    "aguardando":        { rotulo: "Aguardando aprovação",  selo: "selo--aguardando" },
    "aprovada":          { rotulo: "Aprovada",              selo: "selo--aprovado" },
    "aprovada-condicao": { rotulo: "Aprovada com condição", selo: "selo--condicional" },
    "rejeitada":         { rotulo: "Rejeitada",             selo: "selo--rejeitado" },
    "entregue":          { rotulo: "Entregue",              selo: "selo--entregue" },
    "cancelada":         { rotulo: "Cancelada",             selo: "selo--cancelado" }
  };

  /* Cada aba é uma regra que diz se a solicitação aparece ou não */
  var FILTROS = {
    excepcionais: {
      legenda: "Solicitações excepcionais",
      mostra: function (s) { return Boolean(s.excepcional || s.fora_da_cota); }
    },
    aguardando: {
      legenda: "Solicitações aguardando análise",
      mostra: function (s) { return s.status === "aguardando"; }
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
  var abaAtiva = abas[0];
  var solicitacoes = [];

  /* ---------- Uma linha da tabela ---------- */
  function htmlClassificacao(s) {
    if (!s.ia || !s.ia.categoria) {
      return '<span class="classificacao-ia classificacao-ia--vazia">' +
        '<span aria-hidden="true">—</span><span class="visually-hidden">Não se aplica</span></span>';
    }
    var conf = s.ia.confianca != null
      ? ' <span class="classificacao-ia__confianca">· ' + Math.round(s.ia.confianca) + "%</span>"
      : ' <span class="classificacao-ia__confianca">· sem confiança</span>';
    return '<span class="classificacao-ia">' +
      escapar(s.ia.categoria) + conf +
    "</span>";
  }

  function htmlLinha(s) {
    var statusChave = s.status || "aguardando";
    var status = STATUS_MAP[statusChave] || { rotulo: s.status_rotulo || statusChave, selo: "selo--aguardando" };
    var numeroTexto = s.numero || s.codigo || s.id;
    var dataHora = s.data && s.hora ? s.data + ", " + s.hora : (s.data || "");

    return "<tr>" +
      '<td><span class="numero">' + escapar(numeroTexto) + "</span></td>" +
      "<td>" + escapar(s.funcionario || (s.solicitante && s.solicitante.nome)) + "</td>" +
      "<td>" + escapar(s.funcao || "—") + "</td>" +
      "<td>" + escapar(s.centroCusto || "—") + "</td>" +
      "<td>" + escapar(s.produto || "—") + "</td>" +
      '<td class="text-nowrap">' + escapar(dataHora) + "</td>" +
      "<td>" + escapar(s.motivo || "—") + "</td>" +
      "<td>" + htmlClassificacao(s) + "</td>" +
      '<td class="tabela-solicitacoes__status"><span class="selo ' + status.selo + '">' + escapar(status.rotulo) + "</span></td>" +
      '<td class="tabela-solicitacoes__acao">' +
        '<a class="link-abrir" href="solicitacao.html?id=' + encodeURIComponent(s.id) + '"' +
        ' aria-label="Abrir solicitação ' + escapar(numeroTexto) + '">' +
          'Abrir <i class="bi bi-chevron-right" aria-hidden="true"></i></a>' +
      "</td>" +
    "</tr>";
  }

  /* ---------- Troca de aba ---------- */
  function mostrar(aba) {
    if (!aba || !corpo) return;
    abaAtiva = aba;
    var filtro = FILTROS[aba.dataset.filtro] || FILTROS.todas;
    var listaBase = solicitacoes;
    var lista = listaBase.filter(filtro.mostra);

    abas.forEach(function (outra) {
      var ativa = outra === aba;
      outra.setAttribute("aria-selected", ativa ? "true" : "false");
      outra.tabIndex = ativa ? 0 : -1;
    });

    if (painel) painel.setAttribute("aria-labelledby", aba.id);
    if (legenda) legenda.textContent = filtro.legenda;

    corpo.innerHTML = lista.length
      ? lista.map(htmlLinha).join("")
      : '<tr><td colspan="10" class="tabela-solicitacoes__vazio">Nenhuma solicitação nesta aba.</td></tr>';

    if (resumo) {
      resumo.textContent = lista.length === 1
        ? "1 solicitação encontrada."
        : lista.length + " solicitações encontradas.";
    }
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

  // Mostra indicador de carregamento inicial
  if (corpo) {
    corpo.innerHTML = '<tr><td colspan="10" class="tabela-solicitacoes__vazio">Carregando solicitações do sistema...</td></tr>';
  }

  // Busca as solicitações no servidor. Em caso de erro, mostra o erro (nunca dados de exemplo).
  SF.api.get("/api/solicitacoes/")
    .then(function (dados) {
      solicitacoes = dados.solicitacoes || [];
      mostrar(abaAtiva || abas[0]);
    })
    .catch(function (erro) {
      corpo.innerHTML = '<tr><td colspan="10" class="tabela-solicitacoes__vazio" role="alert">' +
        escapar("Não foi possível carregar as solicitações: " + erro.message) + "</td></tr>";
    });
})();
