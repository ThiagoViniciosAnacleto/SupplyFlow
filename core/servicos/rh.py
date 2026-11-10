"""Ciclo de vida de RH e governança operacional de colaboradores (Admissão, Grade de
Tamanhos, Kit Admissional, Mudança de Função e Desligamento/Nada Consta).

Persistência Zero-Migration: metadados de RH e histórico funcional são gravados e
reconstruídos a partir de `RegistroAuditoria` com `entidade="RH_FUNCIONARIO"`.
"""
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from ..auditoria import ip_da_requisicao
from ..models import (
    DecisaoSolicitacao,
    Devolucao,
    Entrega,
    Produto,
    RegraFornecimento,
    RegistroAuditoria,
    Solicitacao,
    SolicitacaoItem,
    Totem,
    Usuario,
)
from . import estados, estoque
from .solicitacoes import _proximo_codigo

ENTIDADE_RH = "RH_FUNCIONARIO"
PREFIXO_FUNCIONARIO = "MAT:"

TERMOS_CALCADO = ("bota", "botina", "calçado", "calcado", "sapato", "tênis", "tenis")
TERMOS_LUVA = ("luva", "mangote")
TERMOS_VESTIMENTA = (
    "camisa",
    "calça",
    "calca",
    "macacão",
    "macacao",
    "avental",
    "jaqueta",
    "colete",
    "uniforme",
    "vestimenta",
    "conjunto",
)

ACOES_HISTORICO_FUNCIONAL = frozenset({
    "ADMISSAO",
    "MUDANCA_FUNCAO",
    "DESLIGAMENTO",
    "REATIVACAO",
})


def _fmt_data(dt, padrao="%d/%m/%Y %H:%M"):
    if not dt:
        return ""
    return timezone.localtime(dt).strftime(padrao)


def obter_ficha_rh(usuario):
    """Reconstrói os metadados de RH (tamanhos, PIN provisório e histórico funcional)
    a partir da trilha imutável de auditoria (`entidade="RH_FUNCIONARIO"`)."""
    ficha = {
        "tamanhos": {"calcado": "", "luva": "", "vestimenta": ""},
        "pin_provisorio": False,
        "historico_funcional": [],
        "ultimo_desligamento": None,
    }
    if usuario is None or not getattr(usuario, "id", None):
        return ficha

    eventos = RegistroAuditoria.objects.filter(
        entidade=ENTIDADE_RH,
        entidade_id=str(usuario.id),
    ).order_by("data", "id")

    for ev in eventos:
        det = ev.detalhes if isinstance(ev.detalhes, dict) else {}
        tamanhos_ev = det.get("tamanhos")
        if isinstance(tamanhos_ev, dict):
            for chave in ("calcado", "luva", "vestimenta"):
                if chave in tamanhos_ev and tamanhos_ev[chave] is not None:
                    ficha["tamanhos"][chave] = str(tamanhos_ev[chave]).strip()
        else:
            for chave in ("calcado", "luva", "vestimenta"):
                if chave in det and det[chave] is not None:
                    ficha["tamanhos"][chave] = str(det[chave]).strip()

        if "pin_provisorio" in det and det["pin_provisorio"] is not None:
            ficha["pin_provisorio"] = bool(det["pin_provisorio"])
        elif ev.acao in ("TOTEM_PIN_ALTERADO", "TOTEM_TROCA_PIN", "PIN_DEFINITIVO"):
            ficha["pin_provisorio"] = False

        tem_campos_funcionais = any(
            det.get(c) for c in ("cargo_anterior", "cargo_novo", "setor_anterior", "setor_novo")
        )
        if ev.acao in ACOES_HISTORICO_FUNCIONAL or det.get("evento_funcional") or tem_campos_funcionais:
            item_historico = {
                "data": _fmt_data(ev.data, "%d/%m/%Y %H:%M"),
                "acao": ev.acao,
                "descricao": ev.descricao,
                "cargo_anterior": det.get("cargo_anterior") or "",
                "cargo_novo": det.get("cargo_novo") or "",
                "setor_anterior": det.get("setor_anterior") or "",
                "setor_novo": det.get("setor_novo") or "",
                "responsavel": ev.usuario_nome or "Sistema",
            }
            ficha["historico_funcional"].append(item_historico)
            if ev.acao == "DESLIGAMENTO":
                ficha["ultimo_desligamento"] = item_historico

    return ficha


