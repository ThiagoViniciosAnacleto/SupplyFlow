/* =====================================================================
   SupplyFlow — Lógica do Totem de Autoatendimento
   ---------------------------------------------------------------------
   Fluxo em 5 passos (máquina de estados visual):
   1. Boas-vindas: escolha do método de identificação (Matrícula).
   2. Matrícula: digitação e validação em /api/totem/identificar/.
   3. PIN: digitação de 4 dígitos e autenticação em /api/totem/login/.
   4. Vitrine: exibição dos EPIs e consumíveis calculados pelo servidor
      (/api/totem/produtos/), respeitando estoque, cota e periodicidade.
   5. Justificativa: obrigatória quando o pedido é uma substituição
      antecipada ou fora da cota mensal (/api/totem/solicitar/).
   ===================================================================== */

(function () {
  var TAMANHO_MAX_MATRICULA = 12;

  /* Estado atual do atendimento no Totem */
  var estado = {
    matricula: "",
    pin: "",
    colaborador: null,
    produtos: [],
    produtoSelecionado: null,
    totemCodigo: "TOTEM-01",
    timerSucesso: null
  };

  /* Elementos principais do DOM */
  var inputMatricula = document.getElementById("input-matricula");
  var gridProdutos = document.getElementById("grid-produtos-totem");
  var modalMinhasSolsEl = document.getElementById("modal-minhas-sols");
  var modalSucessoEl = document.getElementById("modal-sucesso");

  var bsModalSols = modalMinhasSolsEl ? new bootstrap.Modal(modalMinhasSolsEl) : null;
  var bsModalSucesso = modalSucessoEl ? new bootstrap.Modal(modalSucessoEl) : null;

  /* Escapa caracteres especiais para evitar XSS ao inserir dados no HTML */
  function escapar(texto) {
    var div = document.createElement("div");
    if (texto == null) {
      div.textContent = "";
    } else {
      div.textContent = String(texto);
    }
    return div.innerHTML;
  }

  /* ---------- Navegação entre Passos ---------- */
  function mostrarPasso(passoId) {
    document.querySelectorAll(".totem-passo").forEach(function (secaoPasso) {
      secaoPasso.classList.remove("ativo");
    });
    var destino = document.getElementById(passoId);
    if (destino) {
      destino.classList.add("ativo");
      window.scrollTo(0, 0);
    }
  }

  /* Limpa todos os dados do colaborador atual e volta ao Passo 1 */
  function reiniciarSessao() {
    if (estado.timerSucesso) {
      clearInterval(estado.timerSucesso);
      estado.timerSucesso = null;
    }
    if (bsModalSucesso) {
      bsModalSucesso.hide();
    }
    if (bsModalSols) {
      bsModalSols.hide();
    }

    /* Encerra a sessão do totem no servidor para que o próximo colaborador comece do zero */
    if (estado.colaborador) {
      SF.api.post("/api/totem/sair/", {}, { semRedirecionar: true }).catch(function () {});
    }

    estado.matricula = "";
    estado.pin = "";
    estado.colaborador = null;
    estado.produtoSelecionado = null;

    if (inputMatricula) {
      inputMatricula.value = "";
    }
    atualizarPinDots();
    mostrarPasso("passo-boas-vindas");
  }

  /* Tratamento centralizado de erros das chamadas à API no Totem */
  function tratarErro(erro) {
    if (erro && erro.status === 401) {
      alert("Sua sessão no totem expirou. Identifique-se novamente.");
      reiniciarSessao();
      return;
    }
    var mensagem = (erro && erro.message) ? erro.message : "Não foi possível concluir. Tente novamente.";
    alert(mensagem);
  }

  /* ---------- Passo 1: Boas-vindas ---------- */
  var opcaoMatricula = document.getElementById("opcao-matricula");
  if (opcaoMatricula) {
    opcaoMatricula.addEventListener("click", function () {
      estado.matricula = "";
      if (inputMatricula) {
        inputMatricula.value = "";
      }
      mostrarPasso("passo-matricula");
    });
  }

  /* ---------- Passo 2: Teclado de Matrícula ---------- */
  document.querySelectorAll(".tecla-num").forEach(function (botaoTecla) {
    botaoTecla.addEventListener("click", function () {
      var digito = this.dataset.val;
      if (estado.matricula.length < TAMANHO_MAX_MATRICULA) {
        estado.matricula += digito;
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

  var btnMatriculaConfirmar = document.getElementById("btn-matricula-confirmar");
  if (btnMatriculaConfirmar) {
    btnMatriculaConfirmar.addEventListener("click", function () {
      validarMatriculaEAvancar();
    });
  }

  function validarMatriculaEAvancar() {
    var matriculaDigitada = (inputMatricula.value || estado.matricula).trim().toUpperCase();
    if (!matriculaDigitada) {
      alert("Por favor, digite ou selecione uma matrícula.");
      return;
    }
    estado.matricula = matriculaDigitada;

    /* Consulta o servidor: por privacidade, retorna apenas o primeiro nome antes do PIN */
    SF.api.post("/api/totem/identificar/", { matricula: matriculaDigitada }, { semRedirecionar: true })
      .then(function (dados) {
        document.getElementById("pin-colaborador-nome").textContent = dados.primeiro_nome;
        estado.pin = "";
        atualizarPinDots();
        mostrarPasso("passo-pin");
      })
      .catch(function (erro) {
        alert(erro.message || "Matrícula não localizada no sistema. Verifique os dígitos.");
      });
  }

  /* ---------- Passo 3: PIN de 4 Dígitos ---------- */
  function atualizarPinDots() {
    for (var i = 0; i < 4; i++) {
      var bolinha = document.getElementById("dot-" + i);
      if (bolinha) {
        if (i < estado.pin.length) {
          bolinha.classList.add("preenchido");
        } else {
          bolinha.classList.remove("preenchido");
        }
      }
    }
  }

  document.querySelectorAll(".tecla-pin").forEach(function (botaoPin) {
    botaoPin.addEventListener("click", function () {
      if (estado.pin.length < 4) {
        estado.pin += this.dataset.val;
        atualizarPinDots();

        if (estado.pin.length === 4) {
          /* Aguarda 150ms para o colaborador ver a 4ª bolinha preenchida antes de enviar */
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
      .catch(function (erro) {
        alert(erro.message || "PIN inválido. Tente novamente.");
        estado.pin = "";
        atualizarPinDots();
      });
  }

  /* ---------- Passo 4: Vitrine de Produtos ---------- */
  var ESTILOS_SITUACAO_PRODUTO = {
    disponivel:  { classe: "totem-status-badge--disponivel", icone: "bi-check-circle" },
    excecao:     { classe: "totem-status-badge--fora",       icone: "bi-exclamation-triangle" },
    aguardando:  { classe: "totem-status-badge--aguardando", icone: "bi-clock-history" },
    sem_estoque: { classe: "totem-status-badge--fora",       icone: "bi-exclamation-circle" }
  };

  function carregarVitrineProdutos() {
    var nomeExibicao = estado.colaborador.primeiro_nome || estado.colaborador.nome;
    document.getElementById("vitrine-nome").textContent = nomeExibicao;
    document.getElementById("vitrine-cargo").textContent = estado.colaborador.cargo;
    document.getElementById("vitrine-setor").textContent = estado.colaborador.setor;

    gridProdutos.innerHTML =
      '<div class="text-center py-5 w-100 text-muted">' +
        '<div class="spinner-border text-primary" role="status"></div>' +
        '<div class="mt-2">Consultando estoque do totem...</div>' +
      "</div>";
    mostrarPasso("passo-vitrine");

    var urlProdutos = "/api/totem/produtos/?totem_codigo=" + encodeURIComponent(estado.totemCodigo);
    SF.api.get(urlProdutos, { semRedirecionar: true })
      .then(function (dados) {
        estado.produtos = dados.produtos || [];
        document.getElementById("count-minhas-sols").textContent = dados.total_solicitacoes_pendentes || "0";
        renderizarCardsProdutos(estado.produtos);
      })
      .catch(function (erro) {
        if (erro.status === 401) {
          tratarErro(erro);
          return;
        }
        gridProdutos.innerHTML =
          '<div class="alert alert-danger w-100" role="alert">' +
            "Falha ao carregar os produtos: " + escapar(erro.message) +
          "</div>";
      });
  }

  /* Cria o botão de ação adequado para a situação de elegibilidade do produto */
  function criarBotaoAcaoProduto(produto) {
    if (produto.situacao === "disponivel") {
      return (
        '<button type="button" class="btn-solicitar-retirada w-100" data-acao="retirar" data-id="' + escapar(produto.id) + '">' +
          '<i class="bi bi-box-arrow-down" aria-hidden="true"></i> Solicitar retirada' +
        "</button>"
      );
    }

    if (produto.situacao === "excecao") {
      var rotuloBotaoExcecao = "Solicitar com justificativa";
      if (produto.motivo_excecao === "Substituição antecipada") {
        rotuloBotaoExcecao = "Solicitar substituição antecipada";
      }
      return (
        '<button type="button" class="btn-solicitar-substituicao w-100" data-acao="justificar" data-id="' + escapar(produto.id) + '">' +
          '<i class="bi bi-arrow-repeat" aria-hidden="true"></i> ' + escapar(rotuloBotaoExcecao) +
        "</button>"
      );
    }

    var rotuloDesabilitado = "Indisponível no totem";
    if (produto.situacao === "aguardando") {
      rotuloDesabilitado = "Pedido em andamento";
    }
    return (
      '<button type="button" class="btn btn-outline-secondary w-100 py-2" disabled>' +
        escapar(rotuloDesabilitado) +
      "</button>"
    );
  }

  /* Monta o HTML de um cartão de produto na vitrine */
  function criarCardProdutoHtml(produto) {
    var ehEpi = (produto.tipo === "EPI");
    var estiloSituacao = ESTILOS_SITUACAO_PRODUTO[produto.situacao] || ESTILOS_SITUACAO_PRODUTO.sem_estoque;
    var iconeProduto = ehEpi ? "bi-shield-check" : "bi-box-seam";
    var classeBadgeTipo = ehEpi ? "totem-badge-tipo--epi" : "totem-badge-tipo--consumivel";

    var linhasInfo = [];
    if (produto.limite_mensal != null) {
      linhasInfo.push(
        "Limite mensal: " + produto.limite_mensal + " " + produto.unidade_medida +
        " (usado: " + produto.consumido_mes + ")"
      );
    }
    if (ehEpi) {
      if (produto.ultima_retirada) {
        linhasInfo.push("Última retirada: " + produto.ultima_retirada);
      } else {
        linhasInfo.push("Primeira retirada");
      }
    }

    var htmlInfos = linhasInfo.map(function (textoLinha) {
      return '<span><i class="bi bi-info-circle me-1" aria-hidden="true"></i> ' + escapar(textoLinha) + "</span>";
    }).join("");

    return (
      '<div class="totem-card-produto">' +
        "<div>" +
          '<div class="totem-card-produto__cabecalho">' +
            '<div class="totem-produto-icone" aria-hidden="true"><i class="bi ' + iconeProduto + '"></i></div>' +
            '<span class="totem-badge-tipo ' + classeBadgeTipo + '">' + escapar(produto.tipo) + "</span>" +
          "</div>" +
          '<div class="totem-card-produto__nome">' + escapar(produto.nome) + "</div>" +
          '<div class="totem-card-produto__info">' + htmlInfos + "</div>" +
          '<div class="totem-status-badge ' + estiloSituacao.classe + '">' +
            '<i class="bi ' + estiloSituacao.icone + '" aria-hidden="true"></i> ' + escapar(produto.mensagem) +
          "</div>" +
        "</div>" +
        "<div>" + criarBotaoAcaoProduto(produto) + "</div>" +
      "</div>"
    );
  }

  function renderizarCardsProdutos(produtos) {
    if (!produtos || produtos.length === 0) {
      gridProdutos.innerHTML = '<div class="text-center py-5 w-100 text-muted">Nenhum produto disponível neste totem.</div>';
      return;
    }
    gridProdutos.innerHTML = produtos.map(criarCardProdutoHtml).join("");
  }

  gridProdutos.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-acao]");
    if (!botao) {
      return;
    }
    if (botao.dataset.acao === "retirar") {
      executarSolicitacao(botao.dataset.id, "retirada", "");
    } else {
      abrirTelaJustificativa(botao.dataset.id);
    }
  });

  /* ---------- Passo 5: Justificativa de Substituição Antecipada ---------- */
  function abrirTelaJustificativa(produtoId) {
    var produto = estado.produtos.find(function (item) {
      return item.id === produtoId;
    });
    if (!produto) {
      return;
    }
    estado.produtoSelecionado = produto;

    var textoDetalhes = produto.tipo;
    if (produto.motivo_excecao) {
      textoDetalhes += " · " + produto.motivo_excecao;
    }

    document.getElementById("just-prod-nome").textContent = produto.nome;
    document.getElementById("just-prod-detalhes").textContent = textoDetalhes;
    document.getElementById("just-prod-ultima").textContent = produto.ultima_retirada || "Não registrada";
    document.getElementById("just-prod-proxima").textContent = produto.mensagem;

    var campoJustificativa = document.getElementById("texto-justificativa");
    campoJustificativa.value = "";
    mostrarPasso("passo-justificativa");
    campoJustificativa.focus();
  }

  document.querySelectorAll(".chip-sugestao").forEach(function (botaoSugestao) {
    botaoSugestao.addEventListener("click", function () {
      var campoJustificativa = document.getElementById("texto-justificativa");
      campoJustificativa.value = this.dataset.texto;
      campoJustificativa.focus();
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

  /* ---------- Envio da Solicitação ao Servidor ---------- */
  function executarSolicitacao(produtoId, tipoSolicitacao, justificativa) {
    var payload = {
      produto_id: produtoId,
      quantidade: 1,
      tipo: tipoSolicitacao,
      justificativa: justificativa,
      totem_codigo: estado.totemCodigo
    };

    SF.api.post("/api/totem/solicitar/", payload, { semRedirecionar: true })
      .then(function (resposta) {
        document.getElementById("sucesso-titulo").textContent = "Pedido enviado!";
        document.getElementById("sucesso-mensagem").textContent = resposta.mensagem;

        var caixaDetalheIa = document.getElementById("sucesso-detalhe-ia");
        var textoDetalheIa = document.getElementById("sucesso-ia-texto");

        if (resposta.excepcional) {
          caixaDetalheIa.classList.remove("d-none");
          textoDetalheIa.textContent = "Como o pedido foge da regra normal, sua justificativa será analisada por um responsável.";
        } else {
          caixaDetalheIa.classList.add("d-none");
          textoDetalheIa.textContent = "";
        }

        if (bsModalSucesso) {
          bsModalSucesso.show();
        }

        var segundosRestantes = 5;
        var elementoContagem = document.getElementById("contagem-regressiva");
        if (elementoContagem) {
          elementoContagem.textContent = segundosRestantes;
        }
        if (estado.timerSucesso) {
          clearInterval(estado.timerSucesso);
        }
        estado.timerSucesso = setInterval(function () {
          segundosRestantes--;
          if (elementoContagem) {
            elementoContagem.textContent = segundosRestantes;
          }
          if (segundosRestantes <= 0) {
            reiniciarSessao();
          }
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

  /* ---------- Modal: Minhas Solicitações (RF-21) e Cancelamento (RF-50) ---------- */
  var CORES_STATUS = {
    "aguardando": "bg-warning text-dark",
    "aprovada": "bg-success",
    "aprovada-condicao": "bg-primary",
    "entregue": "bg-success",
    "rejeitada": "bg-danger",
    "cancelada": "bg-secondary"
  };
  var corpoMinhas = document.getElementById("lista-minhas-sols-body");

  function criarLinhaMinhaSolicitacaoHtml(solicitacao) {
    var classeBadgeStatus = CORES_STATUS[solicitacao.status] || "bg-secondary";
    var htmlBotaoCancelar = "—";

    if (solicitacao.pode_cancelar) {
      htmlBotaoCancelar =
        '<button type="button" class="btn btn-sm btn-outline-danger" data-cancelar="' + escapar(solicitacao.id) + '"' +
                ' aria-label="Cancelar pedido ' + escapar(solicitacao.codigo) + '">' +
          "Cancelar" +
        "</button>";
    }

    return (
      "<tr>" +
        '<td class="fw-bold font-monospace">' + escapar(solicitacao.codigo) + "</td>" +
        '<td class="text-muted small">' + escapar(solicitacao.data) + "</td>" +
        "<td>" + escapar(solicitacao.produto) + "</td>" +
        '<td><span class="badge bg-light text-dark border">' + escapar(solicitacao.motivo) + "</span></td>" +
        '<td><span class="badge ' + classeBadgeStatus + '">' + escapar(solicitacao.status_rotulo) + "</span></td>" +
        "<td>" + htmlBotaoCancelar + "</td>" +
      "</tr>"
    );
  }

  function carregarMinhas() {
    corpoMinhas.innerHTML =
      '<tr><td colspan="6" class="text-center py-4 text-muted">' +
        '<div class="spinner-border spinner-border-sm me-2" role="status"></div>Buscando seu histórico...' +
      "</td></tr>";

    SF.api.get("/api/totem/solicitacoes/", { semRedirecionar: true })
      .then(function (dados) {
        var solicitacoes = dados.solicitacoes || [];
        if (solicitacoes.length === 0) {
          corpoMinhas.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Você ainda não fez pedidos.</td></tr>';
          return;
        }
        corpoMinhas.innerHTML = solicitacoes.map(criarLinhaMinhaSolicitacaoHtml).join("");
      })
      .catch(function (erro) {
        if (erro.status === 401) {
          if (bsModalSols) {
            bsModalSols.hide();
          }
          tratarErro(erro);
          return;
        }
        corpoMinhas.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">Erro ao carregar histórico.</td></tr>';
      });
  }

  corpoMinhas.addEventListener("click", function (evento) {
    var botao = evento.target.closest("[data-cancelar]");
    if (!botao || !confirm("Cancelar este pedido?")) {
      return;
    }
    botao.disabled = true;
    var urlCancelar = "/api/totem/solicitacoes/" + encodeURIComponent(botao.dataset.cancelar) + "/cancelar/";
    SF.api.post(urlCancelar, {}, { semRedirecionar: true })
      .then(function () {
        carregarMinhas();
        carregarVitrineProdutos();
      })
      .catch(function (erro) {
        botao.disabled = false;
        tratarErro(erro);
      });
  });

  var btnMinhasSols = document.getElementById("btn-abrir-minhas-sols");
  if (btnMinhasSols) {
    btnMinhasSols.addEventListener("click", function () {
      if (!estado.colaborador) {
        return;
      }
      if (bsModalSols) {
        bsModalSols.show();
      }
      carregarMinhas();
    });
  }

  /* ---------- Botões Universais de Navegação e Reinício ---------- */
  document.querySelectorAll(".btn-voltar").forEach(function (botaoVoltar) {
    botaoVoltar.addEventListener("click", function () {
      var destino = this.dataset.destino;
      if (destino) {
        mostrarPasso(destino);
      }
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

  /* Teclado físico: permite digitar matrícula ou PIN em computadores ou leitores USB */
  window.addEventListener("keydown", function (evento) {
    var passoAtual = document.querySelector(".totem-passo.ativo");
    if (!passoAtual) {
      return;
    }

    if (passoAtual.id === "passo-matricula") {
      if (evento.key >= "0" && evento.key <= "9") {
        if (estado.matricula.length < TAMANHO_MAX_MATRICULA) {
          estado.matricula += evento.key;
          inputMatricula.value = estado.matricula;
        }
      } else if (evento.key === "Backspace") {
        estado.matricula = estado.matricula.slice(0, -1);
        inputMatricula.value = estado.matricula;
      } else if (evento.key === "Enter") {
        validarMatriculaEAvancar();
      }
    } else if (passoAtual.id === "passo-pin") {
      if (evento.key >= "0" && evento.key <= "9") {
        if (estado.pin.length < 4) {
          estado.pin += evento.key;
          atualizarPinDots();
          if (estado.pin.length === 4) {
            setTimeout(autenticarPin, 150);
          }
        }
      } else if (evento.key === "Backspace") {
        if (estado.pin.length > 0) {
          estado.pin = estado.pin.slice(0, -1);
          atualizarPinDots();
        }
      }
    }
  });
})();
