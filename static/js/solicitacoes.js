/* =====================================================================
   SupplyFlow — Solicitações (lista integrada à API Django /api/solicitacoes/)
   Monta a tabela a partir de dados reais do PostgreSQL e filtra pelas abas.
   O status mostrado considera o estado persistido no banco e na sessão.
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
    "cancelada":         { rotulo: "Cancelada",             selo: "selo--rejeitado" }
  };

  /* Cada aba é uma regra que diz se a solicitação aparece ou não */
  var FILTROS = {
    excepcionais: {
      legenda: "Solicitações excepcionais",
      mostra: function (s) { return Boolean(s.excepcional || s.fora_da_cota); }
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
  var abaAtiva = abas[0];

  /* ---------- Uma linha da tabela ---------- */
  function htmlClassificacao(s) {
    if (!s.ia || !s.ia.categoria) {
      return '<span class="classificacao-ia classificacao-ia--vazia">' +
        '<span aria-hidden="true">—</span><span class="visually-hidden">Não se aplica</span></span>';
    }
    var conf = s.ia.confianca ? ' <span class="classificacao-ia__confianca">· ' + s.ia.confianca + "%</span>" : "";
    return '<span class="classificacao-ia">' +
      escapar(s.ia.categoria) + conf +
    "</span>";
  }

  function htmlLinha(s) {
    var statusChave = SF.sessao.statusDe(s) || "aguardando";
    var status = STATUS_MAP[statusChave] || { rotulo: statusChave, selo: "selo--aguardando" };
    var numeroTexto = s.numero || s.codigo || s.id;
    var dataHora = s.data && s.hora ? s.data + ", " + s.hora : (s.data || "");

    return "<tr>" +
      '<td><span class="numero">' + escapar(numeroTexto) + "</span></td>" +
      "<td>" + escapar(s.funcionario || (s.solicitante && s.solicitante.nome)) + "</td>" +
      "<td>" + escapar(s.funcao || (s.solicitante && s.solicitante.cargo) || "Colaborador") + "</td>" +
      "<td>" + escapar(s.centroCusto || (s.solicitante && s.solicitante.setor) || "Geral") + "</td>" +
      "<td>" + escapar(s.produto || "Material solicitado") + "</td>" +
      '<td class="text-nowrap">' + escapar(dataHora) + "</td>" +
      "<td>" + escapar(s.motivo || "Solicitação de item") + "</td>" +
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
    var listaBase = (window.SF && SF.solicitacoes) || [];
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

  // 1. Busca solicitações reais da API Django
  fetch("/api/solicitacoes/")
    .then(function (resposta) {
      if (!resposta.ok) throw new Error("Erro HTTP " + resposta.status);
      return resposta.json();
    })
    .then(function (dados) {
      window.SF = window.SF || {};
      SF.solicitacoes = dados.solicitacoes || [];
      mostrar(abaAtiva || abas[0]);
    })
    .catch(function (erro) {
      console.warn("Aviso: carregando solicitações de contingência:", erro);
      mostrar(abaAtiva || abas[0]);
    });
})();
