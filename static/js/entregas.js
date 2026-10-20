/* =====================================================================
   SupplyFlow — Entregas (RF-40 a RF-42)
   O almoxarife confirma a retirada física; o servidor dá baixa no estoque
   e recusa (com o motivo) quando a entrega não é permitida.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-entregas");

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function vazio(colunas, texto) {
    return '<tr><td colspan="' + colunas + '" class="tabela-solicitacoes__vazio">' + escapar(texto) + "</td></tr>";
  }

  function carregar() {
    SF.api.get("/api/entregas/")
      .then(function (d) {
        document.getElementById("meta-pendentes").textContent = d.pendentes.length + " pendente(s)";
        document.getElementById("corpo-pendentes").innerHTML = d.pendentes.length ? d.pendentes.map(function (p) {
          var acao = !d.pode_entregar ? "—" : p.bloqueio
            ? '<a class="btn btn-sm btn-outline-secondary" href="devolucoes.html">Ver devolução</a>'
            : '<button type="button" class="btn btn-sm btn-success" data-confirmar="' + escapar(p.id) + '"' +
              ' aria-label="Confirmar entrega da solicitação ' + escapar(p.codigo) + '">' +
              '<i class="bi bi-box-arrow-up" aria-hidden="true"></i> Confirmar entrega</button>';
          return "<tr>" +
            '<td><a class="numero" href="solicitacao.html?id=' + encodeURIComponent(p.id) + '">' + escapar(p.codigo) + "</a></td>" +
            '<td class="text-nowrap">' + escapar(p.data) + "</td>" +
            "<td>" + escapar(p.colaborador) + '<br><span class="text-muted small">' + escapar(p.matricula) + " · " + escapar(p.setor) + "</span></td>" +
            "<td>" + escapar(p.produto) + "</td>" +
            "<td>" + escapar(p.quantidade) + "</td>" +
            '<td><span class="selo ' + (p.bloqueio ? "selo--aguardando" : "selo--aprovado") + '">' +
              escapar(p.bloqueio || p.status_rotulo) + "</span></td>" +
            '<td class="tabela-solicitacoes__acao">' + acao + "</td>" +
          "</tr>";
        }).join("") : vazio(7, "Nenhuma entrega aguardando retirada.");

        document.getElementById("corpo-confirmadas").innerHTML = d.entregas.length ? d.entregas.map(function (e) {
          return "<tr>" +
            '<td class="text-nowrap">' + escapar(e.data) + "</td>" +
            '<td><span class="numero">' + escapar(e.codigo) + "</span></td>" +
            "<td>" + escapar(e.colaborador) + "</td>" +
            "<td>" + escapar(e.setor) + (e.centro_custo !== "—" ? " (" + escapar(e.centro_custo) + ")" : "") + "</td>" +
            "<td>" + escapar(e.produto) + "</td>" +
            "<td>" + escapar(e.quantidade) + "</td>" +
            "<td>" + escapar(e.ca) + "</td>" +
            "<td>" + escapar(e.lote) + "</td>" +
            "<td>" + escapar(e.almoxarife) + "</td>" +
          "</tr>";
        }).join("") : vazio(9, "Nenhuma entrega confirmada ainda.");
      })
      .catch(function (erro) { mostrarAviso(erro.message, "danger"); });
  }

  document.getElementById("corpo-pendentes").addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-confirmar]");
    if (!botao) return;
    botao.disabled = true;
    SF.api.post("/api/entregas/" + encodeURIComponent(botao.dataset.confirmar) + "/confirmar/")
      .then(function (r) { mostrarAviso(r.mensagem, "success"); carregar(); })
      .catch(function (erro) { mostrarAviso(erro.message, "danger"); botao.disabled = false; });
  });

  aviso.setAttribute("tabindex", "-1");
  carregar();
})();
