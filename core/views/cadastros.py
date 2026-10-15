"""APIs de cadastro: funcionários, produtos e setores."""
import hashlib
import json
import uuid
from decimal import Decimal
from django.db.models import Avg, F, Sum, Count, Q
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from ..models import (
    Solicitacao,
    SolicitacaoItem,
    Produto,
    CategoriaProduto,
    Usuario,
    Setor,
    Totem,
    EstoqueTotem,
    DecisaoSolicitacao,
    AnaliseIA,
    AvaliacaoModeloIA,
)


from .util import fmt, gerar_iniciais, mapear_status_front


# ============================================================================
# GESTÃO DE FUNCIONÁRIOS / USUÁRIOS
# ============================================================================
def api_listar_funcionarios(request):
    """Lista todos os funcionários cadastrados com paginação ou filtros."""
    setor_filtro = request.GET.get("setor")
    termo = request.GET.get("q", "").strip()

    qs = Usuario.objects.select_related("setor").all().order_by("nome")
    if setor_filtro:
        qs = qs.filter(setor_id=setor_filtro)
    if termo:
        qs = qs.filter(Q(nome__icontains=termo) | Q(codigo_matricula__icontains=termo) | Q(email__icontains=termo))

    resultado = [
        {
            "id": str(u.id),
            "matricula": u.codigo_matricula,
            "nome": u.nome,
            "iniciais": gerar_iniciais(u.nome),
            "email": u.email or "—",
            "cargo": u.cargo or "Colaborador",
            "perfil": u.perfil,
            "setor_id": str(u.setor.id) if u.setor else None,
            "setor_nome": u.setor.nome if u.setor else "Sem setor",
            "centro_custo": u.setor.centro_custo if u.setor else "—",
            "ativo": u.ativo,
            "created_at": fmt(u.created_at, "%d/%m/%Y") if u.created_at else "—",
        }
        for u in qs
    ]
    return JsonResponse({"funcionarios": resultado})


@csrf_exempt
def api_salvar_funcionario(request):
    """Cadastra ou atualiza um funcionário."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    func_id = dados.get("id")
    nome = dados.get("nome", "").strip()
    matricula = dados.get("matricula", "").strip().upper()
    email = dados.get("email", "").strip() or None
    cargo = dados.get("cargo", "").strip()
    perfil = dados.get("perfil", "COLABORADOR").strip().upper()
    setor_id = dados.get("setor_id")
    pin = dados.get("pin", "").strip()

    if not nome or not matricula:
        return JsonResponse({"sucesso": False, "erro": "Nome e Matrícula são obrigatórios."}, status=400)

    setor = Setor.objects.filter(id=setor_id).first() if setor_id else None

    if func_id:
        func = get_object_or_404(Usuario, id=func_id)
        func.nome = nome
        func.codigo_matricula = matricula
        func.email = email
        func.cargo = cargo
        func.perfil = perfil
        func.setor = setor
        if pin:
            func.pin_hash = hashlib.md5(pin.encode()).hexdigest()
        func.save()
        msg = "Funcionário atualizado com sucesso."
    else:
        if Usuario.objects.filter(codigo_matricula=matricula).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe colaborador com esta matrícula."}, status=400)

        pin_default = pin or "1234"
        func = Usuario.objects.create(
            nome=nome,
            codigo_matricula=matricula,
            email=email,
            cargo=cargo,
            perfil=perfil,
            setor=setor,
            pin_hash=hashlib.md5(pin_default.encode()).hexdigest(),
            ativo=True,
        )
        msg = "Funcionário cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(func.id)})


@csrf_exempt
def api_toggle_funcionario(request, funcionario_id):
    """Ativa ou inativa um funcionário."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    func = get_object_or_404(Usuario, id=funcionario_id)
    func.ativo = not func.ativo
    func.save()
    status_txt = "ativado" if func.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": func.ativo, "mensagem": f"Colaborador {status_txt}."})


# ============================================================================
# GESTÃO DE PRODUTOS / CATÁLOGO
# ============================================================================
def api_listar_produtos(request):
    """Lista os produtos do catálogo (ativos e inativos se solicitado)."""
    todos = request.GET.get("todos", "false").lower() == "true"
    qs = Produto.objects.select_related("categoria").all().order_by("nome")
    if not todos:
        qs = qs.filter(ativo=True)

    dados = [
        {
            "id": str(p.id),
            "sku": p.sku,
            "nome": p.nome,
            "descricao": p.descricao or "",
            "categoria_id": str(p.categoria.id) if p.categoria else None,
            "categoria": p.categoria.nome if p.categoria else "Sem categoria",
            "tipo": "EPI" if p.categoria and "EPI" in p.categoria.nome.upper() else "Consumível",
            "unidade_medida": p.unidade_medida,
            "custo_unitario": float(p.custo_unitario),
            "limite_padrao_mensal": p.limite_padrao_mensal or 0,
            "requer_justificativa": p.requer_justificativa,
            "imagem_url": p.imagem_url or "",
            "ativo": p.ativo,
        }
        for p in qs
    ]
    categorias = [
        {"id": str(c.id), "nome": c.nome}
        for c in CategoriaProduto.objects.all().order_by("nome")
    ]
    return JsonResponse({"produtos": dados, "categorias": categorias})


