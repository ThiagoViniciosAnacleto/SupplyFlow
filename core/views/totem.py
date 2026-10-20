"""APIs do totem de autoatendimento (RF-10, RF-11, RF-16 a RF-21).

Depois do PIN correto o servidor abre uma "sessão do totem" (guardada no
servidor, não no navegador) que expira após 10 minutos sem uso. Todas as
outras chamadas do totem usam o colaborador dessa sessão — nunca uma
matrícula enviada pelo navegador.
"""
import time
from functools import wraps

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import registrar
from ..models import EstoqueTotem, Produto, Solicitacao, Totem, Usuario
from ..seguranca import bloqueado, limpar_falhas, registrar_falha, verificar_pin
from ..servicos import RegraViolada, estados
from ..servicos import solicitacoes as servico_solicitacoes
from ..servicos.elegibilidade import ACIMA_DA_COTA, ANTECIPADA, EXIGE_JUSTIFICATIVA, avaliar
from .util import EntradaInvalida, erro, fmt, inteiro, ler_json

CHAVE_SESSAO = "totem_colaborador_id"
CHAVE_EXPIRA = "totem_expira_em"
INATIVIDADE_SEGUNDOS = 10 * 60


def normalizar_matricula(valor):
    return (valor or "").strip().upper()


def primeiro_nome(nome):
    partes = (nome or "").strip().split()
    return partes[0] if partes else ""


def colaborador_da_sessao(request):
    """Colaborador autenticado no totem (renova o prazo de inatividade) ou None."""
    colaborador_id = request.session.get(CHAVE_SESSAO)
    if not colaborador_id or time.time() > request.session.get(CHAVE_EXPIRA, 0):
        encerrar_sessao_totem(request)
        return None
    colaborador = Usuario.objects.select_related("setor").filter(id=colaborador_id, ativo=True).first()
    if colaborador is None:
        encerrar_sessao_totem(request)
        return None
    request.session[CHAVE_EXPIRA] = time.time() + INATIVIDADE_SEGUNDOS
    return colaborador


def encerrar_sessao_totem(request):
    request.session.pop(CHAVE_SESSAO, None)
    request.session.pop(CHAVE_EXPIRA, None)


def api_totem(view):
    """Exige a sessão do totem aberta pelo PIN. Disponibiliza request.colaborador."""

    @wraps(view)
    def protegida(request, *args, **kwargs):
        colaborador = colaborador_da_sessao(request)
        if colaborador is None:
            return JsonResponse(
                {"sucesso": False, "erro": "Sua sessão no totem expirou. Identifique-se novamente."},
                status=401,
            )
        request.colaborador = colaborador
        return view(request, *args, **kwargs)

    return protegida