def salvar_metadados_rh(request, usuario, tamanhos=None, pin_provisorio=None, evento_funcional=None):
    """Salva/atualiza tamanhos de EPI, flag de PIN provisório e eventos de movimentação
    funcional (Admissão, Mudança de Função, Desligamento) para um colaborador."""
    ficha_atual = obter_ficha_rh(usuario)
    novos_tamanhos = dict(ficha_atual["tamanhos"])

    if isinstance(tamanhos, dict):
        for chave in ("calcado", "luva", "vestimenta"):
            if chave in tamanhos and tamanhos[chave] is not None:
                novos_tamanhos[chave] = str(tamanhos[chave]).strip()

    novo_pin_provisorio = (
        ficha_atual["pin_provisorio"] if pin_provisorio is None else bool(pin_provisorio)
    )

    if isinstance(request, Usuario):
        ator = request
        ip = None
    elif request is not None:
        ator = getattr(request, "usuario", None) or getattr(request, "colaborador", None)
        ip = ip_da_requisicao(request) if hasattr(request, "META") else None
    else:
        ator = None
        ip = None

    acao = (
        evento_funcional["acao"]
        if isinstance(evento_funcional, dict) and evento_funcional.get("acao")
        else "RH_METADADOS_ATUALIZADOS"
    )
    descricao = (
        evento_funcional["descricao"]
        if isinstance(evento_funcional, dict) and evento_funcional.get("descricao")
        else f"Atualizou ficha de RH de {usuario.nome}"
    )

    detalhes = {
        "tamanhos": novos_tamanhos,
        "pin_provisorio": novo_pin_provisorio,
    }
    if isinstance(evento_funcional, dict):
        for campo in (
            "cargo_anterior",
            "cargo_novo",
            "setor_anterior",
            "setor_novo",
            "observacao",
            "resumo_desligamento",
        ):
            if campo in evento_funcional:
                detalhes[campo] = evento_funcional[campo]
        detalhes["evento_funcional"] = True

    RegistroAuditoria.objects.create(
        usuario=ator,
        usuario_nome=ator.nome if ator else (usuario.nome if usuario else ""),
        acao=acao[:50],
        entidade=ENTIDADE_RH,
        entidade_id=str(usuario.id),
        descricao=descricao[:255],
        detalhes=detalhes,
        ip=ip,
    )
    return obter_ficha_rh(usuario)


def tamanho_esperado_para_produto(ficha_rh, produto):
    """Retorna `(categoria_tamanho, valor_esperado)` para um `Produto` EPI que possua
    `produto.tamanho` preenchido."""
    if not getattr(produto, "eh_epi", False) or not (getattr(produto, "tamanho", None) or "").strip():
        return (None, "")

    if not isinstance(ficha_rh, dict):
        ficha_rh = obter_ficha_rh(ficha_rh)

    tamanhos = ficha_rh.get("tamanhos") or {}
    texto_produto = f"{produto.nome or ''} {produto.descricao or ''}".lower()

    if any(t in texto_produto for t in TERMOS_CALCADO):
        return ("calcado", (tamanhos.get("calcado") or "").strip())
    if any(t in texto_produto for t in TERMOS_LUVA):
        return ("luva", (tamanhos.get("luva") or "").strip())
    if any(t in texto_produto for t in TERMOS_VESTIMENTA):
        return ("vestimenta", (tamanhos.get("vestimenta") or "").strip())
    return (None, "")


def _tamanho_compativel(ficha_rh, produto):
    """Verifica se o tamanho do produto EPI é compatível com a grade do colaborador."""
    tam_prod = (getattr(produto, "tamanho", None) or "").strip()
    if not tam_prod:
        return True
    _, esperado = tamanho_esperado_para_produto(ficha_rh, produto)
    if not esperado:
        return True
    return tam_prod.upper() == esperado.strip().upper()


