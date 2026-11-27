/* =====================================================================
   SupplyFlow — Gestão de Funcionários Operacionais e Ciclo de Vida RH
   ---------------------------------------------------------------------
   Gerencia o Domínio 1 (Funcionários Operacionais / Totem):
   - Cadastro e edição com Cargo (RH), Função/Atividade (SST),
     Habilitações/NRs com validade, Grade de Tamanhos (Calçado, Luva,
     Vestimenta), PIN provisório de 1º acesso e Kit Admissional de EPIs.
   - Mudança de Cargo/Função / Transferência de Setor com geração de Kit.
   - Checklist de Desligamento, cancelamento de reservas e Termo Nada Consta.
   - Importação em lote via CSV/planilha.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var tabelaCorpo = document.getElementById("tabela-funcionarios-corpo");
  var filtroTermo = document.getElementById("filtro-termo");
  var filtroSetor = document.getElementById("filtro-setor");
  var filtroDominio = document.getElementById("filtro-dominio");
  var btnFiltrar = document.getElementById("btn-filtrar");
  var btnNovoFunc = document.getElementById("btn-novo-funcionario");
  var btnImportarCsv = document.getElementById("btn-importar-csv");

  var modalEl = document.getElementById("modal-funcionario");
  var formFunc = document.getElementById("form-funcionario");
  var selectPerfil = document.getElementById("func-perfil");
  var campoEmail = document.getElementById("func-email");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;

  var inputHabNome = document.getElementById("hab-nome-input");
  var inputHabValidade = document.getElementById("hab-validade-input");
  var btnAddHab = document.getElementById("btn-add-hab");
  var listaTagsHabs = document.getElementById("lista-tags-habilitacoes");
  var habilitacoesModal = [];

  var modalMudarFuncaoEl = document.getElementById("modal-mudar-funcao");
  var formMudarFuncao = document.getElementById("form-mudar-funcao");
  var modalMudarFuncaoBs = modalMudarFuncaoEl ? new bootstrap.Modal(modalMudarFuncaoEl) : null;

  var modalDesligamentoEl = document.getElementById("modal-desligamento");
  var btnConfirmarDesligamento = document.getElementById("btn-confirmar-desligamento");
  var modalDesligamentoBs = modalDesligamentoEl ? new bootstrap.Modal(modalDesligamentoEl) : null;

  var modalImportarCsvEl = document.getElementById("modal-importar-csv");
  var formImportarCsv = document.getElementById("form-importar-csv");
  var inputCsvArquivo = document.getElementById("csv-arquivo");
  var textareaCsvTexto = document.getElementById("csv-texto");
  var modalImportarCsvBs = modalImportarCsvEl ? new bootstrap.Modal(modalImportarCsvEl) : null;

  var alertaFeedback = document.getElementById("alerta-feedback-rh");
  var alertaFeedbackTexto = document.getElementById("alerta-feedback-rh-texto");
  var btnFecharAlerta = document.getElementById("btn-fechar-alerta-rh");

  var funcionariosCache = [];

  if (btnFecharAlerta && alertaFeedback) {
    btnFecharAlerta.addEventListener("click", function () {
      alertaFeedback.classList.add("d-none");
    });
  }

  function mostrarAvisoRh(mensagemHtml, mostrarDialogoTexto) {
    if (alertaFeedback && alertaFeedbackTexto) {
      alertaFeedbackTexto.innerHTML = mensagemHtml;
      alertaFeedback.classList.remove("d-none");
    }
    if (mostrarDialogoTexto) {
      alert(mostrarDialogoTexto);
    }
  }

  /* Gerenciamento de tags de Habilitações / NRs no modal de funcionário */
  function renderizarTagsHabilitacoesNoModal() {
    if (!listaTagsHabs) {
      return;
    }
    if (!habilitacoesModal || habilitacoesModal.length === 0) {
      listaTagsHabs.innerHTML = '<span class="small text-muted">Nenhuma habilitação/NR vinculada.</span>';
      return;
    }
    listaTagsHabs.innerHTML = habilitacoesModal.map(function (hab, idx) {
      var textoVal = hab.validade ? " (val. " + escapar(hab.validade) + ")" : "";
      var classeCor = hab.vencida
        ? "bg-danger-subtle text-danger border-danger-subtle"
        : "bg-info-subtle text-info-emphasis border-info-subtle";
      return (
        '<span class="badge ' + classeCor + ' border d-inline-flex align-items-center gap-1 py-1 px-2">' +
          "<span>" + escapar(hab.nome) + textoVal + "</span>" +
          '<button type="button" class="btn-close btn-close--mini" data-rem-hab="' + idx + '"' +
                  ' aria-label="Remover habilitação ' + escapar(hab.nome) + '"></button>' +
        "</span>"
      );
    }).join("");

    listaTagsHabs.querySelectorAll("[data-rem-hab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var indice = Number(this.getAttribute("data-rem-hab"));
        habilitacoesModal.splice(indice, 1);
        renderizarTagsHabilitacoesNoModal();
      });
    });
  }

  function adicionarHabilitacaoPeloInput() {
    if (!inputHabNome) {
      return;
    }
    var nome = (inputHabNome.value || "").trim();
    if (!nome) {
      return;
    }
    var validade = inputHabValidade ? (inputHabValidade.value || "").trim() : "";
    var existenteIdx = habilitacoesModal.findIndex(function (item) {
      return (item.nome || "").toLowerCase() === nome.toLowerCase();
    });
    var hojeIso = new Date().toISOString().slice(0, 10);
    var objHab = {
      nome: nome,
      validade: validade,
      vencida: Boolean(validade && validade < hojeIso)
    };
    if (existenteIdx >= 0) {
      habilitacoesModal[existenteIdx] = objHab;
    } else {
      habilitacoesModal.push(objHab);
    }
    inputHabNome.value = "";
    if (inputHabValidade) {
      inputHabValidade.value = "";
    }
    renderizarTagsHabilitacoesNoModal();
  }

  if (btnAddHab) {
    btnAddHab.addEventListener("click", adicionarHabilitacaoPeloInput);
  }
  if (inputHabNome) {
    inputHabNome.addEventListener("keydown", function (evento) {
      if (evento.key === "Enter") {
        evento.preventDefault();
        adicionarHabilitacaoPeloInput();
      }
    });
  }

  /* Extrai descrição legível dos itens/códigos gerados no Kit Admissional ou de Nova Função */
  function formatarResumoKitGerado(kitGerado) {
    if (!kitGerado || !kitGerado.gerado) {
      return "";
    }
    var listaItens = kitGerado.itens || kitGerado.solicitacoes || kitGerado.codigos || [];
    if (Array.isArray(listaItens) && listaItens.length > 0) {
      var descricoes = listaItens.map(function (item) {
        if (typeof item === "string") {
          return item;
        }
        var codigo = item.codigo || item.solicitacao || item.protocolo || "";
        var produto = item.produto || item.produto_nome || item.nome || "";
        if (codigo && produto) {
          return codigo + " (" + produto + ")";
        }
        return codigo || produto || JSON.stringify(item);
      });
      return "Kit de EPIs gerado para o almoxarifado: " + descricoes.join(", ") + ".";
    }
    if (kitGerado.mensagem) {
      return String(kitGerado.mensagem);
    }
    var qtd = kitGerado.quantidade_itens || kitGerado.quantidade || kitGerado.total || 0;
    if (qtd > 0) {
      return "Kit de EPIs gerado automaticamente (" + qtd + " solicitação(ões) enviada(s) ao almoxarifado).";
    }
    return "Kit de EPIs gerado automaticamente para o almoxarifado.";
  }

  /* Ajusta o estado do campo de e-mail conforme o domínio escolhido (Operacional vs Backoffice) */
  function atualizarEstadoDominioNoModal() {
    if (!selectPerfil || !campoEmail) {
      return;
    }
    var ehOperacional = selectPerfil.value === "COLABORADOR";
    var blocoEmail = document.getElementById("bloco-email-backoffice");
    campoEmail.required = !ehOperacional;
    campoEmail.disabled = ehOperacional;
    if (blocoEmail) {
      blocoEmail.classList.toggle("opacity-50", ehOperacional);
    }
    if (ehOperacional) {
      campoEmail.value = "";
      campoEmail.placeholder = "Dispensado para chão de fábrica";
    } else {
      campoEmail.placeholder = "usuario@empresa.com.br (obrigatório)";
    }
  }

  function limparErroModalFuncionario() {
    var erroEl = document.getElementById("erro-modal-funcionario");
    if (erroEl) {
      erroEl.textContent = "";
      erroEl.classList.add("d-none");
    }
  }

  function mostrarErroModalFuncionario(mensagem) {
    var erroEl = document.getElementById("erro-modal-funcionario");
    if (!erroEl) {
      alert(mensagem);
      return;
    }
    erroEl.textContent = mensagem;
    erroEl.classList.remove("d-none");
    var corpoModal = modalEl ? modalEl.querySelector(".modal-body") : null;
    if (corpoModal) {
      corpoModal.scrollTop = 0;
    }
  }

  /* Carrega a lista de setores para o filtro da página e para os seletores dos modais */
  function carregarSetores() {
    SF.api.get("/api/setores/")
      .then(function (dados) {
        var setores = dados.setores || [];
        var selectFiltro = document.getElementById("filtro-setor");
        var selectModal = document.getElementById("func-setor");
        var selectMudanca = document.getElementById("mudanca-novo-setor");

        setores.forEach(function (setor) {
          var rotuloSetor = setor.nome + (setor.centro_custo && setor.centro_custo !== "—" ? " (" + setor.centro_custo + ")" : "");

          if (selectFiltro) {
            var opcaoFiltro = document.createElement("option");
            opcaoFiltro.value = setor.id;
            opcaoFiltro.textContent = setor.nome;
            selectFiltro.appendChild(opcaoFiltro);
          }

          if (selectModal) {
            var opcaoModal = document.createElement("option");
            opcaoModal.value = setor.id;
            opcaoModal.textContent = rotuloSetor;
            selectModal.appendChild(opcaoModal);
          }

          if (selectMudanca) {
            var opcaoMudanca = document.createElement("option");
            opcaoMudanca.value = setor.id;
            opcaoMudanca.textContent = rotuloSetor;
            selectMudanca.appendChild(opcaoMudanca);
          }
        });
      })
      .catch(function (erro) {
        console.warn("Erro ao carregar setores:", erro);
      });
  }

  var cargosDisponiveis = [];
  var funcoesDisponiveis = [];
  var habilitacoesDisponiveis = [];

  function renderizarOpcoesCargos(selectEl, listaCargos, placeholder, valorSelecionado) {
    SF.ui.preencherSelectCatalogo(selectEl, listaCargos, placeholder, valorSelecionado, "cargo");
  }

  function renderizarOpcoesFuncoes(selectEl, listaFuncoes, placeholder, valorSelecionado) {
    SF.ui.preencherSelectCatalogo(selectEl, listaFuncoes, placeholder, valorSelecionado, "funcao");
  }

  function renderizarOpcoesHabilitacoes(selectEl, listaHabs, placeholder, valorSelecionado) {
    SF.ui.preencherSelectCatalogo(selectEl, listaHabs, placeholder, valorSelecionado, "habilitacao");
  }

  /* Carrega o catálogo de cargos (RH), funções (SST) e habilitações (NRs) */
  function carregarCargosSugeridos() {
    var selectCargo = document.getElementById("func-cargo");
    var selectMudancaCargo = document.getElementById("mudanca-novo-cargo");
    var selectFuncao = document.getElementById("func-funcao");
    var selectMudancaFuncao = document.getElementById("mudar-funcao-atividade");
    var selectHab = document.getElementById("hab-nome-input");

    return SF.api.get("/api/cargos/")
      .then(function (dados) {
        cargosDisponiveis = dados.cargos || [];
        funcoesDisponiveis = dados.funcoes || [];
        habilitacoesDisponiveis = dados.habilitacoes || [];

        if (selectCargo) {
          renderizarOpcoesCargos(selectCargo, cargosDisponiveis, "Selecione o cargo...", selectCargo.value);
        }
        if (selectMudancaCargo) {
          renderizarOpcoesCargos(selectMudancaCargo, cargosDisponiveis, "Selecione o novo cargo...", selectMudancaCargo.value);
        }
        if (selectFuncao) {
          renderizarOpcoesFuncoes(selectFuncao, funcoesDisponiveis, "Selecione a função...", selectFuncao.value);
        }
        if (selectMudancaFuncao) {
          renderizarOpcoesFuncoes(selectMudancaFuncao, funcoesDisponiveis, "Selecione a nova função...", selectMudancaFuncao.value);
        }
        if (selectHab) {
          renderizarOpcoesHabilitacoes(selectHab, habilitacoesDisponiveis, "Selecione uma habilitação / NR...", selectHab.value);
        }
      })
      .catch(function (erro) {
        console.warn("Erro ao carregar catálogos ocupacionais:", erro);
      });
  }

  /* Busca os funcionários aplicando os filtros de texto, setor e domínio */
  function carregarFuncionarios() {
    var termo = filtroTermo ? filtroTermo.value.trim() : "";
    var setor = filtroSetor ? filtroSetor.value : "";
    var dominio = filtroDominio ? filtroDominio.value : "";
    var url =
      "/api/funcionarios/?q=" + encodeURIComponent(termo) +
      "&setor=" + encodeURIComponent(setor) +
      "&dominio=" + encodeURIComponent(dominio);

    tabelaCorpo.innerHTML =
      '<tr><td colspan="5" class="text-center py-4 text-muted">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando colaboradores...' +
      "</td></tr>";

    SF.api.get(url)
      .then(function (dados) {
        funcionariosCache = dados.funcionarios || [];
        renderizarTabela(funcionariosCache);
        abrirFuncionarioDoLink();
      })
      .catch(function (erro) {
        tabelaCorpo.innerHTML =
          '<tr><td colspan="5" class="text-center py-4 text-danger">' +
            "Falha ao carregar funcionários: " + escapar(erro.message) +
          "</td></tr>";
      });
  }

  /* Extrai os tamanhos normalizados de um objeto funcionário */
  function obterTamanhosFuncionario(funcionario) {
    var tam = funcionario.tamanhos || {};
    return {
      calcado: tam.calcado || funcionario.tamanho_calcado || "",
      luva: tam.luva || funcionario.tamanho_luva || "",
      vestimenta: tam.vestimenta || funcionario.tamanho_vestimenta || ""
    };
  }

  /* Monta o bloco da grade de tamanhos no painel expandido */
  function criarBlocoTamanhosHtml(funcionario) {
    var tamanhos = obterTamanhosFuncionario(funcionario);
    var itens = [];
    if (tamanhos.calcado) {
      itens.push('<span class="badge bg-light text-secondary border fw-normal">Calçado: ' + escapar(tamanhos.calcado) + "</span>");
    }
    if (tamanhos.luva) {
      itens.push('<span class="badge bg-light text-secondary border fw-normal">Luva: ' + escapar(tamanhos.luva) + "</span>");
    }
    if (tamanhos.vestimenta) {
      itens.push('<span class="badge bg-light text-secondary border fw-normal">Uniforme: ' + escapar(tamanhos.vestimenta) + "</span>");
    }
    if (itens.length === 0) {
      return '<span class="small text-muted">Não informada</span>';
    }
    return '<div class="d-flex flex-wrap gap-1">' + itens.join("") + "</div>";
  }

  /* Monta os badges de Habilitações / NRs no painel expandido */
  function criarBadgesHabilitacoesHtml(funcionario) {
    var habs = funcionario.habilitacoes || [];
    if (!Array.isArray(habs) || habs.length === 0) {
      return '<span class="small text-muted">Nenhuma habilitação/NR vinculada</span>';
    }
    var badges = habs.map(function (h) {
      var nome = typeof h === "string" ? h : (h.nome || h.habilitacao || "");
      var validade = (typeof h === "object" && h) ? (h.validade || "") : "";
      var vencida = Boolean(typeof h === "object" && h && h.vencida);
      if (!nome) {
        return "";
      }
      if (vencida) {
        return (
          '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-normal" title="Credencial vencida em ' + escapar(validade) + '">' +
            '<i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>' +
            escapar(nome) + (validade ? " (venc. " + escapar(validade) + ")" : " (vencida)") +
          "</span>"
        );
      }
      return (
        '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle fw-normal">' +
          '<i class="bi bi-shield-check me-1" aria-hidden="true"></i>' +
          escapar(nome) + (validade ? " (" + escapar(validade) + ")" : "") +
        "</span>"
      );
    }).join("");
    return '<div class="d-flex flex-wrap gap-1">' + badges + "</div>";
  }

  function contarNrsVencidas(funcionario) {
    var habs = funcionario.habilitacoes || [];
    if (!Array.isArray(habs)) return 0;
    return habs.filter(function (h) {
      return typeof h === "object" && h && h.vencida;
    }).length;
  }

  function formatarDataBr(iso) {
    if (!iso || typeof iso !== "string") return "";
    var partes = iso.split("-");
    if (partes.length === 3) {
      return partes[2] + "/" + partes[1] + "/" + partes[0];
    }
    return iso;
  }

  /* Monta o par de linhas (resumo clicável + painel expansível) de cada funcionário */
  function criarLinhaFuncionarioHtml(funcionario) {
    var badgeStatus = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';
    var corBotaoAlternar = "success";
    var rotuloAcaoAlternar = "Reativar";
    var iconeAlternar = "check-circle";

    if (funcionario.ativo) {
      badgeStatus = '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>';
      corBotaoAlternar = "danger";
      rotuloAcaoAlternar = "Inativar / Desligar";
      iconeAlternar = "slash-circle";
    }

    var badgeDominio = '<span class="badge bg-light text-dark border">Operacional · Totem (PIN)</span>';
    if (funcionario.dominio === "ADMINISTRATIVO") {
      badgeDominio =
        '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">' +
          escapar(funcionario.perfil_rotulo || funcionario.perfil) + " · Backoffice" +
        "</span>";
    }

    var nrsVencidas = contarNrsVencidas(funcionario);
    var alertasResumo = "";
    if (nrsVencidas > 0) {
      alertasResumo +=
        '<span class="badge bg-danger-subtle text-danger border border-danger-subtle fw-normal">' +
          '<i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>' +
          escapar(nrsVencidas) + (nrsVencidas === 1 ? " NR vencida" : " NRs vencidas") +
        "</span>";
    }
    if (funcionario.exigir_troca_pin || funcionario.pin_provisorio) {
      alertasResumo +=
        '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-normal" title="Colaborador deverá definir novo PIN no 1º acesso ao Totem">' +
          '<i class="bi bi-key me-1" aria-hidden="true"></i>PIN provisório' +
        "</span>";
    }

    var htmlAlertasResumo = alertasResumo
      ? '<div class="d-flex flex-wrap gap-1 mt-1">' + alertasResumo + "</div>"
      : "";

    var linhasVinculo = [
      "<div><span class=\"text-muted\">Função (SST):</span> <strong>" + escapar(funcionario.funcao || "Não definida") + "</strong></div>",
      '<div class="mt-1"><span class="text-muted">Acesso:</span> ' + badgeDominio + "</div>"
    ];
    if (funcionario.cpf) {
      linhasVinculo.push('<div class="mt-1"><span class="text-muted">CPF:</span> ' + escapar(funcionario.cpf) + "</div>");
    }
    if (funcionario.data_admissao) {
      linhasVinculo.push('<div class="mt-1"><span class="text-muted">Admissão:</span> ' + escapar(formatarDataBr(funcionario.data_admissao)) + "</div>");
    }
    if (funcionario.email && funcionario.email !== "—") {
      linhasVinculo.push('<div class="mt-1"><span class="text-muted">E-mail:</span> ' + escapar(funcionario.email) + "</div>");
    }

    var idDetalhe = "detalhe-func-" + escapar(funcionario.id);

    return (
      '<tr class="linha-funcionario" data-id="' + escapar(funcionario.id) + '" tabindex="0" role="button" aria-expanded="false" aria-controls="' + idDetalhe + '">' +
        "<td>" +
          '<div class="d-flex align-items-center gap-2">' +
            '<span class="usuario__avatar usuario__avatar--compacto" aria-hidden="true">' +
              escapar(funcionario.iniciais) +
            "</span>" +
            "<div>" +
              '<div class="fw-semibold">' + escapar(funcionario.nome) + "</div>" +
              htmlAlertasResumo +
            "</div>" +
          "</div>" +
        "</td>" +
        '<td><span class="numero">' + escapar(funcionario.matricula) + "</span></td>" +
        "<td>" + escapar(funcionario.cargo || "—") + "</td>" +
        "<td>" + escapar(funcionario.setor_nome || "—") + "</td>" +
        '<td class="text-end text-nowrap">' +
          '<div class="d-inline-flex align-items-center gap-2">' +
            badgeStatus +
            '<i class="bi bi-chevron-down linha-funcionario__seta" aria-hidden="true"></i>' +
          "</div>" +
        "</td>" +
      "</tr>" +
      '<tr class="linha-funcionario-detalhe d-none" id="' + idDetalhe + '" data-detalhe-id="' + escapar(funcionario.id) + '">' +
        '<td colspan="5">' +
          '<div class="painel-funcionario">' +
            '<div class="painel-funcionario__grid">' +
              '<div class="painel-funcionario__bloco">' +
                '<div class="painel-funcionario__rotulo">Vínculo e Acesso</div>' +
                '<div class="small">' + linhasVinculo.join("") + "</div>" +
              "</div>" +
              '<div class="painel-funcionario__bloco">' +
                '<div class="painel-funcionario__rotulo">Habilitações / NRs</div>' +
                criarBadgesHabilitacoesHtml(funcionario) +
              "</div>" +
              '<div class="painel-funcionario__bloco">' +
                '<div class="painel-funcionario__rotulo">Grade de Tamanhos de EPI</div>' +
                criarBlocoTamanhosHtml(funcionario) +
              "</div>" +
            "</div>" +
            '<div class="painel-funcionario__acoes">' +
              '<div class="d-flex flex-wrap gap-2">' +
                '<a class="btn btn-sm btn-primary" href="ficha-epi.html?id=' + encodeURIComponent(funcionario.id) + '">' +
                  '<i class="bi bi-card-checklist me-1" aria-hidden="true"></i>Ficha de EPI (NR-6)' +
                "</a>" +
                '<button type="button" class="btn btn-sm btn-outline-secondary btn-editar" data-id="' + escapar(funcionario.id) + '">' +
                  '<i class="bi bi-pencil me-1" aria-hidden="true"></i>Editar Cadastro' +
                "</button>" +
                '<button type="button" class="btn btn-sm btn-outline-info btn-mudar-funcao" data-id="' + escapar(funcionario.id) + '"' +
                        ' title="Registra transição oficial no Histórico Funcional e permite gerar o Kit de EPIs da nova função">' +
                  '<i class="bi bi-arrow-left-right me-1" aria-hidden="true"></i>Transferir / Mudar Função' +
                "</button>" +
              "</div>" +
              '<button type="button" class="btn btn-sm btn-outline-' + corBotaoAlternar + ' btn-toggle" data-id="' + escapar(funcionario.id) + '">' +
                '<i class="bi bi-' + iconeAlternar + ' me-1" aria-hidden="true"></i>' + rotuloAcaoAlternar +
              "</button>" +
            "</div>" +
          "</div>" +
        "</td>" +
      "</tr>"
    );
  }

  function preencherModalParaEdicao(funcionario) {
    limparErroModalFuncionario();
    var tamanhos = obterTamanhosFuncionario(funcionario);
    document.getElementById("modalFuncTitulo").textContent = "Editar Funcionário";
    document.getElementById("func-id").value = funcionario.id;
    document.getElementById("func-nome").value = funcionario.nome;
    document.getElementById("func-matricula").value = funcionario.matricula;
    var campoCpf = document.getElementById("func-cpf");
    if (campoCpf) campoCpf.value = funcionario.cpf || "";
    var campoAdmissao = document.getElementById("func-data-admissao");
    if (campoAdmissao) campoAdmissao.value = funcionario.data_admissao || "";
    document.getElementById("func-email").value = (funcionario.email === "—") ? "" : funcionario.email;
    var selectCargo = document.getElementById("func-cargo");
    if (selectCargo) {
      renderizarOpcoesCargos(selectCargo, cargosDisponiveis, "Selecione o cargo...", funcionario.cargo || "");
    }
    var campoFuncao = document.getElementById("func-funcao");
    if (campoFuncao) {
      renderizarOpcoesFuncoes(campoFuncao, funcoesDisponiveis, "Selecione a função...", funcionario.funcao || "");
    }
    document.getElementById("func-setor").value = funcionario.setor_id || "";
    document.getElementById("func-perfil").value = funcionario.perfil || "COLABORADOR";
    document.getElementById("func-pin").value = "";

    document.getElementById("func-tam-calcado").value = tamanhos.calcado || "";
    document.getElementById("func-tam-luva").value = tamanhos.luva || "";
    document.getElementById("func-tam-vestimenta").value = tamanhos.vestimenta || "";

    habilitacoesModal = Array.isArray(funcionario.habilitacoes)
      ? funcionario.habilitacoes.map(function (h) {
          if (typeof h === "string") {
            return { nome: h, validade: "", vencida: false };
          }
          return {
            nome: h.nome || h.habilitacao || "",
            validade: h.validade || "",
            vencida: Boolean(h.vencida)
          };
        })
      : [];
    if (inputHabNome) {
      renderizarOpcoesHabilitacoes(inputHabNome, habilitacoesDisponiveis, "Selecione uma habilitação / NR...", "");
      inputHabNome.value = "";
    }
    if (inputHabValidade) inputHabValidade.value = "";
    renderizarTagsHabilitacoesNoModal();

    var chkTrocaPin = document.getElementById("func-exigir-troca-pin");
    if (chkTrocaPin) {
      chkTrocaPin.checked = Boolean(funcionario.exigir_troca_pin || funcionario.pin_provisorio);
    }
    var chkGerarKit = document.getElementById("func-gerar-kit");
    if (chkGerarKit) {
      chkGerarKit.checked = false;
    }

    atualizarEstadoDominioNoModal();

    if (modalBs) {
      modalBs.show();
    }
  }

  function abrirModalMudarFuncao(funcionario) {
    document.getElementById("mudanca-func-id").value = funcionario.id;
    document.getElementById("mudanca-nome-colaborador").textContent =
      funcionario.nome + " (" + funcionario.matricula + ")";
    document.getElementById("mudanca-situacao-atual").textContent =
      "Cargo atual: " + (funcionario.cargo || "—") +
      (funcionario.funcao ? " · Função: " + funcionario.funcao : "") +
      " · Setor atual: " + (funcionario.setor_nome || "Sem setor");
    var selectMudancaCargo = document.getElementById("mudanca-novo-cargo");
    if (selectMudancaCargo) {
      renderizarOpcoesCargos(selectMudancaCargo, cargosDisponiveis, "Selecione o novo cargo...", funcionario.cargo || "");
    }
    var campoNovaAtividade = document.getElementById("mudar-funcao-atividade");
    if (campoNovaAtividade) {
      renderizarOpcoesFuncoes(campoNovaAtividade, funcoesDisponiveis, "Selecione a nova função...", funcionario.funcao || "");
    }
    document.getElementById("mudanca-novo-setor").value = funcionario.setor_id || "";
    document.getElementById("mudanca-observacao").value = "";
    var chkKit = document.getElementById("mudanca-gerar-kit");
    if (chkKit) {
      chkKit.checked = true;
    }
    if (modalMudarFuncaoBs) {
      modalMudarFuncaoBs.show();
    }
  }

  function renderizarChecklistDesligamento(funcionario, dados) {
    var infoFunc = (dados && dados.funcionario) ? dados.funcionario : funcionario;
    document.getElementById("desligamento-nome-colaborador").textContent =
      (infoFunc.nome || funcionario.nome) + " (" + (infoFunc.matricula || funcionario.matricula) + ")";
    document.getElementById("desligamento-detalhe-colaborador").textContent =
      "Cargo: " + (infoFunc.cargo || funcionario.cargo || "—") +
      " · Setor: " + (infoFunc.setor || infoFunc.setor_nome || funcionario.setor_nome || "—");

    var solAbertasRaw = dados ? (dados.solicitacoes_abertas !== undefined ? dados.solicitacoes_abertas : dados.reservas_abertas) : 0;
    var qtdSolicitacoesAbertas = Array.isArray(solAbertasRaw)
      ? solAbertasRaw.length
      : Number(solAbertasRaw || (dados && dados.total_solicitacoes_abertas) || 0);

    var blocoSolTexto = document.getElementById("desligamento-solicitacoes-texto");
    if (qtdSolicitacoesAbertas > 0) {
      blocoSolTexto.innerHTML =
        "<strong>" + qtdSolicitacoesAbertas + " solicitação(ões)/reserva(s) em aberto</strong> serão canceladas automaticamente ao confirmar o desligamento.";
    } else {
      blocoSolTexto.innerHTML =
        "Nenhuma solicitação ou reserva em aberto no momento. O acesso ao Totem será bloqueado imediatamente.";
    }

    var episEmPosse = (dados && Array.isArray(dados.epis_em_posse)) ? dados.epis_em_posse : [];
    var devPendentesRaw = dados ? dados.devolucoes_pendentes : 0;
    var qtdDevolucoesPendentes = Array.isArray(devPendentesRaw)
      ? devPendentesRaw.length
      : (typeof devPendentesRaw === "number" ? devPendentesRaw : (devPendentesRaw ? episEmPosse.length : 0));

    var blocoStatusDevolucoes = document.getElementById("desligamento-status-devolucoes");
    if (qtdDevolucoesPendentes > 0) {
      blocoStatusDevolucoes.innerHTML =
        '<div class="alert alert-danger py-2 px-3 mb-0 small">' +
          '<i class="bi bi-exclamation-octagon-fill me-1" aria-hidden="true"></i>' +
          "<strong>Atenção:</strong> Existem <strong>" + qtdDevolucoesPendentes + "</strong> devolução(ões) obrigatória(s) pendente(s) para este colaborador." +
        "</div>";
    } else {
      blocoStatusDevolucoes.innerHTML =
        '<div class="alert alert-success py-2 px-3 mb-0 small">' +
          '<i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>' +
          "<strong>Nada Consta de Devoluções Obrigatórias:</strong> Não há devoluções obrigatórias vencidas/pendentes bloqueando a emissão do termo." +
        "</div>";
    }

    var containerEpis = document.getElementById("desligamento-lista-epis");
    if (episEmPosse.length === 0) {
      containerEpis.innerHTML = '<p class="text-muted small mb-0">Nenhum EPI ativo sem devolução registrado em posse do colaborador.</p>';
    } else {
      containerEpis.innerHTML =
        '<ul class="list-group list-group-flush small">' +
        episEmPosse.map(function (epi) {
          var nomeProd = epi.produto || epi.produto_nome || epi.nome || "EPI";
          var caTxt = epi.ca ? " · CA " + escapar(epi.ca) : "";
          var dataTxt = (epi.data || epi.data_entrega) ? " · Entregue em " + escapar(epi.data || epi.data_entrega) : "";
          var qtdTxt = epi.quantidade ? " (Qtd: " + escapar(epi.quantidade) + ")" : "";
          var badgePendente = (epi.devolucao_obrigatoria || epi.pendente_devolucao)
            ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle ms-2">Devolução pendente</span>'
            : '<span class="badge bg-secondary-subtle text-secondary border ms-2">Em posse</span>';
          return (
            '<li class="list-group-item px-0 d-flex justify-content-between align-items-center flex-wrap gap-2">' +
              "<div><strong>" + escapar(nomeProd) + "</strong>" + qtdTxt + caTxt + dataTxt + "</div>" +
              badgePendente +
            "</li>"
          );
        }).join("") +
        "</ul>";
    }
  }

  function abrirModalDesligamento(funcionario) {
    document.getElementById("desligamento-func-id").value = funcionario.id;
    var linkNadaConsta = document.getElementById("link-nada-consta-desligamento");
    if (linkNadaConsta) {
      linkNadaConsta.href = "ficha-epi.html?id=" + encodeURIComponent(funcionario.id) + "&nada_consta=1";
    }

    var carregandoEl = document.getElementById("desligamento-carregando");
    var conteudoEl = document.getElementById("desligamento-conteudo");
    if (carregandoEl && conteudoEl) {
      carregandoEl.classList.remove("d-none");
      conteudoEl.classList.add("d-none");
    }

    if (modalDesligamentoBs) {
      modalDesligamentoBs.show();
    }

    SF.api.get("/api/funcionarios/" + encodeURIComponent(funcionario.id) + "/desligamento/")
      .then(function (dados) {
        renderizarChecklistDesligamento(funcionario, dados);
      })
      .catch(function () {
        renderizarChecklistDesligamento(funcionario, null);
      })
      .finally(function () {
        if (carregandoEl && conteudoEl) {
          carregandoEl.classList.add("d-none");
          conteudoEl.classList.remove("d-none");
        }
      });
  }

  /* Vindo da Visão Geral (funcionarios.html?abrir=<id>): abre e mostra a linha dessa pessoa uma vez */
  var idParaAbrir = new URLSearchParams(window.location.search).get("abrir");

  function abrirFuncionarioDoLink() {
    if (!idParaAbrir) return;
    var linha = tabelaCorpo.querySelector('tr.linha-funcionario[data-id="' + CSS.escape(idParaAbrir) + '"]');
    idParaAbrir = null;
    if (!linha) return;
    alternarExpansaoFuncionario(linha);
    linha.scrollIntoView({ behavior: "smooth", block: "center" });
    linha.focus({ preventScroll: true });
  }

  function alternarExpansaoFuncionario(linhaResumo) {
    var id = linhaResumo.dataset.id;
    var detalheAlvo = tabelaCorpo.querySelector('tr.linha-funcionario-detalhe[data-detalhe-id="' + CSS.escape(id) + '"]');
    if (!detalheAlvo) return;

    var estavaAberta = !detalheAlvo.classList.contains("d-none");

    /* Mantém apenas 1 funcionário expandido por vez */
    tabelaCorpo.querySelectorAll("tr.linha-funcionario--aberta").forEach(function (linha) {
      linha.classList.remove("linha-funcionario--aberta");
      linha.setAttribute("aria-expanded", "false");
    });
    tabelaCorpo.querySelectorAll("tr.linha-funcionario-detalhe:not(.d-none)").forEach(function (detalhe) {
      detalhe.classList.add("d-none");
    });

    if (!estavaAberta) {
      linhaResumo.classList.add("linha-funcionario--aberta");
      linhaResumo.setAttribute("aria-expanded", "true");
      detalheAlvo.classList.remove("d-none");
    }
  }

  function renderizarTabela(listaFuncionarios) {
    if (!listaFuncionarios || listaFuncionarios.length === 0) {
      tabelaCorpo.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Nenhum funcionário encontrado.</td></tr>';
      return;
    }

    tabelaCorpo.innerHTML = listaFuncionarios.map(criarLinhaFuncionarioHtml).join("");

    tabelaCorpo.querySelectorAll("tr.linha-funcionario").forEach(function (linha) {
      linha.addEventListener("click", function () {
        alternarExpansaoFuncionario(linha);
      });
      linha.addEventListener("keydown", function (evento) {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          alternarExpansaoFuncionario(linha);
        }
      });
    });

    document.querySelectorAll(".btn-editar").forEach(function (botaoEditar) {
      botaoEditar.addEventListener("click", function () {
        var idProcurado = this.dataset.id;
        var funcionario = funcionariosCache.find(function (item) {
          return item.id === idProcurado;
        });
        if (funcionario) {
          preencherModalParaEdicao(funcionario);
        }
      });
    });

    document.querySelectorAll(".btn-mudar-funcao").forEach(function (botaoMudar) {
      botaoMudar.addEventListener("click", function () {
        var idProcurado = this.dataset.id;
        var funcionario = funcionariosCache.find(function (item) {
          return item.id === idProcurado;
        });
        if (funcionario) {
          abrirModalMudarFuncao(funcionario);
        }
      });
    });

    document.querySelectorAll(".btn-toggle").forEach(function (botaoAlternar) {
      botaoAlternar.addEventListener("click", function () {
        var idFuncionario = this.dataset.id;
        var funcionario = funcionariosCache.find(function (item) {
          return item.id === idFuncionario;
        });

        /* Se o colaborador está ativo, abre o Checklist de Desligamento e Nada Consta */
        if (funcionario && funcionario.ativo) {
          abrirModalDesligamento(funcionario);
          return;
        }

        /* Se está inativo, reativa diretamente */
        SF.api.post("/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/toggle/", {})
          .then(function (resposta) {
            carregarFuncionarios();
            if (resposta && resposta.mensagem) {
              mostrarAvisoRh(escapar(resposta.mensagem));
            }
          })
          .catch(function (erro) {
            alert(erro.message);
          });
      });
    });
  }

  if (btnConfirmarDesligamento) {
    btnConfirmarDesligamento.addEventListener("click", function () {
      var idFuncionario = document.getElementById("desligamento-func-id").value;
      if (!idFuncionario) {
        return;
      }
      SF.api.post("/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/toggle/", {
        confirmar_desligamento: true
      })
        .then(function (resposta) {
          if (modalDesligamentoBs) {
            modalDesligamentoBs.hide();
          }
          carregarFuncionarios();
          var msg = (resposta && resposta.mensagem) ? resposta.mensagem : "Colaborador desligado/inativado com sucesso.";
          mostrarAvisoRh(escapar(msg));
        })
        .catch(function (erro) {
          alert(erro.message);
        });
    });
  }

  /* ---------- Fluxos de Cadastro, Mudança Funcional e Importação CSV ---------- */

  function abrirModalNovoFuncionario() {
    limparErroModalFuncionario();
    formFunc.reset();
    document.getElementById("modalFuncTitulo").textContent = "Novo Funcionário Operacional";
    document.getElementById("func-id").value = "";
    document.getElementById("func-perfil").value = "COLABORADOR";
    renderizarOpcoesCargos(document.getElementById("func-cargo"), cargosDisponiveis, "Selecione o cargo...", "");
    renderizarOpcoesFuncoes(document.getElementById("func-funcao"), funcoesDisponiveis, "Selecione a função...", "");

    document.getElementById("func-tam-calcado").value = "";
    document.getElementById("func-tam-luva").value = "";
    document.getElementById("func-tam-vestimenta").value = "";
    habilitacoesModal = [];
    if (inputHabNome) {
      renderizarOpcoesHabilitacoes(inputHabNome, habilitacoesDisponiveis, "Selecione uma habilitação / NR...", "");
      inputHabNome.value = "";
    }
    if (inputHabValidade) inputHabValidade.value = "";
    renderizarTagsHabilitacoesNoModal();

    var chkTrocaPin = document.getElementById("func-exigir-troca-pin");
    if (chkTrocaPin) chkTrocaPin.checked = true;
    var chkGerarKit = document.getElementById("func-gerar-kit");
    if (chkGerarKit) chkGerarKit.checked = true;

    atualizarEstadoDominioNoModal();
    if (modalBs) modalBs.show();
  }

  function coletarPayloadFormularioFuncionario() {
    var calcado = (document.getElementById("func-tam-calcado").value || "").trim();
    var luva = (document.getElementById("func-tam-luva").value || "").trim();
    var vestimenta = (document.getElementById("func-tam-vestimenta").value || "").trim();
    var campoFuncao = document.getElementById("func-funcao");
    var campoCpf = document.getElementById("func-cpf");
    var campoAdmissao = document.getElementById("func-data-admissao");

    return {
      id: document.getElementById("func-id").value || null,
      nome: document.getElementById("func-nome").value.trim(),
      matricula: document.getElementById("func-matricula").value.trim(),
      cpf: campoCpf ? campoCpf.value.trim() : "",
      data_admissao: campoAdmissao ? campoAdmissao.value.trim() : "",
      pin: document.getElementById("func-pin").value.trim(),
      email: document.getElementById("func-email").value.trim(),
      cargo: document.getElementById("func-cargo").value.trim(),
      funcao: campoFuncao ? campoFuncao.value.trim() : "",
      habilitacoes: habilitacoesModal.map(function (h) {
        return { nome: h.nome, validade: h.validade || "" };
      }),
      setor_id: document.getElementById("func-setor").value || null,
      perfil: document.getElementById("func-perfil").value,
      tamanhos: { calcado: calcado, luva: luva, vestimenta: vestimenta },
      tamanho_calcado: calcado,
      tamanho_luva: luva,
      tamanho_vestimenta: vestimenta,
      exigir_troca_pin: document.getElementById("func-exigir-troca-pin").checked,
      gerar_kit: document.getElementById("func-gerar-kit").checked
    };
  }

  function submeterFormularioFuncionario(evento) {
    evento.preventDefault();
    limparErroModalFuncionario();

    /* Se o usuário selecionou uma habilitação no dropdown e esqueceu de clicar em Adicionar, incorpora */
    if (inputHabNome && inputHabNome.value.trim()) {
      adicionarHabilitacaoPeloInput();
    }

    SF.api.post("/api/funcionarios/salvar/", coletarPayloadFormularioFuncionario())
      .then(function (resposta) {
        if (!resposta.sucesso) {
          throw new Error(resposta.erro || "Falha ao salvar funcionário.");
        }
        if (modalBs) modalBs.hide();
        carregarFuncionarios();
        carregarCargosSugeridos();

        var msgBase = resposta.mensagem || "Funcionário salvo com sucesso.";
        var resumoKit = formatarResumoKitGerado(resposta.kit_gerado);
        var mensagemFinal = resumoKit ? (msgBase + " " + resumoKit) : msgBase;

        mostrarAvisoRh(
          escapar(mensagemFinal),
          (resposta.convite_enviado || (resposta.kit_gerado && resposta.kit_gerado.gerado)) ? mensagemFinal : null
        );
      })
      .catch(function (erro) {
        mostrarErroModalFuncionario(erro.message);
      });
  }

  function submeterMudancaFuncao(evento) {
    evento.preventDefault();
    var idFuncionario = document.getElementById("mudanca-func-id").value;
    var novoCargo = document.getElementById("mudanca-novo-cargo").value.trim();
    var campoNovaAtividade = document.getElementById("mudar-funcao-atividade");
    var novaFuncao = campoNovaAtividade ? campoNovaAtividade.value.trim() : "";
    var novoSetorId = document.getElementById("mudanca-novo-setor").value || null;
    var observacao = document.getElementById("mudanca-observacao").value.trim();

    var payload = {
      cargo: novoCargo,
      novo_cargo: novoCargo,
      funcao: novaFuncao,
      nova_funcao: novaFuncao,
      setor_id: novoSetorId,
      novo_setor_id: novoSetorId,
      observacao: observacao,
      motivo: observacao,
      gerar_kit: document.getElementById("mudanca-gerar-kit").checked
    };

    SF.api.post("/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/mudar-funcao/", payload)
      .then(function (resposta) {
        if (!resposta.sucesso) {
          throw new Error(resposta.erro || "Falha ao registrar mudança de função.");
        }
        if (modalMudarFuncaoBs) modalMudarFuncaoBs.hide();
        carregarFuncionarios();
        carregarCargosSugeridos();

        var msgBase = resposta.mensagem || "Mudança de função/setor registrada com sucesso.";
        var resumoKit = formatarResumoKitGerado(resposta.kit_gerado);
        var mensagemFinal = resumoKit ? (msgBase + " " + resumoKit) : msgBase;

        mostrarAvisoRh(
          escapar(mensagemFinal),
          (resposta.kit_gerado && resposta.kit_gerado.gerado) ? mensagemFinal : null
        );
      })
      .catch(function (erro) {
        alert(erro.message);
      });
  }

  function abrirModalImportarCsv() {
    if (formImportarCsv) formImportarCsv.reset();
    var chkPin = document.getElementById("csv-exigir-troca-pin");
    if (chkPin) chkPin.checked = true;
    var chkKit = document.getElementById("csv-gerar-kit");
    if (chkKit) chkKit.checked = false;
    var divResultado = document.getElementById("csv-resultado");
    if (divResultado) {
      divResultado.classList.add("d-none");
      divResultado.innerHTML = "";
    }
    if (modalImportarCsvBs) modalImportarCsvBs.show();
  }

  function renderizarResultadoImportacaoCsv(resposta) {
    var criados = resposta.criados || 0;
    var atualizados = resposta.atualizados || 0;
    var erros = resposta.erros || [];
    var divResultado = document.getElementById("csv-resultado");
    if (!divResultado) return;

    var htmlErros = "";
    if (erros.length > 0) {
      htmlErros =
        '<div class="mt-2 small text-danger">' +
          "<strong>Ocorrências (" + erros.length + "):</strong>" +
          '<ul class="mb-0 ps-3">' +
            erros.map(function (err) {
              var txtErro = typeof err === "string"
                ? err
                : ("Linha " + (err.linha || "?") + ": " + (err.erro || err.mensagem || JSON.stringify(err)));
              return "<li>" + escapar(txtErro) + "</li>";
            }).join("") +
          "</ul>" +
        "</div>";
    }

    divResultado.className = "alert " + (erros.length > 0 ? "alert-warning" : "alert-success") + " mb-0";
    divResultado.innerHTML =
      "<div><strong>Importação concluída:</strong> " +
        escapar(String(criados)) + " criado(s), " +
        escapar(String(atualizados)) + " atualizado(s), " +
        escapar(String(erros.length)) + " erro(s)." +
      "</div>" +
      htmlErros;
  }

  function submeterImportacaoCsv(evento) {
    evento.preventDefault();
    var textoCsv = (textareaCsvTexto ? textareaCsvTexto.value : "").trim();
    if (!textoCsv) {
      alert("Informe ou selecione o conteúdo CSV para importar.");
      return;
    }

    SF.api.post("/api/funcionarios/importar-csv/", {
      csv: textoCsv,
      csv_texto: textoCsv,
      conteudo: textoCsv,
      exigir_troca_pin: document.getElementById("csv-exigir-troca-pin").checked,
      gerar_kit: document.getElementById("csv-gerar-kit").checked
    })
      .then(function (resposta) {
        renderizarResultadoImportacaoCsv(resposta);
        carregarFuncionarios();
        carregarCargosSugeridos();
      })
      .catch(function (erro) {
        alert(erro.message);
      });
  }

  /* ---------- Registro de Eventos da Página ---------- */
  if (selectPerfil) selectPerfil.addEventListener("change", atualizarEstadoDominioNoModal);
  if (btnNovoFunc) btnNovoFunc.addEventListener("click", abrirModalNovoFuncionario);
  if (formFunc) formFunc.addEventListener("submit", submeterFormularioFuncionario);
  if (formMudarFuncao) formMudarFuncao.addEventListener("submit", submeterMudancaFuncao);
  if (btnImportarCsv) btnImportarCsv.addEventListener("click", abrirModalImportarCsv);
  if (formImportarCsv) formImportarCsv.addEventListener("submit", submeterImportacaoCsv);

  if (inputCsvArquivo && textareaCsvTexto) {
    inputCsvArquivo.addEventListener("change", function () {
      var arquivo = this.files && this.files[0];
      if (!arquivo) return;
      var leitor = new FileReader();
      leitor.onload = function (e) {
        textareaCsvTexto.value = e.target.result || "";
      };
      leitor.readAsText(arquivo, "UTF-8");
    });
  }

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", carregarFuncionarios);
  }
  if (filtroSetor) {
    filtroSetor.addEventListener("change", carregarFuncionarios);
  }
  if (filtroDominio) {
    filtroDominio.addEventListener("change", carregarFuncionarios);
  }
  if (filtroTermo) {
    filtroTermo.addEventListener("keydown", function (evento) {
      if (evento.key === "Enter") {
        carregarFuncionarios();
      }
    });
  }

  /* Atualiza automaticamente a lista de cargos caso o usuário cadastre ou altere cargos em outra aba */
  window.addEventListener("focus", function () {
    carregarCargosSugeridos();
  });

  atualizarEstadoDominioNoModal();
  renderizarTagsHabilitacoesNoModal();
  carregarSetores();
  carregarCargosSugeridos();
  carregarFuncionarios();
})();
