/* =====================================================================
   SupplyFlow — Auditoria (somente ADMIN)
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var corpo = document.getElementById("corpo-eventos");
  var meta = document.getElementById("meta-eventos");
  var seletorAcao = document.getElementById("filtro-acao");
  var acoesCarregadas = false;

  function carregar() {
    var params = new URLSearchParams();
    if (seletorAcao.value) params.set("acao", seletorAcao.value);
    ["termo:q", "de:de", "ate:ate"].forEach(function (par) {
      var partes = par.split(":");
      var valor = document.getElementById("filtro-" + partes[0]).value.trim();
      if (valor) params.set(partes[1], valor);
    });

    SF.api.get("/api/auditoria/?" + params.toString())
      .then(function (dados) {
        if (!acoesCarregadas) {
          dados.acoes.forEach(function (acao) {
            var opcao = document.createElement("option");
            opcao.value = acao;
            opcao.textContent = acao;
            seletorAcao.appendChild(opcao);
          });
          acoesCarregadas = true;
        }
        meta.textContent = dados.eventos.length + " evento(s)" +
          (dados.eventos.length >= dados.limite ? " — mostrando os " + dados.limite + " mais recentes" : "");
        corpo.innerHTML = dados.eventos.length ? dados.eventos.map(function (e) {
          return "<tr>" +
            '<td class="text-nowrap">' + escapar(e.data) + "</td>" +
            "<td>" + escapar(e.usuario) + "</td>" +
            '<td><span class="numero">' + escapar(e.acao) + "</span></td>" +
            "<td>" + escapar(e.descricao) + "</td>" +
            '<td class="text-nowrap">' + escapar(e.ip) + "</td>" +
          "</tr>";
        }).join("") : '<tr><td colspan="5" class="tabela-solicitacoes__vazio">Nenhum evento encontrado.</td></tr>';
      })
      .catch(function (erro) {
        corpo.innerHTML = '<tr><td colspan="5" class="tabela-solicitacoes__vazio">' + escapar(erro.message) + "</td></tr>";
      });
  }

  document.getElementById("form-filtro").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });

  carregar();
})();
