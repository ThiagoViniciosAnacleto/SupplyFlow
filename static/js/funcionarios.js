/* =====================================================================
   SupplyFlow — Gestão de Funcionários Operacionais e Ciclo de Vida RH
   ---------------------------------------------------------------------
   Gerencia o Domínio 1 (Funcionários Operacionais / Totem):
   - Cadastro e edição com Grade de Tamanhos (Calçado, Luva, Vestimenta),
     PIN provisório de 1º acesso e Kit Admissional automático de EPIs.
   - Mudança de Função / Transferência de Setor com geração de Kit.
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
    var qtd = kitGerado.quantidade || kitGerado.total || 0;
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
    campoEmail.required = !ehOperacional;
    if (ehOperacional) {
      campoEmail.placeholder = "Dispensado para chão de fábrica";
    } else {
      campoEmail.placeholder = "usuario@empresa.com.br (obrigatório)";
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

  /* Carrega o catálogo de cargos e funções para sugerir nos modais de funcionário e transição (RF-04) */
  function carregarCargosSugeridos() {
    var datalist = document.getElementById("lista-cargos-func");
    if (!datalist) {
      return;
    }
    SF.api.get("/api/cargos/")
      .then(function (dados) {
        var lista = dados.cargos || [];
        datalist.innerHTML = lista.map(function (item) {
          return '<option value="' + escapar(item.cargo) + '">';
        }).join("");
      })
      .catch(function (erro) {
        console.warn("Erro ao carregar cargos:", erro);
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
      '<tr><td colspan="7" class="text-center py-4 text-muted">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando colaboradores...' +
      "</td></tr>";

    SF.api.get(url)
      .then(function (dados) {
        funcionariosCache = dados.funcionarios || [];
        renderizarTabela(funcionariosCache);
      })
      .catch(function (erro) {
        tabelaCorpo.innerHTML =
          '<tr><td colspan="7" class="text-center py-4 text-danger">' +
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

  /* Monta a badge discreta com a grade de tamanhos cadastrada */
  function criarBadgeTamanhosHtml(funcionario) {
    var tamanhos = obterTamanhosFuncionario(funcionario);
    var partes = [];
    if (tamanhos.calcado) {
      partes.push("Calçado " + escapar(tamanhos.calcado));
    }
    if (tamanhos.luva) {
      partes.push("Luva " + escapar(tamanhos.luva));
    }
    if (tamanhos.vestimenta) {
      partes.push("Unif. " + escapar(tamanhos.vestimenta));
    }
    if (partes.length === 0) {
      return "";
    }
    return (
      '<div class="mt-1">' +
        '<span class="badge bg-light text-secondary border fw-normal">' +
          '<i class="bi bi-rulers me-1" aria-hidden="true"></i>' + partes.join(" · ") +
        "</span>" +
      "</div>"
    );
  }

  /* Monta o HTML de uma linha da tabela de funcionários */
  function criarLinhaFuncionarioHtml(funcionario) {
    var badgeStatus = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';
    var corBotaoAlternar = "success";
    var rotuloAcaoAlternar = "Reativar";
    var iconeAlternar = "check-circle";

    if (funcionario.ativo) {
      badgeStatus = '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>';
      corBotaoAlternar = "danger";
      rotuloAcaoAlternar = "Desligar / Inativar";
      iconeAlternar = "slash-circle";
    }

    var badgeDominio = '<span class="badge bg-light text-dark border">Operacional · Totem (PIN)</span>';
    if (funcionario.dominio === "ADMINISTRATIVO") {
      badgeDominio =
        '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">' +
          escapar(funcionario.perfil_rotulo || funcionario.perfil) + " · Backoffice" +
        "</span>";
    }

    var badgePinProvisorio = "";
    if (funcionario.exigir_troca_pin) {
      badgePinProvisorio =
        '<div class="mt-1">' +
          '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle fw-normal" title="Colaborador deverá definir novo PIN no 1º acesso ao Totem">' +
            '<i class="bi bi-key me-1" aria-hidden="true"></i>PIN provisório' +
          "</span>" +
        "</div>";
    }

    var subtitulo = funcionario.dominio === "OPERACIONAL"
      ? "Autoatendimento via Matrícula + PIN"
      : (funcionario.email || "—");

    return (
      "<tr>" +
        "<td>" +
          '<div class="d-flex align-items-center gap-2">' +
            '<span class="usuario__avatar" style="width:34px;height:34px;font-size:12px;" aria-hidden="true">' +
              escapar(funcionario.iniciais) +
            "</span>" +
            "<div>" +
              '<div class="fw-semibold">' + escapar(funcionario.nome) + "</div>" +
              '<small class="text-muted">' + escapar(subtitulo) + "</small>" +
            "</div>" +
          "</div>" +
        "</td>" +
        '<td><span class="numero">' + escapar(funcionario.matricula) + "</span></td>" +
        "<td>" +
          "<div>" + escapar(funcionario.cargo) + "</div>" +
          criarBadgeTamanhosHtml(funcionario) +
        "</td>" +
        "<td>" + escapar(funcionario.setor_nome) + "</td>" +
        "<td>" +
          badgeDominio +
          badgePinProvisorio +
        "</td>" +
        "<td>" + badgeStatus + "</td>" +
        '<td class="text-end text-nowrap">' +
          '<a class="btn btn-sm btn-outline-primary me-1" href="ficha-epi.html?id=' + encodeURIComponent(funcionario.id) + '"' +
             ' aria-label="Ficha de EPI de ' + escapar(funcionario.nome) + '" title="Ficha de EPI">' +
            '<i class="bi bi-card-checklist" aria-hidden="true"></i>' +
          "</a>" +
          '<button type="button" class="btn btn-sm btn-outline-info me-1 btn-mudar-funcao" data-id="' + escapar(funcionario.id) + '"' +
                  ' aria-label="Mudar função ou setor de ' + escapar(funcionario.nome) + '" title="Mudar Função / Setor">' +
            '<i class="bi bi-arrow-left-right" aria-hidden="true"></i>' +
          "</button>" +
          '<button type="button" class="btn btn-sm btn-outline-secondary me-1 btn-editar" data-id="' + escapar(funcionario.id) + '"' +
                  ' aria-label="Editar ' + escapar(funcionario.nome) + '" title="Editar">' +
            '<i class="bi bi-pencil" aria-hidden="true"></i>' +
          "</button>" +
          '<button type="button" class="btn btn-sm btn-outline-' + corBotaoAlternar + ' btn-toggle" data-id="' + escapar(funcionario.id) + '"' +
                  ' aria-label="' + rotuloAcaoAlternar + " " + escapar(funcionario.nome) + '" title="' + rotuloAcaoAlternar + '">' +
            '<i class="bi bi-' + iconeAlternar + '" aria-hidden="true"></i>' +
          "</button>" +
        "</td>" +
      "</tr>"
    );
  }

  function preencherModalParaEdicao(funcionario) {
    var tamanhos = obterTamanhosFuncionario(funcionario);
    document.getElementById("modalFuncTitulo").textContent = "Editar Funcionário";
    document.getElementById("func-id").value = funcionario.id;
    document.getElementById("func-nome").value = funcionario.nome;
    document.getElementById("func-matricula").value = funcionario.matricula;
    document.getElementById("func-email").value = (funcionario.email === "—") ? "" : funcionario.email;
    document.getElementById("func-cargo").value = funcionario.cargo;
    document.getElementById("func-setor").value = funcionario.setor_id || "";
    document.getElementById("func-perfil").value = funcionario.perfil || "COLABORADOR";
    document.getElementById("func-pin").value = "";

    document.getElementById("func-tam-calcado").value = tamanhos.calcado || "";
    document.getElementById("func-tam-luva").value = tamanhos.luva || "";
    document.getElementById("func-tam-vestimenta").value = tamanhos.vestimenta || "";

    var chkTrocaPin = document.getElementById("func-exigir-troca-pin");
    if (chkTrocaPin) {
      chkTrocaPin.checked = Boolean(funcionario.exigir_troca_pin);
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
      "Cargo atual: " + (funcionario.cargo || "—") + " · Setor atual: " + (funcionario.setor_nome || "Sem setor");
    document.getElementById("mudanca-novo-cargo").value = funcionario.cargo || "";
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
      "Função: " + (infoFunc.cargo || funcionario.cargo || "—") +
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

  function renderizarTabela(listaFuncionarios) {
    if (!listaFuncionarios || listaFuncionarios.length === 0) {
      tabelaCorpo.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Nenhum funcionário encontrado.</td></tr>';
      return;
    }

    tabelaCorpo.innerHTML = listaFuncionarios.map(criarLinhaFuncionarioHtml).join("");

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

  if (selectPerfil) {
    selectPerfil.addEventListener("change", atualizarEstadoDominioNoModal);
  }

  if (btnNovoFunc) {
    btnNovoFunc.addEventListener("click", function () {
      formFunc.reset();
      document.getElementById("modalFuncTitulo").textContent = "Novo Funcionário Operacional";
      document.getElementById("func-id").value = "";
      document.getElementById("func-perfil").value = "COLABORADOR";
      document.getElementById("func-tam-calcado").value = "";
      document.getElementById("func-tam-luva").value = "";
      document.getElementById("func-tam-vestimenta").value = "";
      var chkTrocaPin = document.getElementById("func-exigir-troca-pin");
      if (chkTrocaPin) {
        chkTrocaPin.checked = true;
      }
      var chkGerarKit = document.getElementById("func-gerar-kit");
      if (chkGerarKit) {
        chkGerarKit.checked = true;
      }
      atualizarEstadoDominioNoModal();
      if (modalBs) {
        modalBs.show();
      }
    });
  }

  if (formFunc) {
    formFunc.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var calcado = (document.getElementById("func-tam-calcado").value || "").trim();
      var luva = (document.getElementById("func-tam-luva").value || "").trim();
      var vestimenta = (document.getElementById("func-tam-vestimenta").value || "").trim();
      var exigirTrocaPin = document.getElementById("func-exigir-troca-pin").checked;
      var gerarKit = document.getElementById("func-gerar-kit").checked;

      var payload = {
        id: document.getElementById("func-id").value || null,
        nome: document.getElementById("func-nome").value.trim(),
        matricula: document.getElementById("func-matricula").value.trim(),
        pin: document.getElementById("func-pin").value.trim(),
        email: document.getElementById("func-email").value.trim(),
        cargo: document.getElementById("func-cargo").value.trim(),
        setor_id: document.getElementById("func-setor").value || null,
        perfil: document.getElementById("func-perfil").value,
        tamanhos: {
          calcado: calcado,
          luva: luva,
          vestimenta: vestimenta
        },
        tamanho_calcado: calcado,
        tamanho_luva: luva,
        tamanho_vestimenta: vestimenta,
        exigir_troca_pin: exigirTrocaPin,
        gerar_kit: gerarKit
      };

      SF.api.post("/api/funcionarios/salvar/", payload)
        .then(function (resposta) {
          if (!resposta.sucesso) {
            throw new Error(resposta.erro || "Falha ao salvar funcionário.");
          }
          if (modalBs) {
            modalBs.hide();
          }
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
          alert(erro.message);
        });
    });
  }

  /* Submissão do Modal de Mudança de Função / Transferência de Setor */
  if (formMudarFuncao) {
    formMudarFuncao.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var idFuncionario = document.getElementById("mudanca-func-id").value;
      var novoCargo = document.getElementById("mudanca-novo-cargo").value.trim();
      var novoSetorId = document.getElementById("mudanca-novo-setor").value || null;
      var observacao = document.getElementById("mudanca-observacao").value.trim();
      var gerarKit = document.getElementById("mudanca-gerar-kit").checked;

      var payload = {
        cargo: novoCargo,
        novo_cargo: novoCargo,
        setor_id: novoSetorId,
        novo_setor_id: novoSetorId,
        observacao: observacao,
        motivo: observacao,
        gerar_kit: gerarKit
      };

      SF.api.post("/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/mudar-funcao/", payload)
        .then(function (resposta) {
          if (!resposta.sucesso) {
            throw new Error(resposta.erro || "Falha ao registrar mudança de função.");
          }
          if (modalMudarFuncaoBs) {
            modalMudarFuncaoBs.hide();
          }
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
    });
  }

  /* Modal e Leitura de Arquivo para Importação em Lote via CSV */
  if (btnImportarCsv) {
    btnImportarCsv.addEventListener("click", function () {
      if (formImportarCsv) {
        formImportarCsv.reset();
      }
      var chkPin = document.getElementById("csv-exigir-troca-pin");
      if (chkPin) {
        chkPin.checked = true;
      }
      var chkKit = document.getElementById("csv-gerar-kit");
      if (chkKit) {
        chkKit.checked = false;
      }
      var divResultado = document.getElementById("csv-resultado");
      if (divResultado) {
        divResultado.classList.add("d-none");
        divResultado.innerHTML = "";
      }
      if (modalImportarCsvBs) {
        modalImportarCsvBs.show();
      }
    });
  }

  if (inputCsvArquivo && textareaCsvTexto) {
    inputCsvArquivo.addEventListener("change", function () {
      var arquivo = this.files && this.files[0];
      if (!arquivo) {
        return;
      }
      var leitor = new FileReader();
      leitor.onload = function (e) {
        textareaCsvTexto.value = e.target.result || "";
      };
      leitor.readAsText(arquivo, "UTF-8");
    });
  }

  if (formImportarCsv) {
    formImportarCsv.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var textoCsv = (textareaCsvTexto ? textareaCsvTexto.value : "").trim();
      if (!textoCsv) {
        alert("Informe ou selecione o conteúdo CSV para importar.");
        return;
      }
      var exigirTrocaPin = document.getElementById("csv-exigir-troca-pin").checked;
      var gerarKit = document.getElementById("csv-gerar-kit").checked;

      SF.api.post("/api/funcionarios/importar-csv/", {
        csv: textoCsv,
        csv_texto: textoCsv,
        conteudo: textoCsv,
        exigir_troca_pin: exigirTrocaPin,
        gerar_kit: gerarKit
      })
        .then(function (resposta) {
          var criados = resposta.criados || 0;
          var atualizados = resposta.atualizados || 0;
          var erros = resposta.erros || [];
          var divResultado = document.getElementById("csv-resultado");

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

          if (divResultado) {
            divResultado.className = "alert " + (erros.length > 0 ? "alert-warning" : "alert-success") + " mb-0";
            divResultado.innerHTML =
              "<div><strong>Importação concluída:</strong> " +
                escapar(String(criados)) + " criado(s), " +
                escapar(String(atualizados)) + " atualizado(s), " +
                escapar(String(erros.length)) + " erro(s)." +
              "</div>" +
              htmlErros;
          }

          carregarFuncionarios();
          carregarCargosSugeridos();
        })
        .catch(function (erro) {
          alert(erro.message);
        });
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

  atualizarEstadoDominioNoModal();
  carregarSetores();
  carregarCargosSugeridos();
  carregarFuncionarios();
})();