# ============================================================================
# IDENTIFICAÇÃO E PIN
# ============================================================================
@require_POST
def api_totem_identificar(request):
    """Confere se a matrícula existe. Devolve só o primeiro nome (como no protótipo),
    sem cargo, setor ou outros dados pessoais antes do PIN (RNF-05)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    matricula = normalizar_matricula(dados.get("matricula"))
    if bloqueado("pin", matricula):
        return JsonResponse(
            {"encontrado": False, "erro": "Muitas tentativas. Aguarde 15 minutos ou procure o almoxarifado."},
            status=429,
        )
    colaborador = Usuario.objects.filter(codigo_matricula=matricula, ativo=True).first()
    if not colaborador:
        return JsonResponse({"encontrado": False, "erro": "Matrícula não localizada no sistema."}, status=404)
    return JsonResponse({"encontrado": True, "matricula": matricula, "primeiro_nome": primeiro_nome(colaborador.nome)})


@require_POST
def api_totem_login(request):
    """Autentica o colaborador por matrícula + PIN e abre a sessão do totem (RF-11)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    matricula = normalizar_matricula(dados.get("matricula"))
    pin = str(dados.get("pin") or "").strip()
    if not matricula or not pin:
        return JsonResponse({"sucesso": False, "erro": "Informe matrícula e PIN."}, status=400)

    if bloqueado("pin", matricula):
        return JsonResponse(
            {"sucesso": False, "erro": "Muitas tentativas. Aguarde 15 minutos ou procure o almoxarifado."},
            status=429,
        )

    colaborador = Usuario.objects.select_related("setor").filter(codigo_matricula=matricula, ativo=True).first()
    if colaborador is None or not verificar_pin(colaborador, pin):
        registrar_falha("pin", matricula)
        registrar(request, "TOTEM_PIN_INCORRETO", colaborador, f"PIN incorreto para a matrícula {matricula}",
                  usuario=colaborador)
        return JsonResponse({"sucesso": False, "erro": "PIN incorreto. Tente novamente."}, status=401)

    limpar_falhas("pin", matricula)
    request.session.cycle_key()  # novo identificador de sessão a cada login
    request.session[CHAVE_SESSAO] = str(colaborador.id)
    request.session[CHAVE_EXPIRA] = time.time() + INATIVIDADE_SEGUNDOS
    colaborador.ultimo_acesso = timezone.now()
    colaborador.save(update_fields=["ultimo_acesso"])
    registrar(request, "TOTEM_LOGIN", colaborador, "Entrou no totem", usuario=colaborador)

    return JsonResponse({
        "sucesso": True,
        "colaborador": {
            "nome": colaborador.nome,
            "primeiro_nome": primeiro_nome(colaborador.nome),
            "matricula": colaborador.codigo_matricula,
            "cargo": colaborador.cargo or "Colaborador",
            "setor": colaborador.setor.nome if colaborador.setor else "Sem setor",
            "centro_custo": colaborador.setor.centro_custo if colaborador.setor else "",
        },
    })


@require_POST
def api_totem_sair(request):
    encerrar_sessao_totem(request)
    return JsonResponse({"sucesso": True})


def _totem(request, codigo=None):
    codigo = codigo or request.GET.get("totem_codigo") or "TOTEM-01"
    return Totem.objects.filter(codigo=codigo).first() or Totem.objects.filter(status_online=True).first()


# ============================================================================
# VITRINE, PEDIDO E ACOMPANHAMENTO
# ============================================================================
@require_GET
@api_totem
def api_totem_produtos(request):
    """Produtos com a situação de cada um para ESTE colaborador (RF-15 a RF-17, RNF-11).
    Tudo é calculado no servidor; o totem só exibe."""
    colaborador = request.colaborador
    totem = _totem(request)
    estoques = {e.produto_id: e for e in EstoqueTotem.objects.filter(totem=totem)} if totem else {}

    resultado = []
    for p in Produto.objects.select_related("categoria").filter(ativo=True).order_by("categoria__nome", "nome"):
        av = avaliar(colaborador, p, 1, estoques.get(p.id))
        if av.tem_pendente:
            situacao, acao = "aguardando", "Você já tem um pedido deste item em andamento."
        elif av.saldo_livre_totem <= 0:
            situacao, acao = "sem_estoque", "Sem estoque neste totem no momento. Procure o almoxarifado."
        elif av.excepcional:
            situacao = "excecao"
            acao = {
                ANTECIPADA: "Antes do prazo de troca"
                            + (f" (próxima em {fmt(av.proxima_regular, '%d/%m/%Y')})" if av.proxima_regular else "")
                            + ". Pode pedir com justificativa.",
                ACIMA_DA_COTA: f"Limite do mês atingido ({av.consumido_mes}/{av.regra.limite_mensal}). "
                               "Pode pedir com justificativa.",
                EXIGE_JUSTIFICATIVA: "Este item exige justificativa.",
            }[av.motivos[0]]
        else:
            situacao, acao = "disponivel", "Disponível para retirada."

        resultado.append({
            "id": str(p.id),
            "sku": p.sku,
            "nome": p.nome,
            "descricao": p.descricao or "",
            "tipo": "EPI" if p.eh_epi else "Consumível",
            "unidade_medida": p.unidade_medida,
            "limite_mensal": av.regra.limite_mensal,
            "consumido_mes": av.consumido_mes,
            "periodicidade_dias": av.regra.periodicidade_dias,
            "ultima_retirada": fmt(av.ultima_entrega, "%d/%m/%Y"),
            "saldo_totem": av.saldo_livre_totem,
            "situacao": situacao,
            "motivo_excecao": av.motivo_principal if av.excepcional else None,
            "mensagem": acao,
            "pode_solicitar": situacao in ("disponivel", "excecao"),
            "exige_justificativa": situacao == "excecao",
            "imagem_url": p.imagem_url or "",
        })

    pendentes = Solicitacao.objects.filter(
        solicitante=colaborador, status__in=list(estados.ESTADOS_AGUARDANDO) + list(estados.ESTADOS_APROVADOS)
    ).count()
    return JsonResponse({
        "totem": {"codigo": totem.codigo if totem else None, "nome": totem.nome if totem else None,
                  "localizacao": totem.localizacao if totem else None},
        "produtos": resultado,
        "total_solicitacoes_pendentes": pendentes,
    })


