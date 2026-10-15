"""APIs de cadastro: funcionários, produtos e setores."""
import hashlib
import json
import uuid
from decimal import Decimal
from django.db.models import Avg, F, Sum, Count, Q
from django.http import JsonResponse
from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST
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


import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from ..auditoria import registrar
from ..contas import enviar_link_de_senha, garantir_conta
from ..permissoes import PERFIS, PERFIS_BACKOFFICE, api_backoffice
from ..seguranca import definir_pin, validar_novo_pin
from .util import EntradaInvalida, erro, fmt, gerar_iniciais, ler_json, mapear_status_front, texto


# ============================================================================
# GESTÃO DE FUNCIONÁRIOS / USUÁRIOS
# ============================================================================
@require_GET
@api_backoffice("pessoas")
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


@require_POST
@api_backoffice("pessoas")
def api_salvar_funcionario(request):
    """Cadastra ou atualiza um funcionário (RF-01) e, se o perfil for administrativo,
    a conta de acesso ao backoffice (RF-08, RF-09)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json

    try:
        nome = texto(dados.get("nome"), "Nome", obrigatorio=True, maximo=150)
        matricula = texto(dados.get("matricula"), "Matrícula", obrigatorio=True, maximo=30).upper()
        email = texto(dados.get("email"), "E-mail", maximo=150).lower() or None
        cargo = texto(dados.get("cargo"), "Cargo", maximo=100)
        perfil = texto(dados.get("perfil"), "Perfil").upper() or "COLABORADOR"
        pin = texto(dados.get("pin"), "PIN")
    except EntradaInvalida as e:
        return erro(str(e))

    if not re.fullmatch(r"[A-Z0-9-]+", matricula):
        return erro("Matrícula: use apenas letras, números e hífen.")
    if perfil not in PERFIS:
        return erro("Perfil de acesso inválido.")
    if email:
        try:
            validate_email(email)
        except ValidationError:
            return erro("E-mail inválido.")
    if perfil in PERFIS_BACKOFFICE and not email:
        return erro("Perfis com acesso ao backoffice precisam de e-mail (para receber o link de senha).")
    if pin:
        problema = validar_novo_pin(pin)
        if problema:
            return erro(problema)

    setor_id = dados.get("setor_id")
    setor = Setor.objects.filter(id=setor_id).first() if setor_id else None

    func_id = dados.get("id")
    if func_id:
        func = Usuario.objects.filter(id=func_id).first()
        if func is None:
            return erro("Funcionário não encontrado.", status=404)
    else:
        func = Usuario(ativo=True)
        if not pin:
            return erro("Defina um PIN de 4 a 6 números para o colaborador usar no totem.")

    if Usuario.objects.filter(codigo_matricula=matricula).exclude(pk=func.pk).exists():
        return erro("Já existe colaborador com esta matrícula.")
    if email and Usuario.objects.filter(email__iexact=email).exclude(pk=func.pk).exists():
        return erro("Já existe colaborador com este e-mail.")
    if func.pk == request.usuario.pk and perfil != "ADMIN":
        return erro("Você não pode remover o seu próprio perfil de Administrador.")

    perfil_anterior = func.perfil if func.pk else None
    tinha_acesso = bool(func.pk and func.conta_id and func.conta.has_usable_password())
    func.nome = nome
    func.codigo_matricula = matricula
    func.email = email
    func.cargo = cargo
    func.perfil = perfil
    func.setor = setor
    if pin:
        definir_pin(func, pin)
    func.save()

    conta = garantir_conta(func)
    convite_enviado = False
    if conta is not None and not tinha_acesso and not conta.has_usable_password():
        convite_enviado = enviar_link_de_senha(request, func)

    registrar(
        request,
        "FUNCIONARIO_ATUALIZADO" if func_id else "FUNCIONARIO_CADASTRADO",
        func,
        f"{'Atualizou' if func_id else 'Cadastrou'} {func.nome} ({func.codigo_matricula})",
        perfil=perfil,
        perfil_anterior=perfil_anterior,
        pin_alterado=bool(pin),
        convite_enviado=convite_enviado,
    )

    msg = "Funcionário atualizado com sucesso." if func_id else "Funcionário cadastrado com sucesso."
    if convite_enviado:
        msg += f" Enviamos para {email} o link para criar a senha de acesso."
    return JsonResponse({"sucesso": True, "mensagem": msg, "id": str(func.id), "convite_enviado": convite_enviado})


@require_POST
@api_backoffice("pessoas")
def api_toggle_funcionario(request, funcionario_id):
    """Ativa ou inativa um funcionário (e a conta de acesso dele, se houver)."""
    func = Usuario.objects.filter(id=funcionario_id).first()
    if func is None:
        return erro("Funcionário não encontrado.", status=404)
    if func.pk == request.usuario.pk:
        return erro("Você não pode inativar o seu próprio usuário.")
    func.ativo = not func.ativo
    func.save(update_fields=["ativo", "updated_at"])
    garantir_conta(func)
    status_txt = "ativado" if func.ativo else "inativado"
    registrar(request, "FUNCIONARIO_ATIVADO" if func.ativo else "FUNCIONARIO_INATIVADO", func,
              f"{func.nome} {status_txt}")
    return JsonResponse({"sucesso": True, "ativo": func.ativo, "mensagem": f"Colaborador {status_txt}."})


@require_POST
@api_backoffice("pessoas")
def api_enviar_link_senha(request, funcionario_id):
    """Reenvia o link para o usuário criar/redefinir a própria senha (o ADMIN não vê senhas)."""
    func = Usuario.objects.filter(id=funcionario_id, ativo=True).first()
    if func is None or func.perfil not in PERFIS_BACKOFFICE or not func.email:
        return erro("Este colaborador não tem acesso ao backoffice ou está sem e-mail.")
    garantir_conta(func)
    if not enviar_link_de_senha(request, func):
        return erro("Não foi possível enviar o e-mail. Verifique o cadastro.")
    registrar(request, "LINK_SENHA_ENVIADO", func, f"Link de senha enviado para {func.email}")
    return JsonResponse({"sucesso": True, "mensagem": f"Link enviado para {func.email}."})


# ============================================================================
# GESTÃO DE PRODUTOS / CATÁLOGO
# ============================================================================
@require_GET
@api_backoffice("ver")
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


@require_POST
@api_backoffice("produtos")
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


@require_POST
@api_backoffice("produtos")
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
@require_GET
@api_backoffice("ver")
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


@require_POST
@api_backoffice("pessoas")
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


@require_POST
@api_backoffice("pessoas")
def api_toggle_setor(request, setor_id):
    """Ativa ou inativa um setor."""
    if request.method != "POST":
        return JsonResponse({"erro": "Método não permitido"}, status=405)

    setor = get_object_or_404(Setor, id=setor_id)
    setor.ativo = not setor.ativo
    setor.save()
    status_txt = "ativado" if setor.ativo else "inativado"
    return JsonResponse({"sucesso": True, "ativo": setor.ativo, "mensagem": f"Setor {status_txt}."})
