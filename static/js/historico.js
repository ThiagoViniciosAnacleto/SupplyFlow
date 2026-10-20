/* =====================================================================
   SupplyFlow — Histórico com filtros e exportação CSV
   ===================================================================== */

(function () {
  var esc = SF.escapar;
  var corpo = document.getElementById("corpo-historico");
  var filtrosCarregados = false;
  var CAMPOS = { "f-tipo": "tipo", "f-de": "de", "f-ate": "ate", "f-funcionario": "funcionario", "f-setor": "setor",
                 "f-produto": "produto", "f-status": "status", "f-responsavel": "responsavel" };

  function parametros() {
    var p = new URLSearchParams();
    Object.keys(CAMPOS).forEach(function (id) {
      var valor = document.getElementById(id).value.trim();
      if (valor) p.set(CAMPOS[id], valor);
    });
    return p;
  }

  function preencher(id, opcoes) {
    var select = document.getElementById(id);
    opcoes.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.valor || o.id;
      opt.textContent = o.rotulo || o.nome;
      select.appendChild(opt);
    });
  }

  function carregar() {
    var p = parametros();
    document.getElementById("btn-csv").href = "/api/historico/?" + p.toString() + (p.toString() ? "&" : "") + "formato=csv";
    corpo.innerHTML = '<tr><td colspan="9" class="tabela-solicitacoes__vazio">Carregando…</td></tr>';
    SF.api.get("/api/historico/?" + p.toString()).then(function (d) {
      if (!filtrosCarregados) {
        preencher("f-tipo", d.filtros.tipos);
        preencher("f-setor", d.filtros.setores);
        preencher("f-produto", d.filtros.produtos);
        preencher("f-status", d.filtros.status);
        filtrosCarregados = true;
      }
      document.getElementById("meta-historico").textContent = d.linhas.length + " registro(s)" +
        (d.linhas.length >= d.limite ? " — mostrando os " + d.limite + " mais recentes; refine os filtros" : "");
      corpo.innerHTML = d.linhas.length ? d.linhas.map(function (l) {
        return "<tr>" +
          '<td class="text-nowrap">' + esc(l.data) + "</td>" +
          '<td><span class="selo selo--neutro">' + esc(l.tipo_rotulo) + "</span></td>" +
          "<td>" + (l.funcionario ? esc(l.funcionario) + '<span class="small text-muted d-block">' + esc(l.matricula) + "</span>" : "—") + "</td>" +
          "<td>" + esc(l.centro_custo || l.setor || "—") + "</td>" +
          "<td>" + esc(l.produto || "—") + "</td>" +
          "<td>" + esc(l.quantidade != null ? l.quantidade : "—") + "</td>" +
          "<td>" + esc([l.ca, l.lote].filter(Boolean).join(" / ") || "—") + "</td>" +
          "<td>" + esc(l.responsavel || "—") + "</td>" +
          "<td>" + (l.solicitacao ? '<span class="numero">' + esc(l.solicitacao) + "</span> " : "") + esc(l.detalhe) + "</td>" +
        "</tr>";
      }).join("") : '<tr><td colspan="9" class="tabela-solicitacoes__vazio">Nenhum registro com esses filtros.</td></tr>';
    }).catch(function (e) {
      corpo.innerHTML = '<tr><td colspan="9" class="tabela-solicitacoes__vazio" role="alert">' + esc(e.message) + "</td></tr>";
    });
  }

  document.getElementById("form-filtros").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });
  carregar();
})();
