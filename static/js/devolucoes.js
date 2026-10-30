/* =====================================================================
   SupplyFlow — Devoluções de EPI (RF-31 a RF-35 · /api/devolucoes/)
   ---------------------------------------------------------------------
   Controla as devoluções exigidas em aprovações condicionais.
   Enquanto a devolução estiver pendente, a entrega do novo EPI fica
   bloqueada até que o almoxarifado registre o recebimento ou um gestor
   dispense formalmente a devolução mediante justificativa.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-devolucoes");
  var modal = new bootstrap.Modal(document.getElementById("modal-devolucao"));
  var form = document.getElementById("form-devolucao");
  var idSolicitacaoAlvo = null;
  var permissoes = { registrar: false, dispensar: false };

  var MAPA_SITUACOES = {
    pendente:   { rotulo: "Devolução pendente",     selo: "selo--aguardando" },
    registrada: { rotulo: "EPI devolvido",          selo: "selo--aprovado" },
    dispensada: { rotulo: "Dispensada",             selo: "selo--condicional" },
    encerrada:  { rotulo: "Solicitação encerrada",  selo: "selo--cancelado" }
  };

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function montarOpcoesSelect(listaOpcoes) {
    var htmlItens = (listaOpcoes || []).map(function (opcao) {
      return '<option value="' + escapar(opcao.valor) + '">' + escapar(opcao.rotulo) + "</option>";
    }).join("");
    return '<option value="">Selecione…</option>' + htmlItens;
  }

  /* Monta o texto explicativo da coluna "Registro" conforme a situação da devolução */
  function formatarResumoRegistroHtml(devolucao) {
    if (devolucao.situacao === "registrada") {
      var complementoEntregaOriginal = "";
      if (devolucao.entrega_original) {
        complementoEntregaOriginal = " · entrega original " + escapar(devolucao.entrega_original);
      }
      return (
        escapar(devolucao.condicao) + " → " + escapar(devolucao.destinacao) +
        '<br><span class="text-muted small">' +
          escapar(devolucao.registrado_por) + " · " + escapar(devolucao.data_registro) +
          complementoEntregaOriginal +
        "</span>"
      );
    }

    if (devolucao.situacao === "dispensada") {
      return (
        escapar(devolucao.observacao) +
        '<br><span class="text-muted small">' +
          escapar(devolucao.registrado_por) + " · " + escapar(devolucao.data_registro) +
        "</span>"
      );
    }

    return "—";
  }

  function criarLinhaDevolucaoHtml(devolucao) {
    var infoSituacao = MAPA_SITUACOES[devolucao.situacao] || MAPA_SITUACOES.pendente;
    var htmlRegistro = formatarResumoRegistroHtml(devolucao);

    var htmlAcao = "—";
    if (devolucao.situacao === "pendente" && permissoes.registrar) {
      var textoResumoModal = devolucao.codigo + " · " + devolucao.colaborador + " · " + devolucao.produto;
      htmlAcao =
        '<button type="button" class="btn btn-sm btn-outline-primary" data-registrar="' + escapar(devolucao.id) + '"' +
                ' data-resumo="' + escapar(textoResumoModal) + '">' +
          "Registrar" +
        "</button>";
    }

    return (
      "<tr>" +
        '<td><a class="numero" href="solicitacao.html?id=' + encodeURIComponent(devolucao.id) + '">' + escapar(devolucao.codigo) + "</a></td>" +
        "<td>" + escapar(devolucao.colaborador) + '<br><span class="text-muted small">' + escapar(devolucao.matricula) + "</span></td>" +
        "<td>" + escapar(devolucao.produto) + "</td>" +
        "<td>" + escapar(devolucao.condicao_aprovacao) + '<br><span class="text-muted small">Aprovado por ' + escapar(devolucao.aprovado_por) + "</span></td>" +
        '<td><span class="selo ' + infoSituacao.selo + '">' + escapar(infoSituacao.rotulo) + "</span></td>" +
        "<td>" + htmlRegistro + "</td>" +
        '<td class="tabela-solicitacoes__acao">' + htmlAcao + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    SF.api.get("/api/devolucoes/")
      .then(function (dados) {
        permissoes = {
          registrar: dados.pode_registrar,
          dispensar: dados.pode_dispensar
        };

        document.getElementById("dev-condicao").innerHTML = montarOpcoesSelect(dados.condicoes);
        document.getElementById("dev-destinacao").innerHTML = montarOpcoesSelect(dados.destinacoes);
        document.getElementById("opcao-dispensar").classList.toggle("d-none", !dados.pode_dispensar);

        var listaDevolucoes = dados.devolucoes || [];
        var corpo = document.getElementById("corpo-devolucoes");
        if (listaDevolucoes.length === 0) {
          corpo.innerHTML = '<tr><td colspan="7" class="tabela-solicitacoes__vazio">Nenhuma devolução exigida até agora.</td></tr>';
          return;
        }
        corpo.innerHTML = listaDevolucoes.map(criarLinhaDevolucaoHtml).join("");
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  function obterModoSelecionado() {
    return form.querySelector('input[name="modo"]:checked').value;
  }

  function atualizarCamposConformeModo() {
    var ehModoDispensar = (obterModoSelecionado() === "dispensar");
    document.getElementById("campos-devolucao").classList.toggle("d-none", ehModoDispensar);
    document.getElementById("obs-obrigatoria").classList.toggle("d-none", !ehModoDispensar);
  }

  form.querySelectorAll('input[name="modo"]').forEach(function (radioModo) {
    radioModo.addEventListener("change", atualizarCamposConformeModo);
  });

  document.getElementById("corpo-devolucoes").addEventListener("click", function (evento) {
    var botaoRegistrar = evento.target.closest("[data-registrar]");
    if (!botaoRegistrar) {
      return;
    }
    idSolicitacaoAlvo = botaoRegistrar.dataset.registrar;
    form.reset();
    atualizarCamposConformeModo();
    document.getElementById("erro-devolucao").textContent = "";
    document.getElementById("modal-resumo").textContent = botaoRegistrar.dataset.resumo;
    modal.show();
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var ehModoDispensar = (obterModoSelecionado() === "dispensar");
    var dadosEnvio = {
      dispensar: ehModoDispensar,
      condicao: document.getElementById("dev-condicao").value,
      destinacao: document.getElementById("dev-destinacao").value,
      observacao: document.getElementById("dev-observacao").value.trim()
    };

    var caixaErro = document.getElementById("erro-devolucao");
    if (ehModoDispensar && !dadosEnvio.observacao) {
      caixaErro.textContent = "Explique por que a devolução está sendo dispensada.";
      return;
    }
    if (!ehModoDispensar && (!dadosEnvio.condicao || !dadosEnvio.destinacao)) {
      caixaErro.textContent = "Informe a condição e a destinação.";
      return;
    }

    var botaoSalvar = document.getElementById("btn-salvar-devolucao");
    botaoSalvar.disabled = true;

    SF.api.post("/api/devolucoes/" + encodeURIComponent(idSolicitacaoAlvo) + "/registrar/", dadosEnvio)
      .then(function (resposta) {
        modal.hide();
        mostrarAviso(resposta.mensagem, "success");
        carregar();
      })
      .catch(function (erro) {
        caixaErro.textContent = erro.message;
      })
      .finally(function () {
        botaoSalvar.disabled = false;
      });
  });

  carregar();
})();