def gerar_kit_admissional(colaborador, responsavel, motivo="Kit Admissional"):
    """Gera solicitações já APROVADAS (com reserva de estoque quando disponível) para os
    EPIs da função/setor do colaborador na admissão ou mudança de função."""
    ficha_rh = obter_ficha_rh(colaborador)
    todos_epis = [
        p
        for p in Produto.objects.select_related("categoria").filter(ativo=True).order_by("nome")
        if p.eh_epi
    ]
    if not todos_epis:
        return {"gerado": False, "quantidade_itens": 0, "codigos": [], "itens": []}

    cargo = (colaborador.cargo or "").strip()
    marcador_matricula = f"{PREFIXO_FUNCIONARIO}{(colaborador.codigo_matricula or '').strip()}"

    condicao_regra = Q(cargo__iexact=marcador_matricula)
    if cargo:
        condicao_regra |= Q(cargo__iexact=cargo)
    if colaborador.setor_id:
        condicao_regra |= Q(setor_id=colaborador.setor_id, cargo="")

    regras_especificas = list(
        RegraFornecimento.objects.select_related("produto__categoria")
        .filter(ativo=True, produto__ativo=True)
        .filter(Q(setor__isnull=True) | Q(setor_id=colaborador.setor_id))
        .filter(condicao_regra)
    )

    produtos_kit = []
    vistos_ids = set()

    for r in regras_especificas:
        prod = r.produto
        if prod.eh_epi and prod.id not in vistos_ids and _tamanho_compativel(ficha_rh, prod):
            produtos_kit.append(prod)
            vistos_ids.add(prod.id)

    if not produtos_kit:
        categorias_tam_incluidas = set()
        for prod in todos_epis:
            if prod.id in vistos_ids:
                continue
            cat_tam, esperado = tamanho_esperado_para_produto(ficha_rh, prod)
            tam_prod = (prod.tamanho or "").strip()
            if tam_prod and esperado:
                if tam_prod.upper() != esperado.strip().upper():
                    continue
                produtos_kit.append(prod)
                vistos_ids.add(prod.id)
            elif tam_prod and cat_tam and not esperado:
                if cat_tam in categorias_tam_incluidas:
                    continue
                categorias_tam_incluidas.add(cat_tam)
                produtos_kit.append(prod)
                vistos_ids.add(prod.id)
            else:
                produtos_kit.append(prod)
                vistos_ids.add(prod.id)

    ja_em_andamento = set(
        SolicitacaoItem.objects.filter(
            solicitacao__solicitante=colaborador,
            solicitacao__status__in=list(estados.ESTADOS_AGUARDANDO) + list(estados.ESTADOS_APROVADOS),
        ).values_list("produto_id", flat=True)
    )
    produtos_elegiveis = [p for p in produtos_kit if p.id not in ja_em_andamento]

    if not produtos_elegiveis:
        return {"gerado": False, "quantidade_itens": 0, "codigos": [], "itens": []}

    totem = Totem.objects.filter(status_online=True).first() or Totem.objects.first()
    codigos = []
    itens_nomes = []

    with transaction.atomic():
        for prod in produtos_elegiveis:
            for tentativa in range(3):
                try:
                    with transaction.atomic():
                        solicitacao = Solicitacao.objects.create(
                            codigo=_proximo_codigo(),
                            solicitante=colaborador,
                            totem=totem,
                            status=estados.APROVADA,
                            motivo_categoria=motivo,
                            justificativa_solicitante=(
                                f"{motivo} gerado para {colaborador.nome} ({colaborador.cargo or 'Colaborador'})"
                            ),
                            fora_da_cota=False,
                            valor_total_estimado=prod.custo_unitario,
                        )
                    break
                except IntegrityError:
                    if tentativa == 2:
                        raise

            SolicitacaoItem.objects.create(
                solicitacao=solicitacao,
                produto=prod,
                quantidade_solicitada=1,
                quantidade_aprovada=1,
                custo_unitario_momento=prod.custo_unitario,
            )
            DecisaoSolicitacao.objects.create(
                solicitacao=solicitacao,
                aprovador=responsavel,
                decisao_final=estados.APROVADA,
                seguiu_recomendacao_ia=False,
                exige_devolucao=False,
                justificativa_decisao=motivo,
            )

            if totem is not None:
                estoque_totem = estoque.travar(totem, prod)
                if estoque_totem is not None and estoque_totem.livre >= 1:
                    estoque.reservar(estoque_totem, 1, responsavel, solicitacao)

            codigos.append(solicitacao.codigo)
            itens_nomes.append(prod.nome)

    return {
        "gerado": len(codigos) > 0,
        "quantidade_itens": len(itens_nomes),
        "codigos": codigos,
        "itens": itens_nomes,
    }


def resumo_desligamento(colaborador):
    """Retorna o resumo de Nada Consta de EPIs e pendências para desligamento."""
    devolvidas_ids = set(
        Devolucao.objects.filter(
            entrega_original__colaborador=colaborador,
            entrega_original__isnull=False,
        ).values_list("entrega_original_id", flat=True)
    )

    entregas_epi = (
        Entrega.objects.filter(colaborador=colaborador, eh_epi=True)
        .exclude(id__in=devolvidas_ids)
        .order_by("-data")[:10]
    )
    epis_em_posse = [
        {
            "produto": e.produto_nome,
            "ca": e.ca or "",
            "lote": e.lote or "",
            "data_entrega": _fmt_data(e.data, "%d/%m/%Y"),
        }
        for e in entregas_epi
    ]

    devolucoes_pendentes_qs = Solicitacao.objects.filter(
        solicitante=colaborador,
        status__in=list(estados.ESTADOS_APROVADOS),
        decisao__exige_devolucao=True,
        devolucao__isnull=True,
    )
    qtd_devolucoes_pendentes = devolucoes_pendentes_qs.count()

    solicitacoes_abertas_qs = Solicitacao.objects.filter(
        solicitante=colaborador,
        status__in=list(estados.ESTADOS_AGUARDANDO) + list(estados.ESTADOS_APROVADOS),
    )
    qtd_solicitacoes_abertas = solicitacoes_abertas_qs.count()

    return {
        "epis_em_posse": epis_em_posse,
        "devolucoes_pendentes": qtd_devolucoes_pendentes,
        "solicitacoes_abertas": qtd_solicitacoes_abertas,
        "nada_consta_apto": qtd_devolucoes_pendentes == 0,
    }
