"""Ciclo de vida de RH e governança operacional de colaboradores (Admissão, Grade de
Tamanhos, Kit Admissional, Mudança de Função, Habilitações/NRs e Desligamento/Nada Consta).

Persistência Zero-Migration: metadados de RH, função operacional, habilitações com
validade e histórico funcional são gravados e reconstruídos a partir de
`RegistroAuditoria` com `entidade="RH_FUNCIONARIO"`.
"""
import re

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
PREFIXO_FUNCAO = "FUNC:"
PREFIXO_HABILITACAO = "HAB:"

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


def normalizar_habilitacoes(habilitacoes, hoje_iso=None):
    """Normaliza uma lista ou texto de habilitações para
    `[{"nome": str, "validade": "YYYY-MM-DD" | "", "vencida": bool}]`."""
    if not habilitacoes:
        return []

    hoje_iso = hoje_iso or timezone.localdate().isoformat()
    itens_brutos = []

    if isinstance(habilitacoes, str):
        for parte in re.split(r"[|,;]", habilitacoes):
            parte = parte.strip()
            if not parte:
                continue
            if ":" in parte:
                nome_p, val_p = parte.split(":", 1)
                itens_brutos.append({"nome": nome_p.strip(), "validade": val_p.strip()})
            else:
                itens_brutos.append({"nome": parte, "validade": ""})
    elif isinstance(habilitacoes, (list, tuple)):
        for item in habilitacoes:
            if isinstance(item, dict):
                nome_p = str(item.get("nome") or item.get("habilitacao") or "").strip()
                val_p = str(item.get("validade") or "").strip()
                if nome_p:
                    itens_brutos.append({"nome": nome_p, "validade": val_p})
            elif isinstance(item, str):
                parte = item.strip()
                if not parte:
                    continue
                if ":" in parte:
                    nome_p, val_p = parte.split(":", 1)
                    itens_brutos.append({"nome": nome_p.strip(), "validade": val_p.strip()})
                else:
                    itens_brutos.append({"nome": parte, "validade": ""})

    por_chave = {}
    for item in itens_brutos:
        nome = item["nome"][:80].strip()
        if not nome:
            continue
        validade = item["validade"][:10].strip()
        if validade and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", validade):
            validade = ""
        vencida = bool(validade and validade < hoje_iso)
        por_chave[nome.lower()] = {
            "nome": nome,
            "validade": validade,
            "vencida": vencida,
        }

    return sorted(por_chave.values(), key=lambda x: x["nome"].lower())


def obter_ficha_rh(usuario):
    """Reconstrói os metadados de RH (tamanhos, função operacional, habilitações,
    PIN provisório e histórico funcional) a partir da trilha imutável de auditoria
    (`entidade="RH_FUNCIONARIO"`). Possui cache anexado à instância do usuário para alta performance (A1)."""
    ficha = {
        "tamanhos": {"calcado": "", "luva": "", "vestimenta": ""},
        "funcao": "",
        "habilitacoes": [],
        "pin_provisorio": False,
        "historico_funcional": [],
        "ultimo_desligamento": None,
    }
    if usuario is None or not getattr(usuario, "id", None):
        return ficha

    # Cache em memória na instância do modelo (evita N consultas na mesma requisição / vitrine de produtos)
    cache_ficha = getattr(usuario, "_cache_ficha_rh", None)
    if isinstance(cache_ficha, dict):
        return cache_ficha

    hoje_iso = timezone.localdate().isoformat()
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

        if "funcao" in det and det["funcao"] is not None:
            ficha["funcao"] = str(det["funcao"]).strip()

        if "habilitacoes" in det and isinstance(det["habilitacoes"], list):
            ficha["habilitacoes"] = normalizar_habilitacoes(det["habilitacoes"], hoje_iso=hoje_iso)

        if "pin_provisorio" in det and det["pin_provisorio"] is not None:
            ficha["pin_provisorio"] = bool(det["pin_provisorio"])
        elif ev.acao in ("TOTEM_PIN_ALTERADO", "TOTEM_TROCA_PIN", "PIN_DEFINITIVO"):
            ficha["pin_provisorio"] = False

        tem_campos_funcionais = any(
            det.get(c)
            for c in (
                "cargo_anterior",
                "cargo_novo",
                "funcao_anterior",
                "funcao_novo",
                "setor_anterior",
                "setor_novo",
            )
        )
        if ev.acao in ACOES_HISTORICO_FUNCIONAL or det.get("evento_funcional") or tem_campos_funcionais:
            item_historico = {
                "data": _fmt_data(ev.data, "%d/%m/%Y %H:%M"),
                "acao": ev.acao,
                "descricao": ev.descricao,
                "cargo_anterior": det.get("cargo_anterior") or "",
                "cargo_novo": det.get("cargo_novo") or "",
                "funcao_anterior": det.get("funcao_anterior") or "",
                "funcao_novo": det.get("funcao_novo") or "",
                "setor_anterior": det.get("setor_anterior") or "",
                "setor_novo": det.get("setor_novo") or "",
                "responsavel": ev.usuario_nome or "Sistema",
            }
            ficha["historico_funcional"].append(item_historico)
            if ev.acao == "DESLIGAMENTO":
                ficha["ultimo_desligamento"] = item_historico

    try:
        usuario._cache_ficha_rh = ficha
    except Exception:
        pass

    return ficha


