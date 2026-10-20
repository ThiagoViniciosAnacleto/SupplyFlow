/* =====================================================================
   SupplyFlow — Lógica do Totem de Autoatendimento
   Conectado 100% à API Django (/api/totem/...) e ao PostgreSQL no Render.
   ===================================================================== */

(function () {
  var TAMANHO_MAX_MATRICULA = 12;
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

    // Encerra a sessão do totem no servidor (o próximo colaborador começa do zero)
    if (estado.colaborador) {
      SF.api.post("/api/totem/sair/", {}, { semRedirecionar: true }).catch(function () {});
    }
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
    // É um "botão" feito com div (role="button"): Enter e Espaço precisam funcionar como clique
    opcaoMatricula.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        opcaoMatricula.click();
      }
    });
  }

  /* ---------- Passo 2: Teclado de Matrícula ---------- */
  document.querySelectorAll(".tecla-num").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = this.dataset.val;
      if (estado.matricula.length < TAMANHO_MAX_MATRICULA) {
        estado.matricula += val;
        inputMatricula.value = estado.matricula;
      }
    });
  });

  var btnMatriculaApagar = document.getElementById("btn-matricula-apagar");
  if (btnMatriculaApagar) {
    btnMatriculaApagar.addEventListener("click", function () {
      estado.matricula = estado.matricula.slice(0, -1);
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
    estado.matricula = mat;

    // Chama o endpoint de identificação
    SF.api.post("/api/totem/identificar/", { matricula: mat }, { semRedirecionar: true })
      .then(function (dados) {
        document.getElementById("pin-colaborador-nome").textContent = dados.primeiro_nome;

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
    SF.api.post("/api/totem/login/", { matricula: estado.matricula, pin: estado.pin }, { semRedirecionar: true })
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

    SF.api.get("/api/totem/produtos/?totem_codigo=" + encodeURIComponent(estado.totemCodigo), { semRedirecionar: true })
      .then(function (dados) {
        estado.produtos = dados.produtos || [];
        document.getElementById("count-minhas-sols").textContent = dados.total_solicitacoes_pendentes || "0";
        renderizarCardsProdutos(estado.produtos);
      })
      .catch(function (err) {
        if (err.status === 401) { tratarErro(err); return; }
        gridProdutos.innerHTML = '<div class="alert alert-danger w-100" role="alert">Falha ao carregar os produtos: ' + escapar(err.message) + "</div>";
      });
  }

  function escapar(texto) {
    var div = document.createElement("div");
    div.textContent = texto == null ? "" : String(texto);
    return div.innerHTML;
  }

  /* Erro da API: sessão expirada volta ao início; o resto vira aviso legível */
  function tratarErro(erro) {
    if (erro && erro.status === 401) {
      alert("Sua sessão no totem expirou. Identifique-se novamente.");
      reiniciarSessao();
      return;
    }
    alert((erro && erro.message) || "Não foi possível concluir. Tente novamente.");
  }

  var SITUACAO = {
    disponivel: { classe: "totem-status-badge--disponivel", icone: "bi-check-circle" },
    excecao: { classe: "totem-status-badge--fora", icone: "bi-exclamation-triangle" },
    aguardando: { classe: "totem-status-badge--aguardando", icone: "bi-clock-history" },
    sem_estoque: { classe: "totem-status-badge--fora", icone: "bi-exclamation-circle" }
  };

  function renderizarCardsProdutos(produtos) {
    if (!produtos || produtos.length === 0) {
      gridProdutos.innerHTML = '<div class="text-center py-5 w-100 text-muted">Nenhum produto disponível neste totem.</div>';
      return;
    }

    gridProdutos.innerHTML = produtos.map(function (p) {
      var ehEpi = p.tipo === "EPI";
      var sit = SITUACAO[p.situacao] || SITUACAO.sem_estoque;
      var botao;
      if (p.situacao === "disponivel") {
        botao = '<button type="button" class="btn-solicitar-retirada w-100" data-acao="retirar" data-id="' + escapar(p.id) + '">' +
          '<i class="bi bi-box-arrow-down" aria-hidden="true"></i> Solicitar retirada</button>';
      } else if (p.situacao === "excecao") {
        botao = '<button type="button" class="btn-solicitar-substituicao w-100" data-acao="justificar" data-id="' + escapar(p.id) + '">' +
          '<i class="bi bi-arrow-repeat" aria-hidden="true"></i> ' + escapar(p.motivo_excecao === "Substituição antecipada"
            ? "Solicitar substituição antecipada" : "Solicitar com justificativa") + "</button>";
      } else {
        botao = '<button type="button" class="btn btn-outline-secondary w-100 py-2" disabled>' +
          escapar(p.situacao === "aguardando" ? "Pedido em andamento" : "Indisponível no totem") + "</button>";
      }

      var info = [];
      if (p.limite_mensal != null) info.push("Limite mensal: " + p.limite_mensal + " " + p.unidade_medida + " (usado: " + p.consumido_mes + ")");
      if (ehEpi) info.push(p.ultima_retirada ? "Última retirada: " + p.ultima_retirada : "Primeira retirada");

      return '<div class="totem-card-produto">' +
          "<div>" +
            '<div class="totem-card-produto__cabecalho">' +
              '<div class="totem-produto-icone" aria-hidden="true"><i class="bi ' + (ehEpi ? "bi-shield-check" : "bi-box-seam") + '"></i></div>' +
              '<span class="totem-badge-tipo ' + (ehEpi ? "totem-badge-tipo--epi" : "totem-badge-tipo--consumivel") + '">' + escapar(p.tipo) + "</span>" +
            "</div>" +
            '<div class="totem-card-produto__nome">' + escapar(p.nome) + "</div>" +
            '<div class="totem-card-produto__info">' +
              info.map(function (linha) { return '<span><i class="bi bi-info-circle me-1" aria-hidden="true"></i> ' + escapar(linha) + "</span>"; }).join("") +
            "</div>" +
            '<div class="totem-status-badge ' + sit.classe + '"><i class="bi ' + sit.icone + '" aria-hidden="true"></i> ' + escapar(p.mensagem) + "</div>" +
          "</div>" +
          "<div>" + botao + "</div>" +
        "</div>";
    }).join("");
  }

  gridProdutos.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-acao]");
    if (!botao) return;
    if (botao.dataset.acao === "retirar") executarSolicitacao(botao.dataset.id, "retirada", "");
    else abrirTelaJustificativa(botao.dataset.id);
  });

  /* ---------- Passo 5: Justificativa ---------- */
  function abrirTelaJustificativa(prodId) {
    var p = estado.produtos.find(function (item) { return item.id === prodId; });
    if (!p) return;
    estado.produtoSelecionado = p;

    document.getElementById("just-prod-nome").textContent = p.nome;
    document.getElementById("just-prod-detalhes").textContent = p.tipo + (p.motivo_excecao ? " · " + p.motivo_excecao : "");
    document.getElementById("just-prod-ultima").textContent = p.ultima_retirada || "Não registrada";
    // A próxima troca regular vem da mensagem calculada pelo servidor (sem data inventada)
    document.getElementById("just-prod-proxima").textContent = p.mensagem;

    var txtJust = document.getElementById("texto-justificativa");
    txtJust.value = "";
    mostrarPasso("passo-justificativa");
    txtJust.focus();
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
      if (texto.length < 10) {
        alert("Explique o motivo com pelo menos 10 caracteres. Ex.: “A luva rasgou durante o corte de chapas”.");
        return;
      }
      if (estado.produtoSelecionado) {
        executarSolicitacao(estado.produtoSelecionado.id, "substituicao", texto);
      }
    });
  }

  /* ---------- Envio da solicitação ---------- */
  function executarSolicitacao(prodId, tipo, justificativa) {
    var payload = { produto_id: prodId, quantidade: 1, tipo: tipo, justificativa: justificativa,
                    totem_codigo: estado.totemCodigo };

    SF.api.post("/api/totem/solicitar/", payload, { semRedirecionar: true })
      .then(function (res) {
        document.getElementById("sucesso-titulo").textContent = "Pedido enviado!";
        document.getElementById("sucesso-mensagem").textContent = res.mensagem;
        var elIa = document.getElementById("sucesso-detalhe-ia");
        elIa.classList.toggle("d-none", !res.excepcional);
        document.getElementById("sucesso-ia-texto").textContent = res.excepcional
          ? "Como o pedido foge da regra normal, sua justificativa será analisada por um responsável."
          : "";

        if (bsModalSucesso) bsModalSucesso.show();
        var segundos = 5;
        var elContagem = document.getElementById("contagem-regressiva");
        if (elContagem) elContagem.textContent = segundos;
        if (estado.timerSucesso) clearInterval(estado.timerSucesso);
        estado.timerSucesso = setInterval(function () {
          segundos--;
          if (elContagem) elContagem.textContent = segundos;
          if (segundos <= 0) reiniciarSessao();
        }, 1000);
      })
      .catch(tratarErro);
  }

  var btnConcluirSucesso = document.getElementById("btn-concluir-sucesso");
  if (btnConcluirSucesso) {
    btnConcluirSucesso.addEventListener("click", function () {
      reiniciarSessao();
    });
  }

  /* ---------- Modal: Minhas solicitações (RF-21) e cancelamento (RF-50) ---------- */
  var CORES_STATUS = {
    "aguardando": "bg-warning text-dark", "aprovada": "bg-success", "aprovada-condicao": "bg-primary",
    "entregue": "bg-success", "rejeitada": "bg-danger", "cancelada": "bg-secondary"
  };
  var corpoMinhas = document.getElementById("lista-minhas-sols-body");

  function carregarMinhas() {
    corpoMinhas.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Buscando seu histórico...</td></tr>';
    SF.api.get("/api/totem/solicitacoes/", { semRedirecionar: true })
      .then(function (dados) {
        var sols = dados.solicitacoes || [];
        corpoMinhas.innerHTML = sols.length ? sols.map(function (s) {
          return "<tr>" +
            '<td class="fw-bold font-monospace">' + escapar(s.codigo) + "</td>" +
            '<td class="text-muted small">' + escapar(s.data) + "</td>" +
            "<td>" + escapar(s.produto) + "</td>" +
            '<td><span class="badge bg-light text-dark border">' + escapar(s.motivo) + "</span></td>" +
            '<td><span class="badge ' + (CORES_STATUS[s.status] || "bg-secondary") + '">' + escapar(s.status_rotulo) + "</span></td>" +
            "<td>" + (s.pode_cancelar
              ? '<button type="button" class="btn btn-sm btn-outline-danger" data-cancelar="' + escapar(s.id) + '"' +
                ' aria-label="Cancelar pedido ' + escapar(s.codigo) + '">Cancelar</button>'
              : "—") + "</td>" +
          "</tr>";
        }).join("") : '<tr><td colspan="6" class="text-center py-4 text-muted">Você ainda não fez pedidos.</td></tr>';
      })
      .catch(function (erro) {
        if (erro.status === 401) { if (bsModalSols) bsModalSols.hide(); tratarErro(erro); return; }
        corpoMinhas.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Erro ao carregar histórico.</td></tr>';
      });
  }

  corpoMinhas.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-cancelar]");
    if (!botao || !confirm("Cancelar este pedido?")) return;
    botao.disabled = true;
    SF.api.post("/api/totem/solicitacoes/" + encodeURIComponent(botao.dataset.cancelar) + "/cancelar/", {},
      { semRedirecionar: true })
      .then(function () { carregarMinhas(); carregarVitrineProdutos(); })
      .catch(function (erro) { botao.disabled = false; tratarErro(erro); });
  });

  var btnMinhasSols = document.getElementById("btn-abrir-minhas-sols");
  if (btnMinhasSols) {
    btnMinhasSols.addEventListener("click", function () {
      if (!estado.colaborador) return;
      if (bsModalSols) bsModalSols.show();
      carregarMinhas();
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
        if (estado.matricula.length < TAMANHO_MAX_MATRICULA) {
          estado.matricula += e.key;
          inputMatricula.value = estado.matricula;
        }
      } else if (e.key === "Backspace") {
        estado.matricula = estado.matricula.slice(0, -1);
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