@csrf_exempt
def api_salvar_produto(request):
    """Cadastra ou edita um produto."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    prod_id = dados.get("id")
    sku = dados.get("sku", "").strip().upper()
    nome = dados.get("nome", "").strip()
    descricao = dados.get("descricao", "").strip()
    categoria_id = dados.get("categoria_id")
    unidade = dados.get("unidade_medida", "UN").strip().upper()
    custo = Decimal(str(dados.get("custo_unitario") or "0.00"))
    limite = int(dados.get("limite_padrao_mensal") or 1)
    requer_just = bool(dados.get("requer_justificativa", False))
    imagem = dados.get("imagem_url", "").strip()

    if not sku or not nome:
        return JsonResponse({"sucesso": False, "erro": "SKU e Nome são obrigatórios."}, status=400)

    categoria = CategoriaProduto.objects.filter(id=categoria_id).first() if categoria_id else None

    if prod_id:
        prod = get_object_or_404(Produto, id=prod_id)
        prod.sku = sku
        prod.nome = nome
        prod.descricao = descricao
        prod.categoria = categoria
        prod.unidade_medida = unidade
        prod.custo_unitario = custo
        prod.limite_padrao_mensal = limite
        prod.requer_justificativa = requer_just
        if imagem:
            prod.imagem_url = imagem
        prod.save()
        msg = "Produto atualizado com sucesso."
    else:
        if Produto.objects.filter(sku=sku).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe produto com este SKU."}, status=400)
        prod = Produto.objects.create(
            sku=sku,
            nome=nome,
            descricao=descricao,
            categoria=categoria,
            unidade_medida=unidade,
            custo_unitario=custo,
            limite_padrao_mensal=limite,
            requer_justificativa=requer_just,
            imagem_url=imagem or "/static/img/produtos/generico.jpg",
            ativo=True,
        )
        msg = "Produto cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(prod.id)})


@csrf_exempt
def api_toggle_produto(request, produto_id):
    """Ativa ou inativa um produto."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    prod = get_object_or_404(Produto, id=produto_id)
    prod.ativo = not prod.ativo
    prod.save()
    status_txt = "ativado" if prod.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": prod.ativo, "mensagem": f"Produto {status_txt}."})


# ============================================================================
# GESTÃO DE SETORES E CENTROS DE CUSTO
# ============================================================================
def api_listar_setores(request):
    """Lista todos os setores e centros de custo cadastrados."""
    setores = Setor.objects.annotate(total_funcionarios=Count("usuario")).order_by("nome")
    resultado = [
        {
            "id": str(s.id),
            "nome": s.nome,
            "centro_custo": s.centro_custo or "—",
            "ativo": s.ativo,
            "total_funcionarios": s.total_funcionarios,
        }
        for s in setores
    ]
    return JsonResponse({"setores": resultado})


@csrf_exempt
def api_salvar_setor(request):
    """Cria ou edita um setor."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    try:
        dados = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"erro": "JSON inválido"}, status=400)

    setor_id = dados.get("id")
    nome = dados.get("nome", "").strip()
    cc = dados.get("centro_custo", "").strip()

    if not nome:
        return JsonResponse({"sucesso": False, "erro": "Nome do setor é obrigatório."}, status=400)

    if setor_id:
        setor = get_object_or_404(Setor, id=setor_id)
        setor.nome = nome
        setor.centro_custo = cc
        setor.save()
        msg = "Setor atualizado com sucesso."
    else:
        if Setor.objects.filter(nome__iexact=nome).exists():
            return JsonResponse({"sucesso": False, "erro": "Já existe um setor com este nome."}, status=400)
        setor = Setor.objects.create(nome=nome, centro_custo=cc, ativo=True)
        msg = "Setor cadastrado com sucesso."

    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(setor.id)})


@csrf_exempt
def api_toggle_setor(request, setor_id):
    """Ativa ou inativa um setor."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    setor = get_object_or_404(Setor, id=setor_id)
    setor.ativo = not setor.ativo
    setor.save()
    status_txt = "ativado" if setor.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": setor.ativo, "mensagem": f"Setor {status_txt}."})
