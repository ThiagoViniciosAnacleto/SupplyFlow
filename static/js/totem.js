/* =====================================================================
   SupplyFlow — Lógica do Totem de Autoatendimento
   Conectado 100% à API Django (/api/totem/...) e ao PostgreSQL no Render.
   ===================================================================== */

(function () {
  // Estado da sessão no Totem
  var estado = {
    matricula: "",
    pin: "",
    colaborador: null,
    produtos: [],
    produtoSelecionado: null,
    totemCodigo: "TOTEM-01",
    timerSucesso: null,
  };

  var DICAS_PIN = {
    "MAT-2001": "1122",
    "MAT-2002": "3344",
    "MAT-2003": "9988",
    "MAT-1001": "1234",
    "MAT-1002": "5678",
    "MAT-1003": "4321",
  };

  // Elementos do DOM
  var inputMatricula = document.getElementById("input-matricula");
  var gridProdutos = document.getElementById("grid-produtos-totem");
  var modalMinhasSolsEl = document.getElementById("modal-minhas-sols");
  var modalSucessoEl = document.getElementById("modal-sucesso");

  var bsModalSols = modalMinhasSolsEl ? new bootstrap.Modal(modalMinhasSolsEl) : null;
  var bsModalSucesso = modalSucessoEl ? new bootstrap.Modal(modalSucessoEl) : null;

  /* ---------- Troca de Passo ---------- */
  function mostrarPasso(passoId) {
    document.querySelectorAll(".totem-passo").forEach(function (el) {
      el.classList.remove("ativo");
    });
    var destino = document.getElementById(passoId);
    if (destino) {
      destino.classList.add("ativo");
      window.scrollTo(0, 0);
    }
  }

  function reiniciarSessao() {
    if (estado.timerSucesso) {
      clearInterval(estado.timerSucesso);
      estado.timerSucesso = null;
    }
    if (bsModalSucesso) bsModalSucesso.hide();
    if (bsModalSols) bsModalSols.hide();

    estado.matricula = "";
    estado.pin = "";
    estado.colaborador = null;
    estado.produtoSelecionado = null;

    if (inputMatricula) inputMatricula.value = "";
    atualizarPinDots();
    mostrarPasso("passo-boas-vindas");
  }

  /* ---------- Passo 1: Boas-vindas ---------- */
  var opcaoMatricula = document.getElementById("opcao-matricula");
  if (opcaoMatricula) {
    opcaoMatricula.addEventListener("click", function () {
      estado.matricula = "";
      if (inputMatricula) inputMatricula.value = "";
      mostrarPasso("passo-matricula");
    });
  }

  /* ---------- Passo 2: Teclado de Matrícula ---------- */
  document.querySelectorAll(".tecla-num").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = this.dataset.val;
      if (!estado.matricula.startsWith("MAT-")) {
        estado.matricula = "MAT-";
      }
      if (estado.matricula.length < 8) {
        estado.matricula += val;
        inputMatricula.value = estado.matricula;
      }
    });
  });

  var btnMatriculaApagar = document.getElementById("btn-matricula-apagar");
  if (btnMatriculaApagar) {
    btnMatriculaApagar.addEventListener("click", function () {
      if (estado.matricula.length > 4) {
        estado.matricula = estado.matricula.slice(0, -1);
      } else {
        estado.matricula = "";
      }
      inputMatricula.value = estado.matricula;
    });
  }

  // Chips de teste rápido
  document.querySelectorAll(".chip-demo").forEach(function (chip) {
    chip.addEventListener("click", function () {
      estado.matricula = this.dataset.mat;
      inputMatricula.value = estado.matricula;
      validarMatriculaEAvancar();
    });
  });

  var btnMatriculaConfirmar = document.getElementById("btn-matricula-confirmar");
  if (btnMatriculaConfirmar) {
    btnMatriculaConfirmar.addEventListener("click", function () {
      validarMatriculaEAvancar();
    });
  }

  function validarMatriculaEAvancar() {
    var mat = (inputMatricula.value || estado.matricula).trim().toUpperCase();
    if (!mat) {
      alert("Por favor, digite ou selecione uma matrícula.");
      return;
    }
    if (!mat.startsWith("MAT-")) {
      mat = "MAT-" + mat;
      estado.matricula = mat;
      inputMatricula.value = mat;
    }

    // Chama o endpoint de identificação
    fetch("/api/totem/identificar/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matricula: mat }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("Matrícula não encontrada.");
        return r.json();
      })
      .then(function (dados) {
        document.getElementById("pin-colaborador-nome").textContent = dados.primeiro_nome || dados.nome;
        document.getElementById("dica-mat-atual").textContent = mat;
        document.getElementById("dica-pin-num").textContent = DICAS_PIN[mat] || "1234";

        estado.pin = "";
        atualizarPinDots();
        mostrarPasso("passo-pin");
      })
      .catch(function (err) {
        alert(err.message || "Matrícula não localizada no sistema. Verifique os dígitos.");
      });
  }

  /* ---------- Passo 3: PIN e Teclado de PIN ---------- */
  function atualizarPinDots() {
    for (var i = 0; i < 4; i++) {
      var dot = document.getElementById("dot-" + i);
      if (dot) {
        if (i < estado.pin.length) {
          dot.classList.add("preenchido");
        } else {
          dot.classList.remove("preenchido");
        }
      }
    }
  }

  document.querySelectorAll(".tecla-pin").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (estado.pin.length < 4) {
        estado.pin += this.dataset.val;
        atualizarPinDots();

        if (estado.pin.length === 4) {
          // Validação automática no 4º dígito com microdelay para feedback visual
          setTimeout(autenticarPin, 150);
        }
      }
    });
  });

  var btnPinApagar = document.getElementById("btn-pin-apagar");
  if (btnPinApagar) {
    btnPinApagar.addEventListener("click", function () {
      if (estado.pin.length > 0) {
        estado.pin = estado.pin.slice(0, -1);
        atualizarPinDots();
      }
    });
  }

  var btnPinLimpar = document.getElementById("btn-pin-limpar");
  if (btnPinLimpar) {
    btnPinLimpar.addEventListener("click", function () {
      estado.pin = "";
      atualizarPinDots();
    });
  }

  function autenticarPin() {
    fetch("/api/totem/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matricula: estado.matricula,
        pin: estado.pin,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) { throw new Error(err.erro || "PIN incorreto"); });
        }
        return res.json();
      })
      .then(function (dados) {
        estado.colaborador = dados.colaborador;
        carregarVitrineProdutos();
      })
      .catch(function (err) {
        alert(err.message || "PIN inválido. Tente novamente.");
        estado.pin = "";
        atualizarPinDots();
      });
  }

  /* ---------- Passo 4: Vitrine de Produtos ---------- */
  function carregarVitrineProdutos() {
    document.getElementById("vitrine-nome").textContent = estado.colaborador.primeiro_nome || estado.colaborador.nome;
    document.getElementById("vitrine-cargo").textContent = estado.colaborador.cargo;
    document.getElementById("vitrine-setor").textContent = estado.colaborador.setor;

    gridProdutos.innerHTML = '<div class="text-center py-5 w-100 text-muted"><div class="spinner-border text-primary" role="status"></div><div class="mt-2">Consultando estoque do totem...</div></div>';
    mostrarPasso("passo-vitrine");

    fetch("/api/totem/produtos/?matricula=" + encodeURIComponent(estado.matricula) + "&totem_codigo=" + encodeURIComponent(estado.totemCodigo))
      .then(function (res) { return res.json(); })
      .then(function (dados) {
        estado.produtos = dados.produtos || [];
        document.getElementById("count-minhas-sols").textContent = dados.total_solicitacoes_pendentes || "0";
        renderizarCardsProdutos(estado.produtos);
      })
      .catch(function (err) {
        gridProdutos.innerHTML = '<div class="alert alert-danger w-100">Falha ao carregar produtos do totem: ' + err.message + '</div>';
      });
  }

  function renderizarCardsProdutos(produtos) {
    if (!produtos || produtos.length === 0) {
      gridProdutos.innerHTML = '<div class="text-center py-5 w-100 text-muted">Nenhum produto cadastrado no catálogo deste totem.</div>';
      return;
    }

    gridProdutos.innerHTML = produtos.map(function (p) {
      var ehEpi = p.tipo === "EPI";
      var badgeClass = ehEpi ? "totem-badge-tipo--epi" : "totem-badge-tipo--consumivel";
      var iconeClass = ehEpi ? "bi-shield-check" : "bi-box-seam";

      var statusBadgeHtml = "";
      var botaoHtml = "";

      if (p.status_item === "aguardando") {
        statusBadgeHtml = '<div class="totem-status-badge totem-status-badge--aguardando"><i class="bi bi-clock-history"></i> Aguardando aprovação</div>';
        botaoHtml = '<button type="button" class="btn btn-secondary w-100 py-2 fw-bold" disabled>Em análise pelo gestor</button>';
      } else if (p.elegivel) {
        statusBadgeHtml = '<div class="totem-status-badge totem-status-badge--disponivel"><i class="bi bi-check-circle"></i> ' + p.mensagem_status + '</div>';
        botaoHtml = '<button type="button" class="btn-solicitar-retirada w-100 btn-acao-retirar" data-id="' + p.id + '"><i class="bi bi-box-arrow-down"></i> Solicitar retirada</button>';
      } else if (p.status_item === "sem_estoque") {
        statusBadgeHtml = '<div class="totem-status-badge totem-status-badge--fora"><i class="bi bi-exclamation-circle"></i> Sem estoque no totem</div>';
        botaoHtml = '<button type="button" class="btn btn-outline-secondary w-100 py-2" disabled>Indisponível no totem</button>';
      } else {
        // Substituição antecipada (fora da cota ou requer justificativa)
        statusBadgeHtml = '<div class="totem-status-badge totem-status-badge--fora"><i class="bi bi-exclamation-triangle"></i> ' + p.mensagem_status + '</div>';
        botaoHtml = '<button type="button" class="btn-solicitar-substituicao w-100 btn-acao-substituir" data-id="' + p.id + '"><i class="bi bi-arrow-repeat"></i> Solicitar substituição antecipada</button>';
      }

      var infoCota = ehEpi
        ? (p.ultima_retirada ? "Última retirada: " + p.ultima_retirada : "Primeira retirada")
        : "Limite mensal: " + p.limite_mensal + " " + p.unidade_medida + " (Consumido: " + p.consumido_mes + ")";

      return (
        '<div class="totem-card-produto">' +
          '<div>' +
            '<div class="totem-card-produto__cabecalho">' +
              '<div class="totem-produto-icone"><i class="bi ' + iconeClass + '"></i></div>' +
              '<span class="totem-badge-tipo ' + badgeClass + '">' + p.tipo + '</span>' +
            '</div>' +
            '<div class="totem-card-produto__nome">' + p.nome + '</div>' +
            '<div class="totem-card-produto__info">' +
              '<span><i class="bi bi-info-circle me-1"></i> ' + infoCota + '</span>' +
              '<span><i class="bi bi-upc-scan me-1"></i> SKU: ' + p.sku + '</span>' +
            '</div>' +
            statusBadgeHtml +
          '</div>' +
          '<div>' + botaoHtml + '</div>' +
        '</div>'
      );
    }).join("");

    // Eventos dos botões de retirada regular
    document.querySelectorAll(".btn-acao-retirar").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var prodId = this.dataset.id;
        executarSolicitacao(prodId, "retirada", "");
      });
    });

    // Eventos dos botões de substituição antecipada
    document.querySelectorAll(".btn-acao-substituir").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var prodId = this.dataset.id;
        abrirTelaJustificativa(prodId);
      });
    });
  }

  /* ---------- Passo 5: Justificativa ---------- */
  function abrirTelaJustificativa(prodId) {
    var p = estado.produtos.find(function (item) { return item.id === prodId; });
    if (!p) return;
    estado.produtoSelecionado = p;

    document.getElementById("just-prod-nome").textContent = p.nome;
    document.getElementById("just-prod-detalhes").textContent = "SKU: " + p.sku + " · " + p.categoria + " · Limite: " + p.limite_mensal + " " + p.unidade_medida;
    document.getElementById("just-prod-ultima").textContent = p.ultima_retirada || "Não registrada";

    var agora = new Date();
    agora.setDate(agora.getDate() + 30);
    document.getElementById("just-prod-proxima").textContent = agora.toLocaleDateString("pt-BR");

    var txtJust = document.getElementById("texto-justificativa");
    txtJust.value = "";
    mostrarPasso("passo-justificativa");
  }

  document.querySelectorAll(".chip-sugestao").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var txtJust = document.getElementById("texto-justificativa");
      txtJust.value = this.dataset.texto;
      txtJust.focus();
    });
  });

  var btnEnviarJustificativa = document.getElementById("btn-enviar-justificativa");
  if (btnEnviarJustificativa) {
    btnEnviarJustificativa.addEventListener("click", function () {
      var texto = document.getElementById("texto-justificativa").value.trim();
      if (!texto) {
        alert("Por favor, informe a justificativa detalhada para análise técnica da IA e do gestor.");
        return;
      }
      if (estado.produtoSelecionado) {
        executarSolicitacao(estado.produtoSelecionado.id, "substituicao", texto);
      }
    });
  }

  /* ---------- Envio e Processamento da Solicitação ---------- */
  function executarSolicitacao(prodId, tipo, justificativa) {
    var payload = {
      matricula: estado.matricula,
      produto_id: prodId,
      quantidade: 1,
      tipo: tipo,
      justificativa: justificativa,
      totem_codigo: estado.totemCodigo,
    };

    fetch("/api/totem/solicitar/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.sucesso) throw new Error(res.erro || "Falha ao processar solicitação.");

        // Atualiza modal de sucesso
        document.getElementById("sucesso-titulo").textContent = "Solicitação Registrada!";
        document.getElementById("sucesso-mensagem").textContent = res.mensagem || "Solicitação enviada com sucesso! Sua solicitação foi encaminhada para a análise do gestor/almoxarifado.";

        var elIa = document.getElementById("sucesso-detalhe-ia");
        var elIaTxt = document.getElementById("sucesso-ia-texto");
        if (res.analise_ia) {
          elIa.classList.remove("d-none");
          elIaTxt.textContent = "Classificado pela IA como '" + res.analise_ia.categoria + "' com " + res.analise_ia.confianca + "% de confiança (Recomendação: " + res.analise_ia.recomendacao + "). Encaminhado para aprovação do gestor.";
        } else {
          elIa.classList.add("d-none");
        }

        if (bsModalSucesso) bsModalSucesso.show();

        // Contagem regressiva para reiniciar a sessão automaticamente no totem
        var segundos = 5;
        var elContagem = document.getElementById("contagem-regressiva");
        if (elContagem) elContagem.textContent = segundos;

        if (estado.timerSucesso) clearInterval(estado.timerSucesso);
        estado.timerSucesso = setInterval(function () {
          segundos--;
          if (elContagem) elContagem.textContent = segundos;
          if (segundos <= 0) {
            reiniciarSessao();
          }
        }, 1000);
      })
      .catch(function (err) {
        alert(err.message || "Erro de conexão ao enviar solicitação.");
      });
  }

  var btnConcluirSucesso = document.getElementById("btn-concluir-sucesso");
  if (btnConcluirSucesso) {
    btnConcluirSucesso.addEventListener("click", function () {
      reiniciarSessao();
    });
  }

  /* ---------- Modal: Minhas Solicitações ---------- */
  var btnMinhasSols = document.getElementById("btn-abrir-minhas-sols");
  if (btnMinhasSols) {
    btnMinhasSols.addEventListener("click", function () {
      if (!estado.colaborador) return;
      var corpoTabela = document.getElementById("lista-minhas-sols-body");
      corpoTabela.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Buscando seu histórico...</td></tr>';
      if (bsModalSols) bsModalSols.show();

      fetch("/api/totem/solicitacoes/?matricula=" + encodeURIComponent(estado.matricula))
        .then(function (res) { return res.json(); })
        .then(function (dados) {
          var sols = dados.solicitacoes || [];
          if (sols.length === 0) {
            corpoTabela.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">Você ainda não realizou solicitações neste totem.</td></tr>';
            return;
          }

          corpoTabela.innerHTML = sols.map(function (s) {
            var statusBadge = "bg-secondary";
            if (s.status_rotulo === "Aguardando aprovação") statusBadge = "bg-warning text-dark";
            if (s.status_rotulo === "Aprovada" || s.status_rotulo.indexOf("Retirada") !== -1) statusBadge = "bg-success";
            if (s.status_rotulo === "Reprovada") statusBadge = "bg-danger";

            return (
              '<tr>' +
                '<td class="fw-bold font-monospace">' + s.codigo + '</td>' +
                '<td class="text-muted small">' + s.data + '</td>' +
                '<td>' + s.produto + '</td>' +
                '<td><span class="badge bg-light text-dark border">' + s.motivo + '</span></td>' +
                '<td><span class="badge ' + statusBadge + '">' + s.status_rotulo + '</span></td>' +
              '</tr>'
            );
          }).join("");
        })
        .catch(function () {
          corpoTabela.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">Erro ao carregar histórico.</td></tr>';
        });
    });
  }

  /* ---------- Botões Universais de Navegação e Reinício ---------- */
  document.querySelectorAll(".btn-voltar").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var destino = this.dataset.destino;
      if (destino) mostrarPasso(destino);
    });
  });

  var btnReiniciar = document.getElementById("btn-reiniciar-sessao");
  if (btnReiniciar) {
    btnReiniciar.addEventListener("click", function () {
      if (confirm("Deseja realmente encerrar a sessão no totem?")) {
        reiniciarSessao();
      }
    });
  }

  // Teclado físico: permite digitar matrícula ou PIN normalmente em computadores/testes
  window.addEventListener("keydown", function (e) {
    var passoAtual = document.querySelector(".totem-passo.ativo");
    if (!passoAtual) return;

    if (passoAtual.id === "passo-matricula") {
      if (e.key >= "0" && e.key <= "9") {
        if (!estado.matricula.startsWith("MAT-")) estado.matricula = "MAT-";
        if (estado.matricula.length < 8) {
          estado.matricula += e.key;
          inputMatricula.value = estado.matricula;
        }
      } else if (e.key === "Backspace") {
        if (estado.matricula.length > 4) estado.matricula = estado.matricula.slice(0, -1);
        else estado.matricula = "";
        inputMatricula.value = estado.matricula;
      } else if (e.key === "Enter") {
        validarMatriculaEAvancar();
      }
    } else if (passoAtual.id === "passo-pin") {
      if (e.key >= "0" && e.key <= "9") {
        if (estado.pin.length < 4) {
          estado.pin += e.key;
          atualizarPinDots();
          if (estado.pin.length === 4) setTimeout(autenticarPin, 150);
        }
      } else if (e.key === "Backspace") {
        if (estado.pin.length > 0) {
          estado.pin = estado.pin.slice(0, -1);
          atualizarPinDots();
        }
      }
    }
  });
})();

