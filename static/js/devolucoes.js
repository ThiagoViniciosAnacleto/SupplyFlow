/* =====================================================================
   SupplyFlow — Devoluções de EPI (RF-31 a RF-35)
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-devolucoes");
  var modal = new bootstrap.Modal(document.getElementById("modal-devolucao"));
  var form = document.getElementById("form-devolucao");
  var alvo = null;
  var permissoes = { registrar: false, dispensar: false };

  var SITUACOES = {
    pendente: { rotulo: "Devolução pendente", selo: "selo--aguardando" },
    registrada: { rotulo: "EPI devolvido", selo: "selo--aprovado" },
    dispensada: { rotulo: "Dispensada", selo: "selo--condicional" },
    encerrada: { rotulo: "Solicitação encerrada", selo: "selo--cancelado" }
  };

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function opcoes(lista) {
    return '<option value="">Selecione…</option>' + lista.map(function (o) {
      return '<option value="' + escapar(o.valor) + '">' + escapar(o.rotulo) + "</option>";
    }).join("");
  }

  function carregar() {
    SF.api.get("/api/devolucoes/").then(function (d) {
      permissoes = { registrar: d.pode_registrar, dispensar: d.pode_dispensar };
      document.getElementById("dev-condicao").innerHTML = opcoes(d.condicoes);
      document.getElementById("dev-destinacao").innerHTML = opcoes(d.destinacoes);
      document.getElementById("opcao-dispensar").classList.toggle("d-none", !d.pode_dispensar);

      document.getElementById("corpo-devolucoes").innerHTML = d.devolucoes.length ? d.devolucoes.map(function (v) {
        var sit = SITUACOES[v.situacao];
        var registro = v.situacao === "registrada"
          ? escapar(v.condicao) + " → " + escapar(v.destinacao) + '<br><span class="text-muted small">' +
            escapar(v.registrado_por) + " · " + escapar(v.data_registro) +
            (v.entrega_original ? " · entrega original " + escapar(v.entrega_original) : "") + "</span>"
          : v.situacao === "dispensada"
            ? escapar(v.observacao) + '<br><span class="text-muted small">' + escapar(v.registrado_por) + " · " + escapar(v.data_registro) + "</span>"
            : "—";
        var acao = v.situacao === "pendente" && permissoes.registrar
          ? '<button type="button" class="btn btn-sm btn-outline-primary" data-registrar="' + escapar(v.id) + '"' +
            ' data-resumo="' + escapar(v.codigo + " · " + v.colaborador + " · " + v.produto) + '">Registrar</button>'
          : "—";
        return "<tr>" +
          '<td><a class="numero" href="solicitacao.html?id=' + encodeURIComponent(v.id) + '">' + escapar(v.codigo) + "</a></td>" +
          "<td>" + escapar(v.colaborador) + '<br><span class="text-muted small">' + escapar(v.matricula) + "</span></td>" +
          "<td>" + escapar(v.produto) + "</td>" +
          "<td>" + escapar(v.condicao_aprovacao) + '<br><span class="text-muted small">Aprovado por ' + escapar(v.aprovado_por) + "</span></td>" +
          '<td><span class="selo ' + sit.selo + '">' + escapar(sit.rotulo) + "</span></td>" +
          "<td>" + registro + "</td>" +
          '<td class="tabela-solicitacoes__acao">' + acao + "</td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="7" class="tabela-solicitacoes__vazio">Nenhuma devolução exigida até agora.</td></tr>';
    }).catch(function (erro) { mostrarAviso(erro.message, "danger"); });
  }

  function modoAtual() { return form.querySelector('input[name="modo"]:checked').value; }

  function atualizarModo() {
    var dispensar = modoAtual() === "dispensar";
    document.getElementById("campos-devolucao").classList.toggle("d-none", dispensar);
    document.getElementById("obs-obrigatoria").classList.toggle("d-none", !dispensar);
  }
  form.querySelectorAll('input[name="modo"]').forEach(function (r) { r.addEventListener("change", atualizarModo); });

  document.getElementById("corpo-devolucoes").addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-registrar]");
    if (!botao) return;
    alvo = botao.dataset.registrar;
    form.reset();
    atualizarModo();
    document.getElementById("erro-devolucao").textContent = "";
    document.getElementById("modal-resumo").textContent = botao.dataset.resumo;
    modal.show();
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var dispensar = modoAtual() === "dispensar";
    var dados = {
      dispensar: dispensar,
      condicao: document.getElementById("dev-condicao").value,
      destinacao: document.getElementById("dev-destinacao").value,
      observacao: document.getElementById("dev-observacao").value.trim()
    };
    var erro = document.getElementById("erro-devolucao");
    if (dispensar && !dados.observacao) { erro.textContent = "Explique por que a devolução está sendo dispensada."; return; }
    if (!dispensar && (!dados.condicao || !dados.destinacao)) { erro.textContent = "Informe a condição e a destinação."; return; }

    var botao = document.getElementById("btn-salvar-devolucao");
    botao.disabled = true;
    SF.api.post("/api/devolucoes/" + encodeURIComponent(alvo) + "/registrar/", dados)
      .then(function (r) { modal.hide(); mostrarAviso(r.mensagem, "success"); carregar(); })
      .catch(function (e) { erro.textContent = e.message; })
      .finally(function () { botao.disabled = false; });
  });

  carregar();
})();
