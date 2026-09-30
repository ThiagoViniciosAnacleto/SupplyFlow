/* =====================================================================
   SupplyFlow — estrutura comum do backoffice
   ---------------------------------------------------------------------
   Monta a barra lateral e o topo em TODAS as páginas do backoffice,
   para não repetir o mesmo HTML em cada arquivo. No Django, isto vira
   o template base (base.html) com {% block conteudo %}.

   Cada página diz quem ela é pelo atributo data-pagina do <body>.
   A página "em-construcao" recebe o nome da tela pelo endereço (?p=).

   Páginas que não estão no menu (ex.: o detalhe de uma solicitação)
   podem usar dois atributos opcionais no <body>:
     data-menu="solicitacoes"  -> qual item do menu fica ativo
     data-trilha="Detalhe"     -> texto da trilha no topo e do título da aba
   ===================================================================== */

(function () {
  var usuario = SF.sessao.usuarioAtual();
  var LINK_TOTEM = "em-construcao.html?p=" + encodeURIComponent("Autoatendimento (totem)");

  var ICONE_CAPACETE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M14 6a6 6 0 0 1 6 6v3"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><rect x="2" y="15" width="20" height="4" rx="1"/></svg>';

  /* ---------- Utilitários ---------- */
  function escapar(texto) {
    var div = document.createElement("div");
    div.textContent = texto;
    return div.innerHTML;
  }
  SF.escapar = escapar; // as páginas também usam ao montar HTML com dados

  /* "Centros de custo" -> "centros-de-custo" (para ids de HTML) */
  function paraId(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function linkDoItem(item) {
    return item.pagina ? item.pagina + ".html" : "em-construcao.html?p=" + encodeURIComponent(item.rotulo);
  }

  /* ---------- Qual página está aberta? ---------- */
  var chavePagina = document.body.dataset.pagina;
  var chaveMenu = document.body.dataset.menu || chavePagina; // item do menu que fica ativo
  var trilhaPropria = document.body.dataset.trilha || null;
  var rotuloAtual = null;
  var grupoAtual = null;

  if (chavePagina === "em-construcao") {
    rotuloAtual = new URLSearchParams(window.location.search).get("p") || "Tela em construção";
  }

  SF.menu.forEach(function (entrada) {
    if (entrada.itens) {
      entrada.itens.forEach(function (item) {
        if (item.pagina === chaveMenu || item.rotulo === rotuloAtual) {
          rotuloAtual = item.rotulo;
          grupoAtual = entrada.grupo;
        }
      });
    } else if (entrada.pagina === chaveMenu || entrada.rotulo === rotuloAtual) {
      rotuloAtual = entrada.rotulo;
    }
  });

  SF.paginaAtual = { rotulo: rotuloAtual, grupo: grupoAtual, trilha: trilhaPropria };
  document.title = (trilhaPropria || rotuloAtual || "Backoffice") + " · SupplyFlow";

  /* ---------- Barra lateral ---------- */
  function htmlLink(item, dentroDeGrupo) {
    var ativo = item.rotulo === rotuloAtual ? ' aria-current="page"' : "";
    var icone = dentroDeGrupo ? "bi-chevron-right" : item.icone;
    return '<li><a class="menu__link" href="' + linkDoItem(item) + '"' + ativo + ">" +
      '<i class="bi ' + icone + '" aria-hidden="true"></i>' + escapar(item.rotulo) + "</a></li>";
  }

  var itensMenu = SF.menu.map(function (entrada) {
    if (!entrada.itens) return htmlLink(entrada, false);

    var id = "grupo-" + paraId(entrada.grupo);
    return "<li>" +
      '<button class="menu__grupo" type="button" data-bs-toggle="collapse" data-bs-target="#' + id + '"' +
      ' aria-expanded="true" aria-controls="' + id + '">' +
        '<i class="bi ' + entrada.icone + '" aria-hidden="true"></i>' + escapar(entrada.grupo) +
        '<i class="bi bi-chevron-up menu__seta" aria-hidden="true"></i>' +
      "</button>" +
      '<ul class="submenu collapse show" id="' + id + '">' +
        entrada.itens.map(function (item) { return htmlLink(item, true); }).join("") +
      "</ul></li>";
  }).join("");

  document.getElementById("sidebar").innerHTML =
    '<div class="sidebar__cabecalho">' +
      '<a class="marca" href="visao-geral.html">' +
        '<span class="marca__icone" aria-hidden="true">' + ICONE_CAPACETE + "</span>" +
        '<span><span class="marca__nome">SupplyFlow</span><span class="marca__sub">Gestão de EPIs</span></span>' +
      "</a>" +
      '<button type="button" class="btn-close btn-close-white d-lg-none" data-bs-dismiss="offcanvas"' +
      ' data-bs-target="#sidebar" aria-label="Fechar menu"></button>' +
    "</div>" +
    '<nav class="sidebar__nav" aria-label="Menu principal"><ul class="menu">' + itensMenu + "</ul></nav>" +
    '<div class="sidebar__rodape">' + escapar(usuario.acesso) + "</div>";

  /* Deixa o item ativo visível dentro da lateral (útil nos itens lá de baixo) */
  var navLateral = document.querySelector(".sidebar__nav");
  var linkAtivo = navLateral.querySelector('[aria-current="page"]');
  if (linkAtivo) {
    navLateral.scrollTop = linkAtivo.offsetTop - navLateral.clientHeight / 2;
  }

  /* ---------- Topo ---------- */
  var trilha = trilhaPropria
    ? escapar(trilhaPropria)
    : (grupoAtual ? escapar(grupoAtual) + " / " : "") + escapar(rotuloAtual || "");

  document.getElementById("topbar").innerHTML =
    '<button class="topbar__menu d-lg-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebar"' +
    ' aria-controls="sidebar" aria-label="Abrir menu"><i class="bi bi-list" aria-hidden="true"></i></button>' +
    '<nav aria-label="Você está em"><ol class="trilha">' +
      "<li>Backoffice</li>" +
      '<li aria-current="page">' + trilha + "</li>" +
    "</ol></nav>" +
    '<div class="topbar__acoes">' +
      '<a class="topbar__totem" href="' + LINK_TOTEM + '" aria-label="Abrir autoatendimento">' +
        '<span class="topbar__totem-texto">Abrir autoatendimento →</span>' +
        '<i class="bi bi-tablet d-md-none" aria-hidden="true"></i>' +
      "</a>" +
      '<div class="perfil">' +
        '<span class="perfil__avatar" aria-hidden="true">' + escapar(usuario.iniciais) + "</span>" +
        '<span class="perfil__texto">' +
          '<span class="perfil__nome">' + escapar(usuario.nome) + "</span>" +
          '<span class="perfil__papel">' + escapar(usuario.perfil) + "</span>" +
        "</span>" +
      "</div>" +
      '<button class="btn-sair" type="button" id="btn-sair">' +
        '<i class="bi bi-box-arrow-right" aria-hidden="true"></i><span class="btn-sair__texto">Sair</span>' +
      "</button>" +
    "</div>";

  /* ---------- Sair: limpa a sessão fictícia e volta ao login ---------- */
  document.getElementById("btn-sair").addEventListener("click", function () {
    SF.sessao.encerrar();
    window.location.href = "../index.html";
  });
})();