def salvar_metadados_rh(
    request,
    usuario,
    tamanhos=None,
    pin_provisorio=None,
    evento_funcional=None,
    funcao=None,
    habilitacoes=None,
):
    """Salva/atualiza tamanhos de EPI, função operacional, habilitações/NRs, flag de
    PIN provisório e eventos de movimentação funcional para um colaborador."""
    ficha_atual = obter_ficha_rh(usuario)
    novos_tamanhos = dict(ficha_atual["tamanhos"])

    if isinstance(tamanhos, dict):
        for chave in ("calcado", "luva", "vestimenta"):
            if chave in tamanhos and tamanhos[chave] is not None:
                novos_tamanhos[chave] = str(tamanhos[chave]).strip()

    nova_funcao = ficha_atual["funcao"] if funcao is None else str(funcao).strip()

    if habilitacoes is None:
        novas_habilitacoes = [
            {"nome": h["nome"], "validade": h.get("validade") or ""}
            for h in ficha_atual["habilitacoes"]
        ]
    else:
        novas_habilitacoes = [
            {"nome": h["nome"], "validade": h.get("validade") or ""}
            for h in normalizar_habilitacoes(habilitacoes)
        ]

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
        "funcao": nova_funcao,
        "habilitacoes": novas_habilitacoes,
        "pin_provisorio": novo_pin_provisorio,
    }
    if isinstance(evento_funcional, dict):
        for campo in (
            "cargo_anterior",
            "cargo_novo",
            "funcao_anterior",
            "funcao_novo",
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
    if hasattr(usuario, "_cache_ficha_rh"):
        try:
            delattr(usuario, "_cache_ficha_rh")
        except Exception:
            pass
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
    EPIs do cargo, função, habilitações válidas e setor do colaborador."""
    ficha_rh = obter_ficha_rh(colaborador)
    todos_epis = [
        p
        for p in Produto.objects.select_related("categoria").filter(ativo=True).order_by("nome")
        if p.eh_epi
    ]
    if not todos_epis:
        return {"gerado": False, "quantidade_itens": 0, "codigos": [], "itens": []}

    cargo = (colaborador.cargo or "").strip()
    funcao = (ficha_rh.get("funcao") or "").strip()
    habilitacoes_ativas = [
        h["nome"].strip()
        for h in (ficha_rh.get("habilitacoes") or [])
        if (h.get("nome") or "").strip() and not h.get("vencida")
    ]
    marcador_matricula = f"{PREFIXO_FUNCIONARIO}{(colaborador.codigo_matricula or '').strip()}"

    condicao_regra = Q(cargo__iexact=marcador_matricula)
    if cargo:
        condicao_regra |= Q(cargo__iexact=cargo)
    if funcao:
        condicao_regra |= Q(cargo__iexact=f"{PREFIXO_FUNCAO}{funcao}") | Q(cargo__iexact=funcao)
    for hab in habilitacoes_ativas:
        condicao_regra |= Q(cargo__iexact=f"{PREFIXO_HABILITACAO}{hab}") | Q(cargo__iexact=hab)
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

    # C2 corrigido: Kit Admissional é estritamente derivado das regras cadastradas
    # (políticas de Cargo, Função, Habilitações válidas ou Setor do colaborador).
    # Se não houver políticas específicas associadas, não inventa kit aleatório com todo o catálogo.
    if not produtos_kit:
        return {
            "gerado": False,
            "quantidade_itens": 0,
            "codigos": [],
            "itens": [],
            "aviso": "Nenhuma política de fornecimento cadastrada para o cargo/função/habilitação deste colaborador.",
        }

    ja_em_andamento = set(
        SolicitacaoItem.objects.filter(
            solicitacao__solicitante=colaborador,
            solicitacao__status__in=list(estados.ESTADOS_AGUARDANDO) + list(estados.ESTADOS_APROVADOS),
        ).values_list("produto_id", flat=True)
    )
    produtos_elegiveis = [p for p in produtos_kit if p.id not in ja_em_andamento]

    if not produtos_elegiveis:
        return {"gerado": False, "quantidade_itens": 0, "codigos": [], "itens": []}

    # M3: Escolhe preferencialmente o totem vinculado ao setor do colaborador se houver
    totem = None
    if colaborador.setor_id:
        totem = Totem.objects.filter(status_online=True, localizacao__icontains=colaborador.setor.nome).first()
    if totem is None:
        totem = Totem.objects.filter(status_online=True).first() or Totem.objects.first()
    codigos = []
    itens_nomes = []

    with transaction.atomic():
        for prod in produtos_elegiveis:
            # C1 corrigido: trava o estoque antes de definir o status da solicitação.
            # Se houver saldo livre no totem, cria APROVADA e reserva.
            # Se não houver estoque suficiente no momento, cria como AGUARDANDO (sem reservar)
            # para aguardar reposição sem inflar falsamente a contabilidade de reservas.
            estoque_totem = estoque.travar(totem, prod) if totem is not None else None
            tem_saldo = bool(estoque_totem is not None and estoque_totem.livre >= 1)
            status_inicial = estados.APROVADA if tem_saldo else estados.AGUARDANDO
            motivo_status = motivo if tem_saldo else f"{motivo} (Aguardando reposição de estoque)"

            for tentativa in range(3):
                try:
                    with transaction.atomic():
                        solicitacao = Solicitacao.objects.create(
                            codigo=_proximo_codigo(),
                            solicitante=colaborador,
                            totem=totem,
                            status=status_inicial,
                            motivo_categoria=motivo,
                            justificativa_solicitante=(
                                f"{motivo_status} gerado para {colaborador.nome} ({colaborador.cargo or 'Colaborador'})"
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
                quantidade_aprovada=1 if tem_saldo else None,
                custo_unitario_momento=prod.custo_unitario,
            )

            if tem_saldo:
                DecisaoSolicitacao.objects.create(
                    solicitacao=solicitacao,
                    aprovador=responsavel,
                    decisao_final=estados.APROVADA,
                    seguiu_recomendacao_ia=False,
                    exige_devolucao=False,
                    justificativa_decisao=motivo,
                )
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
