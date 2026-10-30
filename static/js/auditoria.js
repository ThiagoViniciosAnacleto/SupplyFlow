/* =====================================================================
   SupplyFlow — Trilha de Auditoria (somente ADMIN · /api/auditoria/)
   ---------------------------------------------------------------------
   Lista os eventos críticos registrados no sistema (logins, decisões,
   entregas, movimentações de estoque e alterações de cadastro) com
   filtros por tipo de ação, busca textual e período.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var corpoEventos = document.getElementById("corpo-eventos");
  var metaEventos = document.getElementById("meta-eventos");
  var seletorAcao = document.getElementById("filtro-acao");
  var acoesJaCarregadas = false;

  var CAMPOS_FILTRO = [
    { idElemento: "filtro-termo", parametroUrl: "q" },
    { idElemento: "filtro-de",    parametroUrl: "de" },
    { idElemento: "filtro-ate",   parametroUrl: "ate" }
  ];

  function criarLinhaEventoAuditoriaHtml(eventoAuditoria) {
    return (
      "<tr>" +
        '<td class="text-nowrap">' + escapar(eventoAuditoria.data) + "</td>" +
        "<td>" + escapar(eventoAuditoria.usuario) + "</td>" +
        '<td><span class="numero">' + escapar(eventoAuditoria.acao) + "</span></td>" +
        "<td>" + escapar(eventoAuditoria.descricao) + "</td>" +
        '<td class="text-nowrap">' + escapar(eventoAuditoria.ip) + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    var parametros = new URLSearchParams();
    if (seletorAcao.value) {
      parametros.set("acao", seletorAcao.value);
    }

    CAMPOS_FILTRO.forEach(function (campo) {
      var valor = document.getElementById(campo.idElemento).value.trim();
      if (valor) {
        parametros.set(campo.parametroUrl, valor);
      }
    });

    SF.api.get("/api/auditoria/?" + parametros.toString())
      .then(function (dados) {
        if (!acoesJaCarregadas) {
          (dados.acoes || []).forEach(function (codigoAcao) {
            var opcao = document.createElement("option");
            opcao.value = codigoAcao;
            opcao.textContent = codigoAcao;
            seletorAcao.appendChild(opcao);
          });
          acoesJaCarregadas = true;
        }

        var listaEventos = dados.eventos || [];
        var textoMeta = listaEventos.length + " evento(s)";
        if (listaEventos.length >= dados.limite) {
          textoMeta += " — mostrando os " + dados.limite + " mais recentes";
        }
        metaEventos.textContent = textoMeta;

        if (listaEventos.length === 0) {
          corpoEventos.innerHTML = '<tr><td colspan="5" class="tabela-solicitacoes__vazio">Nenhum evento encontrado.</td></tr>';
          return;
        }
        corpoEventos.innerHTML = listaEventos.map(criarLinhaEventoAuditoriaHtml).join("");
      })
      .catch(function (erro) {
        corpoEventos.innerHTML = '<tr><td colspan="5" class="tabela-solicitacoes__vazio">' + escapar(erro.message) + "</td></tr>";
      });
  }

  document.getElementById("form-filtro").addEventListener("submit", function (evento) {
    evento.preventDefault();
    carregar();
  });

  carregar();
})();
