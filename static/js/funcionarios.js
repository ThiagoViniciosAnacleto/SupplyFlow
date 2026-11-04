/* =====================================================================
   SupplyFlow — Gestão de Funcionários Operacionais (/api/funcionarios/)
   ---------------------------------------------------------------------
   Gerencia o Domínio 1 (Funcionários Operacionais / Totem): nome,
   matrícula, função/cargo, setor/centro de custo e PIN criptografado
   (PBKDF2) para autoatendimento, mantendo isolamento em relação às
   credenciais administrativas do Backoffice (Domínio 2 / RBAC).
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var tabelaCorpo = document.getElementById("tabela-funcionarios-corpo");
  var filtroTermo = document.getElementById("filtro-termo");
  var filtroSetor = document.getElementById("filtro-setor");
  var filtroDominio = document.getElementById("filtro-dominio");
  var btnFiltrar = document.getElementById("btn-filtrar");
  var btnNovoFunc = document.getElementById("btn-novo-funcionario");
  var modalEl = document.getElementById("modal-funcionario");
  var formFunc = document.getElementById("form-funcionario");
  var selectPerfil = document.getElementById("func-perfil");
  var campoEmail = document.getElementById("func-email");
  var modalBs = modalEl ? new bootstrap.Modal(modalEl) : null;

  var funcionariosCache = [];

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

  /* Carrega a lista de setores para o filtro da página e para o seletor do modal */
  function carregarSetores() {
    SF.api.get("/api/setores/")
      .then(function (dados) {
        var setores = dados.setores || [];
        var selectFiltro = document.getElementById("filtro-setor");
        var selectModal = document.getElementById("func-setor");

        setores.forEach(function (setor) {
          var opcaoFiltro = document.createElement("option");
          opcaoFiltro.value = setor.id;
          opcaoFiltro.textContent = setor.nome;
          selectFiltro.appendChild(opcaoFiltro);

          var opcaoModal = document.createElement("option");
          opcaoModal.value = setor.id;
          opcaoModal.textContent = setor.nome + " (" + setor.centro_custo + ")";
          selectModal.appendChild(opcaoModal);
        });
      })
      .catch(function (erro) {
        console.warn("Erro ao carregar setores:", erro);
      });
  }

  /* Carrega o catálogo de cargos e funções para sugerir no modal de funcionário (RF-04) */
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

  /* Monta o HTML de uma linha da tabela de funcionários */
  function criarLinhaFuncionarioHtml(funcionario) {
    var badgeStatus = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">Inativo</span>';
    var corBotaoAlternar = "success";
    var rotuloAcaoAlternar = "Ativar";
    var iconeAlternar = "check-circle";

    if (funcionario.ativo) {
      badgeStatus = '<span class="badge bg-success-subtle text-success border border-success-subtle">Ativo</span>';
      corBotaoAlternar = "danger";
      rotuloAcaoAlternar = "Inativar";
      iconeAlternar = "slash-circle";
    }

    var badgeDominio = '<span class="badge bg-light text-dark border">Operacional · Totem (PIN)</span>';
    if (funcionario.dominio === "ADMINISTRATIVO") {
      badgeDominio =
        '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">' +
          escapar(funcionario.perfil_rotulo || funcionario.perfil) + " · Backoffice" +
        "</span>";
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
        "<td>" + escapar(funcionario.cargo) + "</td>" +
        "<td>" + escapar(funcionario.setor_nome) + "</td>" +
        "<td>" + badgeDominio + "</td>" +
        "<td>" + badgeStatus + "</td>" +
        '<td class="text-end text-nowrap">' +
          '<a class="btn btn-sm btn-outline-primary me-1" href="ficha-epi.html?id=' + encodeURIComponent(funcionario.id) + '"' +
             ' aria-label="Ficha de EPI de ' + escapar(funcionario.nome) + '" title="Ficha de EPI">' +
            '<i class="bi bi-card-checklist" aria-hidden="true"></i>' +
          "</a>" +
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
    document.getElementById("modalFuncTitulo").textContent = "Editar Funcionário";
    document.getElementById("func-id").value = funcionario.id;
    document.getElementById("func-nome").value = funcionario.nome;
    document.getElementById("func-matricula").value = funcionario.matricula;
    document.getElementById("func-email").value = (funcionario.email === "—") ? "" : funcionario.email;
    document.getElementById("func-cargo").value = funcionario.cargo;
    document.getElementById("func-setor").value = funcionario.setor_id || "";
    document.getElementById("func-perfil").value = funcionario.perfil || "COLABORADOR";
    document.getElementById("func-pin").value = "";
    atualizarEstadoDominioNoModal();

    if (modalBs) {
      modalBs.show();
    }
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

    document.querySelectorAll(".btn-toggle").forEach(function (botaoAlternar) {
      botaoAlternar.addEventListener("click", function () {
        var idFuncionario = this.dataset.id;
        SF.api.post("/api/funcionarios/" + encodeURIComponent(idFuncionario) + "/toggle/")
          .then(function () {
            carregarFuncionarios();
          })
          .catch(function (erro) {
            alert(erro.message);
          });
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
      atualizarEstadoDominioNoModal();
      if (modalBs) {
        modalBs.show();
      }
    });
  }

  if (formFunc) {
    formFunc.addEventListener("submit", function (evento) {
      evento.preventDefault();
      var payload = {
        id: document.getElementById("func-id").value || null,
        nome: document.getElementById("func-nome").value.trim(),
        matricula: document.getElementById("func-matricula").value.trim(),
        pin: document.getElementById("func-pin").value.trim(),
        email: document.getElementById("func-email").value.trim(),
        cargo: document.getElementById("func-cargo").value.trim(),
        setor_id: document.getElementById("func-setor").value || null,
        perfil: document.getElementById("func-perfil").value
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
          if (resposta.convite_enviado) {
            alert(resposta.mensagem);
          }
        })
        .catch(function (erro) {
          alert(erro.message);
        });
    });
  }

  if (btnFiltrar) {
    btnFiltrar.addEventListener("click", carregarFuncionarios);
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
