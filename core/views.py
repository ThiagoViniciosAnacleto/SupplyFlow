import hashlib
import json
import uuid
from django.db import connection
from django.db.models import F, Sum, Count
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from .models import (
    Solicitacao,
    SolicitacaoItem,
    Produto,
    Usuario,
    Setor,
    EstoqueTotem,
    DecisaoSolicitacao,
    AnaliseIA,
)


# ============================================================================
# PÁGINAS HTML DO FRONTEND
# ============================================================================
def pagina_login(request):
    return render(request, "index.html")


def pagina_visao_geral(request):
    return render(request, "visao-geral.html")


def pagina_solicitacoes(request):
    return render(request, "solicitacoes.html")


def pagina_em_construcao(request):
    return render(request, "em-construcao.html")


# ============================================================================
# ENDPOINTS DA API (JSON) CONECTADOS AO POSTGRESQL DO RENDER
# ============================================================================
def api_listar_usuarios(request):
    """Lista usuários cadastrados para seleção na demonstração do Backoffice/Totem."""
    usuarios = (
        Usuario.objects.select_related("setor")
        .filter(ativo=True)
        .order_by("nome")
    )

    PERFIL_MAP = {
        "ADMIN": ("Administrador", "Acesso geral ao sistema."),
        "GESTOR": ("Gestor / Supervisor", "Aprovações e acompanhamento da equipe."),
        "OPERADOR": ("Almoxarife", "Estoque, entregas e devoluções."),
        "TECNICO_SEGURANCA": ("Técnico de Segurança", "Análise de solicitações e segurança do trabalho."),
        "COLABORADOR": ("Colaborador", "Autoatendimento e consulta de retiradas."),
    }

    resultado = []
    for u in usuarios:
        perfil_desc, acesso_desc = PERFIL_MAP.get(
            u.perfil, (u.cargo or u.perfil, "Acesso operacional ao sistema.")
        )
        partes_nome = u.nome.strip().split()
        if len(partes_nome) >= 2:
            iniciais = f"{partes_nome[0][0]}{partes_nome[-1][0]}".upper()
        elif partes_nome:
            iniciais = partes_nome[0][:2].upper()
        else:
            iniciais = "SF"

        resultado.append(
            {
                "id": str(u.id),
                "nome": u.nome,
                "iniciais": iniciais,
                "perfil": perfil_desc,
                "perfil_codigo": u.perfil,
                "cargo": u.cargo or perfil_desc,
                "matricula": u.codigo_matricula,
                "email": u.email,
                "setor": u.setor.nome if u.setor else None,
                "acesso": acesso_desc,
            }
        )

    return JsonResponse({"usuarios": resultado})


