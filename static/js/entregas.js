/* =====================================================================
   SupplyFlow — Entregas (RF-40 a RF-42 · /api/entregas/)
   ---------------------------------------------------------------------
   O almoxarife confirma a retirada física do item aprovado; o servidor
   dá baixa na reserva de estoque e impede a entrega caso ainda exista
   uma devolução obrigatória pendente para aquela solicitação.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-entregas");

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function criarLinhaTabelaVazia(quantidadeColunas, mensagem) {
    return '<tr><td colspan="' + quantidadeColunas + '" class="tabela-solicitacoes__vazio">' + escapar(mensagem) + "</td></tr>";
  }

  /* Monta a coluna de ação da tabela de entregas pendentes */
  function criarHtmlAcaoPendente(pendencia, podeEntregar) {
    if (!podeEntregar) {
      return "—";
    }
    if (pendencia.bloqueio) {
      return '<a class="btn btn-sm btn-outline-secondary" href="devolucoes.html">Ver devolução</a>';
    }
    return (
      '<button type="button" class="btn btn-sm btn-success" data-confirmar="' + escapar(pendencia.id) + '"' +
              ' aria-label="Confirmar entrega da solicitação ' + escapar(pendencia.codigo) + '">' +
        '<i class="bi bi-box-arrow-up" aria-hidden="true"></i> Confirmar entrega' +
      "</button>"
    );
  }

  function criarLinhaEntregaPendenteHtml(pendencia, podeEntregar) {
    var classeSelo = pendencia.bloqueio ? "selo--aguardando" : "selo--aprovado";
    var textoSelo = pendencia.bloqueio || pendencia.status_rotulo;
    var htmlAcao = criarHtmlAcaoPendente(pendencia, podeEntregar);

    return (
      "<tr>" +
        '<td><a class="numero" href="solicitacao.html?id=' + encodeURIComponent(pendencia.id) + '">' + escapar(pendencia.codigo) + "</a></td>" +
        '<td class="text-nowrap">' + escapar(pendencia.data) + "</td>" +
        "<td>" +
          escapar(pendencia.colaborador) +
          '<br><span class="text-muted small">' + escapar(pendencia.matricula) + " · " + escapar(pendencia.setor) + "</span>" +
        "</td>" +
        "<td>" + escapar(pendencia.produto) + "</td>" +
        "<td>" + escapar(pendencia.quantidade) + "</td>" +
        '<td><span class="selo ' + classeSelo + '">' + escapar(textoSelo) + "</span></td>" +
        '<td class="tabela-solicitacoes__acao">' + htmlAcao + "</td>" +
      "</tr>"
    );
  }

  function criarLinhaEntregaConfirmadaHtml(entrega) {
    var textoSetor = escapar(entrega.setor);
    if (entrega.centro_custo && entrega.centro_custo !== "—") {
      textoSetor += " (" + escapar(entrega.centro_custo) + ")";
    }

    return (
      "<tr>" +
        '<td class="text-nowrap">' + escapar(entrega.data) + "</td>" +
        '<td><span class="numero">' + escapar(entrega.codigo) + "</span></td>" +
        "<td>" + escapar(entrega.colaborador) + "</td>" +
        "<td>" + textoSetor + "</td>" +
        "<td>" + escapar(entrega.produto) + "</td>" +
        "<td>" + escapar(entrega.quantidade) + "</td>" +
        "<td>" + escapar(entrega.ca) + "</td>" +
        "<td>" + escapar(entrega.lote) + "</td>" +
        "<td>" + escapar(entrega.almoxarife) + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    SF.api.get("/api/entregas/")
      .then(function (dados) {
        var listaPendentes = dados.pendentes || [];
        var listaConfirmadas = dados.entregas || [];

        document.getElementById("meta-pendentes").textContent = listaPendentes.length + " pendente(s)";

        var corpoPendentes = document.getElementById("corpo-pendentes");
        if (listaPendentes.length === 0) {
          corpoPendentes.innerHTML = criarLinhaTabelaVazia(7, "Nenhuma entrega aguardando retirada.");
        } else {
          corpoPendentes.innerHTML = listaPendentes.map(function (pendencia) {
            return criarLinhaEntregaPendenteHtml(pendencia, dados.pode_entregar);
          }).join("");
        }

        var corpoConfirmadas = document.getElementById("corpo-confirmadas");
        if (listaConfirmadas.length === 0) {
          corpoConfirmadas.innerHTML = criarLinhaTabelaVazia(9, "Nenhuma entrega confirmada ainda.");
        } else {
          corpoConfirmadas.innerHTML = listaConfirmadas.map(criarLinhaEntregaConfirmadaHtml).join("");
        }
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  document.getElementById("corpo-pendentes").addEventListener("click", function (evento) {
    var botaoConfirmar = evento.target.closest("[data-confirmar]");
    if (!botaoConfirmar) {
      return;
    }
    botaoConfirmar.disabled = true;
    var urlConfirmar = "/api/entregas/" + encodeURIComponent(botaoConfirmar.dataset.confirmar) + "/confirmar/";

    SF.api.post(urlConfirmar)
      .then(function (resposta) {
        mostrarAviso(resposta.mensagem, "success");
        carregar();
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
        botaoConfirmar.disabled = false;
      });
  });

  aviso.setAttribute("tabindex", "-1");
  carregar();
})();
