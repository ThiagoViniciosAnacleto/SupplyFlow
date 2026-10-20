/* =====================================================================
   SupplyFlow — Detalhe da solicitação e decisão
   ---------------------------------------------------------------------
   Lê /api/solicitacoes/<id>/ e envia a decisão para .../decidir/.
   A IA só sugere a categoria; quem aprova, aprova com condição ou
   rejeita é sempre a pessoa logada (o servidor confere o perfil).
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var id = new URLSearchParams(window.location.search).get("id") || "";
  var atual = null;

  var SELOS = {
    "aguardando": "selo--aguardando",
    "aprovada": "selo--aprovado",
    "aprovada-condicao": "selo--condicional",
    "rejeitada": "selo--rejeitado",
    "cancelada": "selo--cancelado",
    "entregue": "selo--entregue"
  };

  function el(idElemento) { return document.getElementById(idElemento); }

  /* Lista de pares rótulo/valor; valor vazio vira "—" (nada de dado inventado) */
  function dados(pares) {
    return pares.map(function (p) {
      var valor = p[1] === null || p[1] === undefined || p[1] === "" ? "—" : p[1];
      return "<div><dt>" + escapar(p[0]) + "</dt><dd>" + escapar(valor) + "</dd></div>";
    }).join("");
  }

  function mostrarNaoEncontrada(texto) {
    el("conteudo-detalhe").classList.add("d-none");
    el("nao-encontrada").classList.remove("d-none");
    if (texto) el("nao-encontrada-texto").textContent = texto;
  }

  function renderizar(s, categorias) {
    atual = s;
    el("conteudo-detalhe").classList.remove("d-none");
    document.title = "Solicitação " + s.codigo + " · SupplyFlow";

    el("det-codigo").textContent = s.codigo;
    var selo = el("det-status");
    selo.className = "selo " + (SELOS[s.status] || "selo--aguardando");
    selo.textContent = s.status_rotulo;
    el("det-motivo").textContent = s.motivo;
    el("det-data-hora").textContent = s.data + ", " + s.hora;

    var f = s.solicitante;
    el("dados-funcionario").innerHTML = dados([
      ["Nome", f.nome], ["Matrícula", f.matricula], ["Função", f.cargo],
      ["Centro de custo", f.setor ? f.setor + (f.centro_custo ? " (" + f.centro_custo + ")" : "") : null]
    ]);

    el("link-ficha").href = "ficha-epi.html?id=" + encodeURIComponent(f.id);

    var p = s.produto;
    el("det-prod-nome").textContent = p.nome || "—";
    el("det-prod-tipo").textContent = p.tipo || "";
    el("dados-produto").innerHTML = dados([
      ["Descrição", p.descricao], ["CA", p.ca], ["Validade do CA", p.validade_ca], ["Tamanho", p.tamanho],
      ["Quantidade", p.quantidade != null ? p.quantidade + " " + (p.unidade || "") : null]
    ]);

    var r = s.regra || {};
    el("dados-regra").innerHTML = dados([
      ["Escopo", r.origem],
      ["Periodicidade", r.periodicidade_dias ? r.periodicidade_dias + " dias" : null],
      ["Limite mensal", r.limite_mensal != null ? r.limite_mensal + " un." : null],
      ["Exceção", r.excecao]
    ]);

    el("det-historico").innerHTML = s.historico.length
      ? s.historico.map(function (h) {
          return '<li><span class="numero">' + escapar(h.data) + "</span><span>" + escapar(h.tipo) +
            " · " + escapar(h.quantidade) + " un. · " + escapar(h.solicitacao) + "</span></li>";
        }).join("")
      : "<li>Nenhuma entrega anterior deste item.</li>";

    el("det-justificativa").textContent = s.justificativa ? "“" + s.justificativa + "”" : "Retirada regular — sem justificativa.";
    el("det-justificativa").classList.toggle("citacao--vazia", !s.justificativa);

    renderizarIA(s, categorias);
    renderizarDecisao(s);
  }

  function renderizarIA(s, categorias) {
    var ia = s.ia;
    var cartao = el("cartao-ia");
    if (!ia) {
      cartao.querySelector(".cartao__corpo").innerHTML =
        '<p class="mb-0 text-muted">A IA só analisa justificativas de solicitações excepcionais. Esta é uma retirada regular.</p>';
      return;
    }
    el("ia-categoria").textContent = ia.categoria || "—";
    el("ia-confianca").textContent = ia.confianca != null ? Math.round(ia.confianca) + "%" : "—";
    var fontes = {
      "modelo": "Modelo " + ia.modelo_versao + (ia.termos && ia.termos.length ? " · termos que mais pesaram: " + ia.termos.join(", ") : ""),
      "palavras-chave": "Linha de base por palavras-chave (modelo treinado indisponível): sem estimativa de confiança.",
      "legado": "Classificação feita pela versão anterior do sistema."
    };
    el("ia-fonte").textContent = fontes[ia.fonte] || "";

    var seletor = el("reclassificar");
    seletor.innerHTML = categorias.map(function (c) {
      return '<option value="' + escapar(c) + '"' + (c === ia.categoria ? " selected" : "") + ">" + escapar(c) + "</option>";
    }).join("");

    var d = s.decisao;
    var mostrarSeletor = s.pode_decidir;
    el("bloco-reclassificar").classList.toggle("d-none", !mostrarSeletor);
    var quadro = el("ia-categorias-decisao");
    if (d && d.categoria_confirmada) {
      quadro.classList.remove("d-none");
      quadro.innerHTML = d.reclassificada
        ? dados([["Sugerida pela IA", d.categoria_ia], ["Confirmada pelo responsável", d.categoria_confirmada]])
        : dados([["Categoria confirmada", d.categoria_confirmada + " (igual à sugerida)"]]);
    } else {
      quadro.classList.add("d-none");
    }
  }

  function renderizarDecisao(s) {
    var form = el("form-decisao");
    var resultado = el("decisao-tomada");
    var semPermissao = el("sem-permissao");
    form.classList.toggle("d-none", !s.pode_decidir);
    semPermissao.classList.toggle("d-none", s.pode_decidir || !!s.decisao || s.status !== "aguardando");

    var d = s.decisao;
    if (!d) {
      resultado.classList.add("d-none");
      return;
    }
    var linhas = [
      "<strong>" + escapar(d.rotulo) + "</strong> por " + escapar(d.responsavel || "—") + " em " + escapar(d.data_hora)
    ];
    if (d.observacao) linhas.push("Observação: " + escapar(d.observacao));
    if (d.exige_devolucao) {
      var dev = s.devolucao || {};
      linhas.push("Condição: devolução do EPI anterior — <strong>" + escapar(dev.rotulo || "pendente") + "</strong>" +
        (dev.condicao ? " (" + escapar(dev.condicao) + ", destino: " + escapar(dev.destinacao) + ")" : ""));
    }
    resultado.innerHTML = '<div class="alert alert-light border mb-0">' + linhas.join("<br>") + "</div>";
    resultado.classList.remove("d-none");
  }

  /* ---------- Envio da decisão ---------- */
  function mostrarErro(texto, campo) {
    var caixa = el("erro-decisao");
    caixa.textContent = texto;
    ["observacao", "exigir-devolucao"].forEach(function (c) {
      el(c).removeAttribute("aria-invalid");
      el(c).classList.remove("is-invalid");
    });
    if (campo) {
      campo.forEach(function (c) {
        el(c).setAttribute("aria-invalid", "true");
        el(c).classList.add("is-invalid");
        el(c).setAttribute("aria-describedby", "erro-decisao");
      });
      el(campo[0]).focus();
    }
  }

  function travar(travado) {
    document.querySelectorAll("[data-decisao]").forEach(function (b) { b.disabled = travado; });
  }

  el("form-decisao").addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-decisao]");
    if (!botao || !atual) return;
    var decisao = botao.dataset.decisao;
    var observacao = el("observacao").value.trim();
    var exige = el("exigir-devolucao").checked;
    mostrarErro("");

    // Mesmas regras do servidor, só para avisar antes de enviar
    if (decisao === "rejeitar" && !observacao) {
      mostrarErro("Para rejeitar, explique o motivo na observação.", ["observacao"]);
      return;
    }
    if (decisao === "aprovar_condicao" && !exige && !observacao) {
      mostrarErro("Para aprovar com condição, marque a devolução do EPI ou descreva a condição na observação.",
        ["exigir-devolucao", "observacao"]);
      return;
    }
    if (decisao === "aprovar" && exige) {
      mostrarErro("A devolução marcada é uma condição: use “Aprovar com condição” ou desmarque-a.", ["exigir-devolucao"]);
      return;
    }

    travar(true);
    var seletor = el("reclassificar");
    SF.api.post("/api/solicitacoes/" + encodeURIComponent(atual.id) + "/decidir/", {
      decisao: decisao,
      observacao: observacao,
      exige_devolucao: exige,
      categoria_confirmada: atual.ia && seletor ? seletor.value : ""
    })
      .then(function (resposta) {
        renderizar(resposta.solicitacao, []);
        el("decisao-tomada").focus();
      })
      .catch(function (erro) {
        mostrarErro(erro.message);
        travar(false);
      });
  });

  /* ---------- Carga ---------- */
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    mostrarNaoEncontrada("Abra uma solicitação a partir da lista.");
    return;
  }
  SF.api.get("/api/solicitacoes/" + encodeURIComponent(id) + "/")
    .then(function (resposta) { renderizar(resposta.solicitacao, resposta.categorias); })
    .catch(function (erro) { mostrarNaoEncontrada(erro.status === 404 ? null : erro.message); });
})();