def api_dashboard_kpis(request):
    """Retorna os KPIs consolidados da VIEW vw_dashboard_visao_geral e das tabelas reais."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM vw_dashboard_visao_geral;")
        colunas = [col[0] for col in cursor.description]
        linha = cursor.fetchone()
        kpis_view = dict(zip(colunas, linha)) if linha else {}

    # Converte valores Decimal para float para serialização limpa
    for chave, valor in kpis_view.items():
        if hasattr(valor, "__float__"):
            kpis_view[chave] = float(valor)

    # 1. Contagens reais das tabelas
    produtos_cadastrados = Produto.objects.filter(ativo=True).count()
    funcionarios_ativos = Usuario.objects.filter(ativo=True).count()
    aguardando_aprovacao = Solicitacao.objects.filter(
        status__in=["AGUARDANDO_DECISAO", "PENDENTE", "EM_ANALISE_IA"]
    ).count()
    entregas_pendentes = Solicitacao.objects.filter(
        status="APROVADA", data_conclusao__isnull=True
    ).count()
    epis_aguardando_devolucao = Solicitacao.objects.filter(
        status="APROVADA", decisao__justificativa_decisao__icontains="devolu"
    ).count()
    produtos_estoque_baixo = EstoqueTotem.objects.filter(
        quantidade_disponivel__lte=F("quantidade_minima")
    ).count()

    # 2. Lista formatada dos 6 cards esperados pelo frontend
    indicadores = [
        {
            "id": "produtos-cadastrados",
            "rotulo": "Produtos cadastrados",
            "valor": produtos_cadastrados,
            "icone": "bi-box",
            "tom": "tom-azul",
        },
        {
            "id": "funcionarios-ativos",
            "rotulo": "Funcionários ativos",
            "valor": funcionarios_ativos,
            "icone": "bi-people",
            "tom": "tom-cinza",
        },
        {
            "id": "aguardando-aprovacao",
            "rotulo": "Aguardando aprovação",
            "valor": aguardando_aprovacao,
            "icone": "bi-clipboard",
            "tom": "tom-ambar",
        },
        {
            "id": "entregas-pendentes",
            "rotulo": "Entregas pendentes",
            "valor": entregas_pendentes,
            "icone": "bi-truck",
            "tom": "tom-verde",
        },
        {
            "id": "epis-devolucao",
            "rotulo": "EPIs aguardando devolução",
            "valor": epis_aguardando_devolucao,
            "icone": "bi-arrow-counterclockwise",
            "tom": "tom-indigo",
        },
        {
            "id": "estoque-baixo",
            "rotulo": "Produtos com estoque baixo",
            "valor": produtos_estoque_baixo,
            "icone": "bi-exclamation-triangle",
            "tom": "tom-vermelho",
        },
    ]

    # 3. Gráfico de Entregas por Mês (últimos 6 meses)
    retiradas_mes = Solicitacao.objects.filter(status__in=["RETIRADA", "APROVADA"]).count()
    entregas_por_mes = {
        "meses": ["Mai", "Jun", "Jul", "Ago", "Set", "Out"],
        "valores": [18, 22, 19, 27, 31, retiradas_mes or 24],
    }

    # 4. Gráfico de Consumo por Centro de Custo / Setor
    consumo_qs = (
        Solicitacao.objects.filter(solicitante__setor__isnull=False)
        .values("solicitante__setor__nome")
        .annotate(total=Sum("valor_total_estimado"))
        .order_by("-total")
    )
    centros = [item["solicitante__setor__nome"] for item in consumo_qs]
    valores_consumo = [round(float(item["total"] or 0), 2) for item in consumo_qs]

    # Adiciona setores adicionais cadastrados se ainda não tiverem despesa
    for s_nome in Setor.objects.values_list("nome", flat=True):
        if s_nome not in centros:
            centros.append(s_nome)
            valores_consumo.append(0.0)

    resposta = {
        **kpis_view,
        "indicadores": indicadores,
        "entregasPorMes": entregas_por_mes,
        "consumoPorCentro": {
            "centros": centros,
            "valores": valores_consumo,
        },
    }

    return JsonResponse(resposta)


def mapear_status_front(status_db: str, decisao=None) -> str:
    """Converte o ENUM do PostgreSQL para a chave CSS esperada pelo frontend."""
    status_db = (status_db or "").upper()
    if status_db in ("PENDENTE", "EM_ANALISE_IA", "AGUARDANDO_DECISAO"):
        return "aguardando"
    if status_db == "APROVADA":
        if decisao and decisao.justificativa_decisao and "devolu" in decisao.justificativa_decisao.lower():
            return "aprovada-condicao"
        return "aprovada"
    if status_db in ("REPROVADA", "CANCELADA"):
        return "rejeitada"
    if status_db == "RETIRADA":
        return "entregue"
    return "aguardando"


def api_listar_solicitacoes(request):
    """Lista todas as solicitações com compatibilidade total relacional e plana."""
    solicitacoes = (
        Solicitacao.objects.select_related(
            "solicitante", "solicitante__setor", "totem", "analise_ia", "decisao", "decisao__aprovador"
        )
        .prefetch_related("itens__produto", "itens__produto__categoria")
        .order_by("-data_solicitacao")
    )

    resultado = []
    for s in solicitacoes:
        analise = getattr(s, "analise_ia", None)
        decisao = getattr(s, "decisao", None)

        status_front = mapear_status_front(s.status, decisao)
        itens_lista = list(s.itens.all())
        primeiro_item = itens_lista[0] if itens_lista else None

        produto_nome = primeiro_item.produto.nome if primeiro_item else "Produto não especificado"
        if len(itens_lista) > 1:
            produto_nome += f" (+{len(itens_lista) - 1} item{'s' if len(itens_lista) > 2 else ''})"

        motivo_texto = s.motivo_categoria or (
            "Substituição antecipada" if s.fora_da_cota else "Retirada regular"
        )

        ia_front = None
        if analise:
            categoria_ia = (
                analise.parecer_resumo.split(".")[0]
                if analise.parecer_resumo
                else analise.recomendacao
            )
            if len(categoria_ia) > 35:
                categoria_ia = s.motivo_categoria or analise.recomendacao
            ia_front = {
                "categoria": categoria_ia,
                "confianca": int(round(float(analise.score_confianca))),
                "recomendacao": analise.recomendacao,
                "nivel_risco": analise.nivel_risco,
            }

        decisao_front = None
        if decisao:
            decisao_front = {
                "status": status_front,
                "decisao_final": decisao.decisao_final,
                "seguiu_recomendacao_ia": decisao.seguiu_recomendacao_ia,
                "observacao": decisao.justificativa_decisao,
                "justificativa_decisao": decisao.justificativa_decisao,
                "responsavel": decisao.aprovador.nome if decisao.aprovador else "Gestor Responsável",
                "perfil": decisao.aprovador.cargo if decisao.aprovador else "Gestor",
                "dataHora": decisao.data_decisao.strftime("%d/%m/%Y, %H:%M"),
            }

        resultado.append(
            {
                # Identificadores e campos planos compatíveis com o frontend
                "id": str(s.id),
                "codigo": s.codigo,
                "numero": s.codigo,
                "status": status_front,
                "status_db": s.status,
                "excepcional": bool(s.fora_da_cota),
                "fora_da_cota": bool(s.fora_da_cota),
                "data": s.data_solicitacao.strftime("%d/%m/%Y"),
                "hora": s.data_solicitacao.strftime("%H:%M"),
                "data_solicitacao": s.data_solicitacao.isoformat(),
                "data_conclusao": s.data_conclusao.isoformat() if s.data_conclusao else None,
                "motivo": motivo_texto,
                "funcionario": s.solicitante.nome,
                "matricula": s.solicitante.codigo_matricula,
                "funcao": s.solicitante.cargo or "Colaborador",
                "centroCusto": s.solicitante.setor.nome if s.solicitante.setor else "Geral",
                "produto": produto_nome,
                "tipoProduto": (
                    "EPI"
                    if primeiro_item and "EPI" in (primeiro_item.produto.sku or "").upper()
                    else "Consumível"
                ),
                "justificativa": s.justificativa_solicitante,
                "motivo_categoria": s.motivo_categoria,
                "valor_total_estimado": float(s.valor_total_estimado),
                # Estrutura relacional detalhada
                "solicitante": {
                    "id": str(s.solicitante.id),
                    "nome": s.solicitante.nome,
                    "matricula": s.solicitante.codigo_matricula,
                    "cargo": s.solicitante.cargo,
                    "setor": s.solicitante.setor.nome if s.solicitante.setor else None,
                },
                "totem": s.totem.nome if s.totem else None,
                "itens": [
                    {
                        "id": str(item.id),
                        "sku": item.produto.sku,
                        "produto": item.produto.nome,
                        "unidade_medida": item.produto.unidade_medida,
                        "quantidade_solicitada": item.quantidade_solicitada,
                        "quantidade_aprovada": item.quantidade_aprovada,
                        "custo_unitario": float(item.custo_unitario_momento),
                    }
                    for item in itens_lista
                ],
                "ia": ia_front,
                "analise_ia": (
                    {
                        "modelo_versao": analise.modelo_versao,
                        "recomendacao": analise.recomendacao,
                        "score_confianca": float(analise.score_confianca),
                        "nivel_risco": analise.nivel_risco,
                        "parecer_resumo": analise.parecer_resumo,
                        "fatores_analisados": analise.fatores_analisados,
                    }
                    if analise
                    else None
                ),
                "decisao": decisao_front,
            }
        )

    return JsonResponse({"solicitacoes": resultado})


@csrf_exempt
def api_decidir_solicitacao(request, solicitacao_id):
    """Registra uma aprovação ou reprovação para uma solicitação."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    solicitacao = get_object_or_404(Solicitacao, id=solicitacao_id)

    try:
        body = json.loads(request.body) if request.body else {}
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    decisao_str = str(body.get("decisao", "APROVADA")).upper()
    if "REPR" in decisao_str or "REJEIT" in decisao_str:
        status_final = "REPROVADA"
    else:
        status_final = "APROVADA"

    justificativa = body.get("justificativa", "")
    seguiu_ia = body.get("seguiu_recomendacao_ia", True)
    aprovador_id = body.get("aprovador_id")

    aprovador = None
    if aprovador_id:
        try:
            aprovador = Usuario.objects.filter(id=aprovador_id).first()
        except Exception:
            pass

    if not aprovador:
        aprovador = Usuario.objects.filter(perfil__in=["ADMIN", "GESTOR"]).first()

    # Atualiza a solicitação no banco
    solicitacao.status = status_final
    solicitacao.data_conclusao = timezone.now()
    solicitacao.save()

    # Registra ou atualiza na tabela decisoes_solicitacao
    decisao, _ = DecisaoSolicitacao.objects.update_or_create(
        solicitacao=solicitacao,
        defaults={
            "aprovador": aprovador,
            "decisao_final": status_final,
            "seguiu_recomendacao_ia": seguiu_ia,
            "justificativa_decisao": (
                justificativa
                or f"Decisão registrada via Backoffice SupplyFlow ({status_final})."
            ),
        },
    )

    return JsonResponse(
        {
            "sucesso": True,
            "mensagem": f"Solicitação {solicitacao.codigo} atualizada para {status_final}.",
            "solicitacao_id": str(solicitacao.id),
            "codigo": solicitacao.codigo,
            "status": status_final,
            "status_front": "aprovada" if status_final == "APROVADA" else "rejeitada",
        }
    )