@require_POST
@api_totem
def api_totem_solicitar(request):
    """Registra o pedido. O servidor decide se é exceção e exige a justificativa (RF-18 a RF-20)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    colaborador = request.colaborador
    produto = Produto.objects.select_related("categoria").filter(id=dados.get("produto_id"), ativo=True).first() \
        if _uuid_valido(dados.get("produto_id")) else None
    if produto is None:
        return erro("Produto não encontrado.", status=404)
    try:
        quantidade = inteiro(dados.get("quantidade"), "Quantidade", minimo=1, padrao=1)
        s, av, motivos, analise = servico_solicitacoes.criar_no_totem(
            colaborador, produto, quantidade, _totem(request, dados.get("totem_codigo")),
            tipo=(dados.get("tipo") or "retirada").lower(),
            justificativa=dados.get("justificativa") or "",
        )
    except EntradaInvalida as e:
        return erro(str(e))
    except RegraViolada as e:
        return erro(str(e), status=e.status)

    registrar(request, "SOLICITACAO_CRIADA", s, f"{s.codigo}: {produto.nome} x{quantidade}",
              usuario=colaborador, excepcional=s.fora_da_cota, motivos=motivos)
    return JsonResponse({
        "sucesso": True,
        "codigo": s.codigo,
        "status": estados.rotulo(s.status),
        "excepcional": s.fora_da_cota,
        "mensagem": f"Pedido {s.codigo} enviado para análise. Acompanhe em “Minhas solicitações”.",
    })


@require_GET
@api_totem
def api_totem_solicitacoes_usuario(request):
    """As solicitações do próprio colaborador (RF-21)."""
    sols = (
        Solicitacao.objects.filter(solicitante=request.colaborador)
        .prefetch_related("itens__produto").order_by("-data_solicitacao")[:20]
    )
    resultado = []
    for s in sols:
        item = s.itens.first()
        status = estados.normalizar(s.status)
        resultado.append({
            "id": str(s.id),
            "codigo": s.codigo,
            "data": fmt(s.data_solicitacao, "%d/%m/%Y às %H:%M"),
            "produto": item.produto.nome if item else "—",
            "status": estados.chave_front(status),
            "status_rotulo": estados.rotulo(status),
            "motivo": s.motivo_categoria or "Retirada regular",
            "pode_cancelar": status in estados.ESTADOS_AGUARDANDO or status in estados.ESTADOS_APROVADOS,
        })
    return JsonResponse({"solicitacoes": resultado})


@require_POST
@api_totem
def api_totem_cancelar(request, solicitacao_id):
    """O colaborador cancela o próprio pedido antes da entrega (RF-50)."""
    s = Solicitacao.objects.filter(id=solicitacao_id, solicitante=request.colaborador).first()
    if s is None:
        return erro("Solicitação não encontrada.", status=404)
    try:
        servico_solicitacoes.cancelar(s, request.colaborador)
    except RegraViolada as e:
        return erro(str(e), status=e.status)
    registrar(request, "SOLICITACAO_CANCELADA", s, f"{s.codigo} cancelada pelo solicitante", usuario=request.colaborador)
    return JsonResponse({"sucesso": True, "mensagem": f"Pedido {s.codigo} cancelado."})


def _uuid_valido(valor):
    import uuid

    try:
        uuid.UUID(str(valor))
        return True
    except ValueError:
        return False
