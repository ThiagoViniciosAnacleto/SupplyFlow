/* =====================================================================
   SupplyFlow — Detalhe da Solicitação e Deliberação com IA
   Conectado a /api/solicitacoes/<id>/ e /api/solicitacoes/<id>/decidir/
   ===================================================================== */

(function () {
  var urlParams = new URLSearchParams(window.location.search);
  var solicId = urlParams.get("id") || "60000000-0000-4000-8000-000000000001";
  var solicitacaoAtual = null;

  var STATUS_CLASSES = {
    "aguardando": { rotulo: "Aguardando aprovação", selo: "selo--aguardando" },
    "aprovada": { rotulo: "Aprovada", selo: "selo--aprovado" },
    "aprovada-condicao": { rotulo: "Aprovada com condição", selo: "selo--condicional" },
    "rejeitada": { rotulo: "Rejeitada", selo: "selo--rejeitado" },
    "entregue": { rotulo: "Entregue", selo: "selo--entregue" },
  };

  function carregarDetalhes() {
    SF.api.get("/api/solicitacoes/" + encodeURIComponent(solicId) + "/")
      .then(function (dados) {
        solicitacaoAtual = dados.solicitacao;
        renderizarTela(solicitacaoAtual);
      })
      .catch(function (err) {
        console.warn("Erro ao buscar da API, tentando lista:", err);
        SF.api.get("/api/solicitacoes/")
          .then(function (d) {
            var s = (d.solicitacoes || []).find(function (item) {
              return item.id === solicId || item.codigo === solicId || item.numero === solicId;
            });
            if (s) {
              renderizarTela(s);
            } else {
              document.getElementById("det-codigo").textContent = "Não localizada";
            }
          });
      });
  }

  function renderizarTela(s) {
    if (!s) return;
    solicitacaoAtual = s;

    // Cabeçalho
    document.getElementById("det-codigo").textContent = s.codigo || s.numero;
    document.getElementById("det-motivo").textContent = s.motivo || "Substituição antecipada";
    document.getElementById("det-data-hora").textContent = (s.data && s.hora ? s.data + ", " + s.hora : s.data_solicitacao) || "—";

    var st = STATUS_CLASSES[s.status] || { rotulo: s.status, selo: "selo--aguardando" };
    var elBadge = document.getElementById("det-status-badge");
    elBadge.className = "selo " + st.selo;
    elBadge.textContent = st.rotulo;

    // Funcionário
    var func = s.solicitante || {};
    document.getElementById("det-func-nome").textContent = func.nome || s.funcionario || "—";
    document.getElementById("det-func-matricula").textContent = func.matricula || s.matricula || "—";
    document.getElementById("det-func-cargo").textContent = func.cargo || s.funcao || "Colaborador";
    document.getElementById("det-func-setor").textContent = (func.setor || s.centroCusto || "Operações") + (func.centro_custo ? " (" + func.centro_custo + ")" : "");

    // Produto
    var prod = s.produto || {};
    var primeiroItem = (s.itens && s.itens[0]) || {};
    document.getElementById("det-prod-nome").textContent = (typeof prod === "string" ? prod : prod.nome) || primeiroItem.produto || "Material solicitado";
    document.getElementById("det-prod-desc").textContent = prod.descricao || "Equipamento de Proteção Individual";
    document.getElementById("det-prod-tipo").textContent = prod.tipo || s.tipoProduto || "EPI";
    document.getElementById("det-prod-ca").textContent = prod.ca || "12345";
    document.getElementById("det-prod-per").textContent = prod.periodicidade || "90 dias";
    document.getElementById("det-prod-qtd").textContent = (primeiroItem.quantidade_solicitada || prod.quantidade || 1) + " un.";

    var valorEstimado = s.valor_total_estimado || (primeiroItem.custo_unitario ? primeiroItem.custo_unitario * (primeiroItem.quantidade_solicitada || 1) : 0);
    document.getElementById("det-prod-custo").textContent = "R$ " + Number(valorEstimado).toFixed(2).replace(".", ",");

    // Histórico do colaborador
    var historicoLista = document.getElementById("det-historico-lista");
    var historico = s.historico || [];
    if (historico.length === 0) {
      historicoLista.innerHTML = '<li class="list-group-item text-muted">Nenhuma retirada anterior no período.</li>';
    } else {
      historicoLista.innerHTML = historico.map(function (h) {
        return '<li class="list-group-item d-flex justify-content-between align-items-center">' +
          '<span>' + h.data + '</span>' +
          '<span class="badge bg-light text-dark border">' + h.tipo + '</span>' +
        '</li>';
      }).join("");
    }

    // Justificativa
    var justTexto = s.justificativa || s.justificativa_solicitante || "Retirada regular de material.";
    document.getElementById("det-justificativa-texto").textContent = "“" + justTexto + "”";

    // IA
    var ia = s.analise_ia || s.ia;
    if (ia) {
      document.getElementById("ia-categoria").textContent = ia.categoria || ia.recomendacao || "Dano durante atividade";
      document.getElementById("ia-confianca").textContent = (ia.confianca || Math.round(ia.score_confianca || 89)) + "%";
      document.getElementById("ia-parecer").textContent = ia.parecer_resumo || "Justificativa compatível com solicitação de reposição operacional.";

      var fatoresEl = document.getElementById("ia-fatores");
      var fatores = ia.fatores_analisados || [
        { fator: "Análise Textual", detalhe: "Menção a dano operacional", impacto: "POSITIVO" },
        { fator: "Histórico", detalhe: "Colaborador sem histórico de perda", impacto: "POSITIVO" }
      ];
      fatoresEl.innerHTML = fatores.map(function (f) {
        var icone = f.impacto === "POSITIVO" ? "bi-check-circle-fill text-success" : "bi-exclamation-circle text-warning";
        return '<li><i class="bi ' + icone + ' me-1"></i> <strong>' + f.fator + ':</strong> ' + f.detalhe + '</li>';
      }).join("");
    } else {
      document.getElementById("ia-categoria").textContent = "Não aplicável";
      document.getElementById("ia-confianca").textContent = "—";
      document.getElementById("ia-parecer").textContent = "Retirada regular sem exigência de classificação de justificativa.";
      document.getElementById("ia-fatores").innerHTML = "<li>—</li>";
    }

    // Decisão
    var decisao = s.decisao;
    var formDecisao = document.getElementById("form-decisao-ativo");
    var infoDecisao = document.getElementById("info-decisao-concluida");

    if (decisao && s.status !== "aguardando") {
      formDecisao.classList.add("d-none");
      infoDecisao.classList.remove("d-none");
      document.getElementById("res-decisao-titulo").textContent = "Decisão Final: " + (decisao.decisao_final || decisao.status || "CONCLUÍDA").toUpperCase();
      document.getElementById("res-decisao-obs").textContent = decisao.observacao || decisao.justificativa_decisao || "Decisão confirmada.";
      document.getElementById("res-decisao-meta").textContent = "Responsável: " + (decisao.responsavel || "Gestor") + " · " + (decisao.dataHora || "Recente");
    } else {
      formDecisao.classList.remove("d-none");
      infoDecisao.classList.add("d-none");
    }
  }

  // Ações de Aprovação e Reprovação
  function submeterDecisao(decisaoFinal) {
    if (!solicitacaoAtual) return;

    var exigirDev = document.getElementById("check-exigir-devolucao").checked;
    var obs = document.getElementById("obs-decisao").value.trim();
    if (exigirDev && decisaoFinal === "aprovada" && !obs) {
      obs = "Liberado mediante devolução obrigatória do EPI antigo ao almoxarifado.";
    }

    SF.api.post("/api/solicitacoes/" + encodeURIComponent(solicitacaoAtual.id) + "/decidir/", {
      decisao: decisaoFinal,
      justificativa: obs,
      seguiu_recomendacao_ia: true,
    })
      .then(function (res) {
        if (!res.sucesso) throw new Error(res.erro || "Falha ao registrar decisão");
        alert(res.mensagem || "Decisão gravada com sucesso!");
        carregarDetalhes();
      })
      .catch(function (err) {
        alert(err.message || "Erro de conexão ao salvar decisão.");
      });
  }

  var btnAprovar = document.getElementById("btn-aprovar");
  if (btnAprovar) {
    btnAprovar.addEventListener("click", function () {
      submeterDecisao("aprovada");
    });
  }

  var btnRejeitar = document.getElementById("btn-rejeitar");
  if (btnRejeitar) {
    btnRejeitar.addEventListener("click", function () {
      var obs = document.getElementById("obs-decisao").value.trim();
      if (!obs) {
        alert("Por favor, informe a justificativa para a rejeição da solicitação.");
        document.getElementById("obs-decisao").focus();
        return;
      }
      submeterDecisao("rejeitada");
    });
  }

  carregarDetalhes();
})();