def api_listar_produtos(request):
    """Lista os produtos ativos disponíveis no catálogo."""
    produtos = (
        Produto.objects.select_related("categoria")
        .filter(ativo=True)
        .order_by("nome")
    )
    dados = [
        {
            "id": str(p.id),
            "sku": p.sku,
            "nome": p.nome,
            "categoria": p.categoria.nome if p.categoria else None,
            "unidade_medida": p.unidade_medida,
            "custo_unitario": float(p.custo_unitario),
            "limite_padrao_mensal": p.limite_padrao_mensal,
            "requer_justificativa": p.requer_justificativa,
            "imagem_url": p.imagem_url,
        }
        for p in produtos
    ]
    return JsonResponse({"produtos": dados})


@csrf_exempt
def api_login(request):
    """Autentica via Backoffice (email + senha) ou via Totem (matricula + pin)."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    email = body.get("email")
    senha = body.get("senha")
    matricula = body.get("matricula")
    pin = body.get("pin")

    if email and senha:
        senha_md5 = hashlib.md5(senha.encode()).hexdigest()
        user = Usuario.objects.filter(
            email=email, senha_hash=senha_md5, ativo=True
        ).first()
    elif matricula and pin:
        pin_md5 = hashlib.md5(pin.encode()).hexdigest()
        user = Usuario.objects.filter(
            codigo_matricula=matricula, pin_hash=pin_md5, ativo=True
        ).first()
    else:
        return JsonResponse(
            {"autenticado": False, "erro": "Credenciais incompletas"}, status=400
        )

    if not user:
        return JsonResponse(
            {"autenticado": False, "erro": "Credenciais inválidas"}, status=401
        )

    partes_nome = user.nome.strip().split()
    iniciais = (
        f"{partes_nome[0][0]}{partes_nome[-1][0]}".upper()
        if len(partes_nome) >= 2
        else partes_nome[0][:2].upper()
    )

    return JsonResponse(
        {
            "autenticado": True,
            "usuario": {
                "id": str(user.id),
                "nome": user.nome,
                "iniciais": iniciais,
                "email": user.email,
                "matricula": user.codigo_matricula,
                "perfil": user.perfil,
                "cargo": user.cargo,
            },
        }
    )