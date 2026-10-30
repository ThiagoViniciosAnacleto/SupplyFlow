/* =====================================================================
   SupplyFlow — Estrutura Comum do Backoffice (Barra Lateral e Topo)
   ---------------------------------------------------------------------
   Monta a barra lateral (#sidebar) e o topo (#topbar) em todas as páginas
   do backoffice, evitando repetir o mesmo HTML em cada arquivo.

   Como cada página informa onde está:
   - data-pagina="..." no <body> identifica o arquivo atual.
   - data-menu="..." (opcional) indica qual item do menu lateral deve
     ficar marcado como ativo (usado em subpáginas como Detalhe ou Ficha).
   - data-trilha="..." (opcional) define o texto exibido na trilha de
     navegação do topo e no título da aba do navegador.
   ===================================================================== */

(function () {
  var LINK_TOTEM = "/totem/";

  var ICONE_CAPACETE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>' +
      '<path d="M14 6a6 6 0 0 1 6 6v3"/>' +
      '<path d="M4 15v-3a6 6 0 0 1 6-6"/>' +
      '<rect x="2" y="15" width="20" height="4" rx="1"/>' +
    "</svg>";

  /* ---------- Funções Utilitárias ---------- */

  /* Escapa caracteres especiais (&, <, >, ", ') para evitar XSS ao montar HTML */
  function escapar(texto) {
    var divTemporaria = document.createElement("div");
    if (texto == null) {
      divTemporaria.textContent = "";
    } else {
      divTemporaria.textContent = String(texto);
    }
    return divTemporaria.innerHTML;
  }
  SF.escapar = escapar;

  /* Transforma um título como "Centros de custo" em um ID válido "centros-de-custo" */
  function converterParaIdHtml(texto) {
    return texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  /* Monta o endereço (href) de um item do menu */
  function obterLinkDoItem(item) {
    if (item.pagina) {
      return item.pagina + ".html";
    }
    return "em-construcao.html?p=" + encodeURIComponent(item.rotulo);
  }

  /* Verifica se o perfil do usuário pode ver determinado item do menu */
  function itemPermitido(usuario, item) {
    var acaoExigida = item.acao || "ver";
    if (!usuario || !Array.isArray(usuario.acoes)) {
      return acaoExigida === "ver";
    }
    return usuario.acoes.indexOf(acaoExigida) !== -1;
  }

  /* ---------- Descoberta da Página Aberta ---------- */
  var chavePagina = document.body.dataset.pagina;
  var chaveMenu = document.body.dataset.menu || chavePagina;
  var trilhaPropria = document.body.dataset.trilha || null;
  var rotuloAtual = null;
  var grupoAtual = null;

  if (chavePagina === "em-construcao") {
    var parametrosUrl = new URLSearchParams(window.location.search);
    rotuloAtual = parametrosUrl.get("p") || "Tela em construção";
  }

  SF.menu.forEach(function (entrada) {
    if (entrada.itens) {
      entrada.itens.forEach(function (subitem) {
        if (subitem.pagina === chaveMenu || subitem.rotulo === rotuloAtual) {
          rotuloAtual = subitem.rotulo;
          grupoAtual = entrada.grupo;
        }
      });
    } else if (entrada.pagina === chaveMenu || entrada.rotulo === rotuloAtual) {
      rotuloAtual = entrada.rotulo;
    }
  });

  SF.paginaAtual = {
    rotulo: rotuloAtual,
    grupo: grupoAtual,
    trilha: trilhaPropria
  };

  var tituloAba = trilhaPropria || rotuloAtual || "Backoffice";
  document.title = tituloAba + " · SupplyFlow";

  /* ---------- Construção da Barra Lateral ---------- */
  function criarHtmlLinkMenu(item, estaDentroDeGrupo) {
    var atributoAtivo = "";
    if (item.rotulo === rotuloAtual) {
      atributoAtivo = ' aria-current="page"';
    }

    var classeIcone = item.icone;
    if (estaDentroDeGrupo) {
      classeIcone = "bi-chevron-right";
    }

    return (
      "<li>" +
        '<a class="menu__link" href="' + obterLinkDoItem(item) + '"' + atributoAtivo + ">" +
          '<i class="bi ' + classeIcone + '" aria-hidden="true"></i>' +
          escapar(item.rotulo) +
        "</a>" +
      "</li>"
    );
  }

  function criarHtmlEntradaMenu(entrada, usuario) {
    /* Caso 1: Item simples (sem submenu) */
    if (!entrada.itens) {
      if (!itemPermitido(usuario, entrada)) {
        return "";
      }
      return criarHtmlLinkMenu(entrada, false);
    }

    /* Caso 2: Grupo expansível com subitens */
    var subitensVisiveis = entrada.itens.filter(function (subitem) {
      return itemPermitido(usuario, subitem);
    });

    if (subitensVisiveis.length === 0) {
      return "";
    }

    var idGrupoHtml = "grupo-" + converterParaIdHtml(entrada.grupo);
    var htmlSubitens = subitensVisiveis.map(function (subitem) {
      return criarHtmlLinkMenu(subitem, true);
    }).join("");

    return (
      "<li>" +
        '<button class="menu__grupo" type="button" data-bs-toggle="collapse" data-bs-target="#' + idGrupoHtml + '"' +
                ' aria-expanded="true" aria-controls="' + idGrupoHtml + '">' +
          '<i class="bi ' + entrada.icone + '" aria-hidden="true"></i>' +
          escapar(entrada.grupo) +
          '<i class="bi bi-chevron-up menu__seta" aria-hidden="true"></i>' +
        "</button>" +
        '<ul class="submenu collapse show" id="' + idGrupoHtml + '">' +
          htmlSubitens +
        "</ul>" +
      "</li>"
    );
  }

  function montarLateral(usuario) {
    var itensMenuHtml = SF.menu.map(function (entrada) {
      return criarHtmlEntradaMenu(entrada, usuario);
    }).join("");

    var textoAcessoRodape = "";
    if (usuario && usuario.acesso) {
      textoAcessoRodape = usuario.acesso;
    }

    document.getElementById("sidebar").innerHTML =
      '<div class="sidebar__cabecalho">' +
        '<a class="marca" href="visao-geral.html">' +
          '<span class="marca__icone" aria-hidden="true">' + ICONE_CAPACETE + "</span>" +
          '<span><span class="marca__nome">SupplyFlow</span><span class="marca__sub">Gestão de EPIs</span></span>' +
        "</a>" +
        '<button type="button" class="btn-close btn-close-white d-lg-none" data-bs-dismiss="offcanvas"' +
                ' data-bs-target="#sidebar" aria-label="Fechar menu"></button>' +
      "</div>" +
      '<nav class="sidebar__nav" aria-label="Menu principal">' +
        '<ul class="menu">' + itensMenuHtml + "</ul>" +
      "</nav>" +
      '<div class="sidebar__rodape">' + escapar(textoAcessoRodape) + "</div>";

    /* Garante que o item ativo fique visível na rolagem da barra lateral */
    var navLateral = document.querySelector(".sidebar__nav");
    var linkAtivo = navLateral.querySelector('[aria-current="page"]');
    if (linkAtivo) {
      navLateral.scrollTop = linkAtivo.offsetTop - navLateral.clientHeight / 2;
    }
  }

  /* ---------- Construção do Topo ---------- */
  function obterTextoTrilhaTopo() {
    if (trilhaPropria) {
      return escapar(trilhaPropria);
    }
    var prefixoGrupo = "";
    if (grupoAtual) {
      prefixoGrupo = escapar(grupoAtual) + " / ";
    }
    return prefixoGrupo + escapar(rotuloAtual || "");
  }

  function montarTopo(usuario) {
    var textoTrilha = obterTextoTrilhaTopo();
    var dadosUsuario = usuario || { nome: "", iniciais: "", perfil: "" };

    document.getElementById("topbar").innerHTML =
      '<button class="topbar__menu d-lg-none" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebar"' +
              ' aria-controls="sidebar" aria-label="Abrir menu">' +
        '<i class="bi bi-list" aria-hidden="true"></i>' +
      "</button>" +
      '<nav aria-label="Você está em">' +
        '<ol class="trilha">' +
          "<li>Backoffice</li>" +
          '<li aria-current="page">' + textoTrilha + "</li>" +
        "</ol>" +
      "</nav>" +
      '<div class="topbar__acoes">' +
        '<a class="topbar__totem" href="' + LINK_TOTEM + '" aria-label="Abrir autoatendimento">' +
          '<span class="topbar__totem-texto">Abrir autoatendimento →</span>' +
          '<i class="bi bi-tablet d-md-none" aria-hidden="true"></i>' +
        "</a>" +
        '<div class="perfil">' +
          '<span class="perfil__avatar" aria-hidden="true">' + escapar(dadosUsuario.iniciais) + "</span>" +
          '<span class="perfil__texto">' +
            '<span class="perfil__nome">' + escapar(dadosUsuario.nome) + "</span>" +
            '<span class="perfil__papel">' + escapar(dadosUsuario.perfil) + "</span>" +
          "</span>" +
        "</div>" +
        '<button class="btn-sair" type="button" id="btn-sair">' +
          '<i class="bi bi-box-arrow-right" aria-hidden="true"></i>' +
          '<span class="btn-sair__texto">Sair</span>' +
        "</button>" +
      "</div>";

    /* Botão Sair: encerra a sessão no servidor e redireciona para a tela de login */
    document.getElementById("btn-sair").addEventListener("click", function () {
      SF.sessao.encerrar().then(function () {
        window.location.href = "/";
      });
    });
  }

  function montarEstrutura(usuario) {
    montarLateral(usuario);
    montarTopo(usuario);
  }

  /* 1. Desenha imediatamente com a cópia local e 2. Confirma no servidor se houve mudança */
  var usuarioEmCache = SF.sessao.usuarioAtual();
  montarEstrutura(usuarioEmCache);

  SF.sessao.confirmar().then(function (usuarioDoServidor) {
    if (JSON.stringify(usuarioDoServidor) !== JSON.stringify(usuarioEmCache)) {
      montarEstrutura(usuarioDoServidor);
    }
  }).catch(function () {
    /* Em caso de 401 (sessão expirada), SF.api redireciona automaticamente ao login */
  });
})();
