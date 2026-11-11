/* =====================================================================
   SupplyFlow — Políticas de Fornecimento (RF-12, RF-13, RF-14)
   ---------------------------------------------------------------------
   Define limites mensais e periodicidade de troca específicos por
   setor/centro de custo, cargo (RH), função/atividade (SST),
   habilitação/credencial NR (SST) ou funcionário individual.
   ===================================================================== */

(function () {
  var escapar = SF.escapar;
  var aviso = document.getElementById("aviso-regras");
  var modal = new bootstrap.Modal(document.getElementById("modal-regra"));
  var form = document.getElementById("form-regra");
  var regras = [];
  var podeEditar = SF.sessao.pode("produtos");

  function mostrarAviso(texto, tipo) {
    aviso.className = "alert alert-" + tipo;
    aviso.textContent = texto;
    aviso.focus();
  }

  function montarOpcoesSelect(lista, rotuloVazio) {
    var htmlOpcoes = lista.map(function (item) {
      return '<option value="' + escapar(item.id) + '">' + escapar(item.nome) + "</option>";
    }).join("");
    return '<option value="">' + escapar(rotuloVazio) + "</option>" + htmlOpcoes;
  }

  function criarLinhaRegraHtml(regra) {
    var partesEscopo = [];
    if (regra.setor) {
      partesEscopo.push("Setor: " + regra.setor);
    }
    if (regra.cargo) {
      partesEscopo.push("Cargo: " + regra.cargo);
    }
    if (regra.funcao) {
      partesEscopo.push("Função: " + regra.funcao);
    }
    if (regra.habilitacao) {
      partesEscopo.push("Habilitação/NR: " + regra.habilitacao);
    }
    if (regra.funcionario) {
      partesEscopo.push("Funcionário: " + regra.funcionario);
    }
    var textoEscopo = partesEscopo.join(" · ") || "—";

    var htmlLimiteMensal;
    if (regra.limite_mensal != null) {
      htmlLimiteMensal = escapar(regra.limite_mensal) + " un.";
    } else {
      var valorPadraoLimite = (regra.padrao_limite != null) ? regra.padrao_limite : "—";
      htmlLimiteMensal = '<span class="text-muted">padrão (' + escapar(valorPadraoLimite) + ")</span>";
    }

    var htmlPeriodicidade;
    if (regra.periodicidade_dias) {
      htmlPeriodicidade = escapar(regra.periodicidade_dias) + " dias";
    } else {
      var valorPadraoPeriodicidade = regra.padrao_periodicidade || "—";
      htmlPeriodicidade = '<span class="text-muted">padrão (' + escapar(valorPadraoPeriodicidade) + ")</span>";
    }

    var classeSelo = regra.ativo ? "selo--aprovado" : "selo--cancelado";
    var textoSituacao = regra.ativo ? "Ativa" : "Inativa";

    var htmlAcoes = "—";
    if (podeEditar) {
      var corBotaoAlternar = regra.ativo ? "danger" : "success";
      var rotuloAlternar = regra.ativo ? "Inativar" : "Ativar";
      htmlAcoes =
        '<button type="button" class="btn btn-sm btn-outline-secondary me-1" data-editar="' + escapar(regra.id) + '"' +
                ' aria-label="Editar política de ' + escapar(regra.produto) + '">' +
          '<i class="bi bi-pencil" aria-hidden="true"></i>' +
        "</button>" +
        '<button type="button" class="btn btn-sm btn-outline-' + corBotaoAlternar + '" data-alternar="' + escapar(regra.id) + '">' +
          rotuloAlternar +
        "</button>";
    }

    return (
      "<tr>" +
        "<td><strong>" + escapar(regra.produto) + '</strong><span class="small text-muted d-block">' + escapar(regra.tipo) + "</span></td>" +
        "<td>" + escapar(textoEscopo) + "</td>" +
        "<td>" + htmlLimiteMensal + "</td>" +
        "<td>" + htmlPeriodicidade + "</td>" +
        '<td><span class="selo ' + classeSelo + '">' + textoSituacao + "</span></td>" +
        '<td class="tabela-solicitacoes__acao text-nowrap">' + htmlAcoes + "</td>" +
      "</tr>"
    );
  }

  function carregar() {
    SF.api.get("/api/politicas/")
      .then(function (dados) {
        regras = dados.regras || [];
        document.getElementById("btn-nova-regra").classList.toggle("d-none", !podeEditar);
        document.getElementById("regra-produto").innerHTML = montarOpcoesSelect(dados.produtos || [], "Selecione…");
        document.getElementById("regra-setor").innerHTML = montarOpcoesSelect(dados.setores || [], "Todos os setores");
        var selectFunc = document.getElementById("regra-funcionario");
        if (selectFunc) {
          selectFunc.innerHTML = montarOpcoesSelect(dados.funcionarios || [], "Qualquer funcionário do escopo");
        }
        var selectCargo = document.getElementById("regra-cargo");
        if (selectCargo) {
          var cargosHtml = ['<option value="">Todos os cargos</option>'];
          (dados.cargos || []).forEach(function (item) {
            var valor = typeof item === "string" ? item : (item.cargo || item.nome || "");
            if (valor) {
              cargosHtml.push('<option value="' + escapar(valor) + '">' + escapar(valor) + '</option>');
            }
          });
          selectCargo.innerHTML = cargosHtml.join("");
        }

        var datalistCargos = document.getElementById("lista-cargos");
        if (datalistCargos) {
          datalistCargos.innerHTML = (dados.cargos || []).map(function (item) {
            var valor = typeof item === "string" ? item : (item.cargo || item.nome || "");
            return '<option value="' + escapar(valor) + '">';
          }).join("");
        }

        var datalistFuncoes = document.getElementById("lista-funcoes");
        if (datalistFuncoes) {
          datalistFuncoes.innerHTML = (dados.funcoes || []).map(function (item) {
            var valor = typeof item === "string" ? item : (item.funcao || item.nome || "");
            return '<option value="' + escapar(valor) + '">';
          }).join("");
        }

        var datalistHabs = document.getElementById("lista-habilitacoes");
        if (datalistHabs) {
          datalistHabs.innerHTML = (dados.habilitacoes || []).map(function (item) {
            var valor = typeof item === "string" ? item : (item.habilitacao || item.nome || "");
            return '<option value="' + escapar(valor) + '">';
          }).join("");
        }

        var corpo = document.getElementById("corpo-regras");
        if (regras.length === 0) {
          corpo.innerHTML = '<tr><td colspan="6" class="tabela-solicitacoes__vazio">Nenhuma política cadastrada: valem os padrões de cada produto.</td></tr>';
          return;
        }
        corpo.innerHTML = regras.map(criarLinhaRegraHtml).join("");
      })
      .catch(function (erro) {
        mostrarAviso(erro.message, "danger");
      });
  }

  function abrirModalRegra(regra) {
    form.reset();
    document.getElementById("erro-regra").textContent = "";
    document.getElementById("regra-id").value = regra ? regra.id : "";
    if (regra) {
      document.getElementById("regra-produto").value = regra.produto_id;
      document.getElementById("regra-setor").value = regra.setor_id || "";
      var selectCargo = document.getElementById("regra-cargo");
      if (selectCargo && regra.cargo) {
        var temOpcao = Array.from(selectCargo.options).some(function (opt) { return opt.value === regra.cargo; });
        if (!temOpcao) {
          var opt = document.createElement("option");
          opt.value = regra.cargo;
          opt.textContent = regra.cargo;
          selectCargo.appendChild(opt);
        }
      }
      if (selectCargo) {
        selectCargo.value = regra.cargo || "";
      }
      var campoFuncao = document.getElementById("regra-funcao");
      if (campoFuncao) {
        campoFuncao.value = regra.funcao || "";
      }
      var campoHab = document.getElementById("regra-habilitacao");
      if (campoHab) {
        campoHab.value = regra.habilitacao || "";
      }
      var selectFunc = document.getElementById("regra-funcionario");
      if (selectFunc) {
        selectFunc.value = regra.funcionario_id || "";
      }
      document.getElementById("regra-limite").value = (regra.limite_mensal != null) ? regra.limite_mensal : "";
      document.getElementById("regra-periodicidade").value = regra.periodicidade_dias || "";
    }
    modal.show();
  }

  document.getElementById("btn-nova-regra").addEventListener("click", function () {
    abrirModalRegra(null);
  });

  document.getElementById("corpo-regras").addEventListener("click", function (evento) {
    var botaoEditar = evento.target.closest("[data-editar]");
    var botaoAlternar = evento.target.closest("[data-alternar]");

    if (botaoEditar) {
      var regraEncontrada = regras.find(function (item) {
        return item.id === botaoEditar.dataset.editar;
      });
      abrirModalRegra(regraEncontrada);
    }

    if (botaoAlternar) {
      SF.api.post("/api/politicas/" + encodeURIComponent(botaoAlternar.dataset.alternar) + "/toggle/")
        .then(carregar)
        .catch(function (erro) {
          mostrarAviso(erro.message, "danger");
        });
    }
  });

  form.addEventListener("submit", function (evento) {
    evento.preventDefault();
    var selectFunc = document.getElementById("regra-funcionario");
    var campoFuncao = document.getElementById("regra-funcao");
    var campoHab = document.getElementById("regra-habilitacao");
    var dadosFormulario = {
      id: document.getElementById("regra-id").value || null,
      produto_id: document.getElementById("regra-produto").value,
      setor_id: document.getElementById("regra-setor").value || null,
      cargo: document.getElementById("regra-cargo").value.trim(),
      funcao: campoFuncao ? campoFuncao.value.trim() : "",
      habilitacao: campoHab ? campoHab.value.trim() : "",
      funcionario_id: selectFunc ? (selectFunc.value || null) : null,
      limite_mensal: document.getElementById("regra-limite").value,
      periodicidade_dias: document.getElementById("regra-periodicidade").value
    };

    SF.api.post("/api/politicas/salvar/", dadosFormulario)
      .then(function (resposta) {
        modal.hide();
        mostrarAviso(resposta.mensagem, "success");
        carregar();
      })
      .catch(function (erro) {
        document.getElementById("erro-regra").textContent = erro.message;
      });
  });

  carregar();
})();
