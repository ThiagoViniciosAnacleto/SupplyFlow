"""APIs de cadastro: funcionários, produtos, setores, fornecedores, políticas e cargos."""
import re
from datetime import datetime

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Count, Q
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from ..auditoria import ip_da_requisicao, registrar
from ..contas import enviar_link_de_senha, garantir_conta
from ..models import (
    CategoriaProduto,
    EstoqueTotem,
    Fornecedor,
    Produto,
    RegraFornecimento,
    RegistroAuditoria,
    Setor,
    Totem,
    Usuario,
)
from ..permissoes import PERFIS, PERFIS_BACKOFFICE, api_backoffice
from ..seguranca import definir_pin, validar_novo_pin
from ..servicos.elegibilidade import PREFIXO_FUNCIONARIO
from .util import EntradaInvalida, decimal, erro, fmt, gerar_iniciais, inteiro, ler_json, texto


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
# PRODUTOS (RF-06, RF-07, RF-13, RF-36)
# ============================================================================
def _produto_json(p):
    return {
        "id": str(p.id),
        "sku": p.sku,
        "nome": p.nome,
        "descricao": p.descricao or "",
        "categoria_id": str(p.categoria_id) if p.categoria_id else None,
        "categoria": p.categoria.nome if p.categoria else "Sem categoria",
        "tipo": "EPI" if p.eh_epi else "Consumível",
        "unidade_medida": p.unidade_medida,
        "custo_unitario": float(p.custo_unitario),
        "limite_padrao_mensal": p.limite_padrao_mensal,
        "periodicidade_dias": p.periodicidade_dias,
        "requer_justificativa": p.requer_justificativa,
        "ca": p.ca or "",
        "validade_ca": p.validade_ca.isoformat() if p.validade_ca else "",
        "tamanho": p.tamanho or "",
        "fornecedor_id": str(p.fornecedor_id) if p.fornecedor_id else None,
        "fornecedor": str(p.fornecedor) if p.fornecedor else None,
        "imagem_url": p.imagem_url or "",
        "ativo": p.ativo,
    }


@require_GET
@api_backoffice("ver")
def api_listar_produtos(request):
    todos = request.GET.get("todos", "false").lower() == "true"
    qs = Produto.objects.select_related("categoria", "fornecedor").order_by("nome")
    if not todos:
        qs = qs.filter(ativo=True)
    return JsonResponse({
        "produtos": [_produto_json(p) for p in qs],
        "categorias": [{"id": str(c.id), "nome": c.nome} for c in CategoriaProduto.objects.order_by("nome")],
        "fornecedores": [{"id": str(f.id), "nome": str(f)} for f in Fornecedor.objects.filter(ativo=True)],
    })


def _data_opcional(valor, campo):
    valor = (valor or "").strip()
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y-%m-%d").date()
    except ValueError:
        raise EntradaInvalida(f"{campo}: use o formato AAAA-MM-DD.")


@require_POST
@api_backoffice("produtos")
def api_salvar_produto(request):
    """Cadastra ou edita um produto, com os dados específicos de EPI (CA, validade, tamanho, periodicidade)
    e garante vínculo inicial de estoque nos totens (RF-36)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        sku = texto(dados.get("sku"), "SKU", obrigatorio=True, maximo=50).upper()
        nome = texto(dados.get("nome"), "Nome", obrigatorio=True, maximo=150)
        descricao = texto(dados.get("descricao"), "Descrição", maximo=2000)
        unidade = (texto(dados.get("unidade_medida"), "Unidade", maximo=20) or "UN").upper()
        custo = decimal(dados.get("custo_unitario"), "Custo unitário", minimo=0, padrao="0")
        limite = inteiro(dados.get("limite_padrao_mensal"), "Limite mensal", minimo=0, maximo=10000) \
            if dados.get("limite_padrao_mensal") not in (None, "") else None
        periodicidade = inteiro(dados.get("periodicidade_dias"), "Periodicidade", minimo=1, maximo=3650) \
            if dados.get("periodicidade_dias") not in (None, "") else None
        ca = texto(dados.get("ca"), "CA", maximo=30) or None
        validade_ca = _data_opcional(dados.get("validade_ca"), "Validade do CA")
        tamanho = texto(dados.get("tamanho"), "Tamanho", maximo=30) or None
        imagem = texto(dados.get("imagem_url"), "Imagem", maximo=500)
    except EntradaInvalida as e:
        return erro(str(e))

    categoria = CategoriaProduto.objects.filter(id=dados.get("categoria_id")).first() if dados.get("categoria_id") else None
    fornecedor = Fornecedor.objects.filter(id=dados.get("fornecedor_id")).first() if dados.get("fornecedor_id") else None
    if categoria and "EPI" in categoria.nome.upper() and not ca:
        return erro("EPI precisa do número do Certificado de Aprovação (CA).")

    prod_id = dados.get("id")
    prod = Produto.objects.filter(id=prod_id).first() if prod_id else Produto(ativo=True)
    if prod_id and prod is None:
        return erro("Produto não encontrado.", status=404)
    if Produto.objects.filter(sku=sku).exclude(pk=prod.pk).exists():
        return erro("Já existe produto com este SKU.")

    prod.sku, prod.nome, prod.descricao, prod.categoria = sku, nome, descricao, categoria
    prod.unidade_medida, prod.custo_unitario = unidade, custo
    prod.limite_padrao_mensal, prod.periodicidade_dias = limite, periodicidade
    prod.requer_justificativa = bool(dados.get("requer_justificativa"))
    prod.ca, prod.validade_ca, prod.tamanho, prod.fornecedor = ca, validade_ca, tamanho, fornecedor
    if imagem:
        prod.imagem_url = imagem
    prod.save()

    # RF-36: garante que o produto possua registro de estoque em todos os totens cadastrados
    for totem in Totem.objects.all():
        EstoqueTotem.objects.get_or_create(
            totem=totem,
            produto=prod,
            defaults={"quantidade_disponivel": 0, "quantidade_minima": 5},
        )

    registrar(request, "PRODUTO_ATUALIZADO" if prod_id else "PRODUTO_CADASTRADO", prod, f"{prod.sku} — {prod.nome}")
    return JsonResponse({"sucesso": True, "mensagem": "Produto salvo com sucesso.", "id": str(prod.id)})


@require_POST
@api_backoffice("produtos")
def api_toggle_produto(request, produto_id):
    prod = Produto.objects.filter(id=produto_id).first()
    if prod is None:
        return erro("Produto não encontrado.", status=404)
    prod.ativo = not prod.ativo
    prod.save(update_fields=["ativo", "updated_at"])
    registrar(request, "PRODUTO_ATIVADO" if prod.ativo else "PRODUTO_INATIVADO", prod, prod.nome)
    return JsonResponse({"sucesso": True, "ativo": prod.ativo,
                         "mensagem": f"Produto {'ativado' if prod.ativo else 'inativado'}."})


# ============================================================================
# SETORES E CENTROS DE CUSTO (RF-02)
# ============================================================================
@require_GET
@api_backoffice("ver")
def api_listar_setores(request):
    setores = Setor.objects.annotate(total_funcionarios=Count("usuario", filter=Q(usuario__ativo=True))).order_by("nome")
    return JsonResponse({"setores": [
        {"id": str(s.id), "nome": s.nome, "centro_custo": s.centro_custo or "—", "ativo": s.ativo,
        "total_funcionarios": s.total_funcionarios}
        for s in setores
    ]})


@require_POST
@api_backoffice("pessoas")
def api_salvar_setor(request):
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        nome = texto(dados.get("nome"), "Nome do setor", obrigatorio=True, maximo=100)
        cc = texto(dados.get("centro_custo"), "Centro de custo", maximo=50)
    except EntradaInvalida as e:
        return erro(str(e))
    setor_id = dados.get("id")
    setor = Setor.objects.filter(id=setor_id).first() if setor_id else Setor(ativo=True)
    if setor_id and setor is None:
        return erro("Setor não encontrado.", status=404)
    if Setor.objects.filter(nome__iexact=nome).exclude(pk=setor.pk).exists():
        return erro("Já existe um setor com este nome.")
    setor.nome, setor.centro_custo = nome, cc
    setor.save()
    registrar(request, "SETOR_ATUALIZADO" if setor_id else "SETOR_CADASTRADO", setor, f"{nome} ({cc or 'sem CC'})")
    return JsonResponse({"sucesso": True, "mensagem": "Setor salvo com sucesso.", "id": str(setor.id)})


@require_POST
@api_backoffice("pessoas")
def api_toggle_setor(request, setor_id):
    setor = Setor.objects.filter(id=setor_id).first()
    if setor is None:
        return erro("Setor não encontrado.", status=404)
    setor.ativo = not setor.ativo
    setor.save(update_fields=["ativo"])
    registrar(request, "SETOR_ATIVADO" if setor.ativo else "SETOR_INATIVADO", setor, setor.nome)
    return JsonResponse({"sucesso": True, "ativo": setor.ativo,
                         "mensagem": f"Setor {'ativado' if setor.ativo else 'inativado'}."})


# ============================================================================
# FORNECEDORES (RF-05)
# ============================================================================
def _cnpj_valido(cnpj):
    numeros = re.sub(r"\D", "", cnpj or "")
    if len(numeros) != 14 or numeros == numeros[0] * 14:
        return None

    def digito(base):
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-len(base):]
        resto = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return "0" if resto < 2 else str(11 - resto)

    if digito(numeros[:12]) != numeros[12] or digito(numeros[:13]) != numeros[13]:
        return None
    return f"{numeros[:2]}.{numeros[2:5]}.{numeros[5:8]}/{numeros[8:12]}-{numeros[12:]}"


@require_GET
@api_backoffice("ver")
def api_listar_fornecedores(request):
    return JsonResponse({"fornecedores": [
        {"id": str(f.id), "razao_social": f.razao_social, "nome_fantasia": f.nome_fantasia, "cnpj": f.cnpj,
         "email": f.email, "telefone": f.telefone, "contato": f.contato, "ativo": f.ativo,
         "produtos": f.produto_set.count()}
        for f in Fornecedor.objects.order_by("razao_social")
    ]})


@require_POST
@api_backoffice("produtos")
def api_salvar_fornecedor(request):
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        razao = texto(dados.get("razao_social"), "Razão social", obrigatorio=True, maximo=150)
        fantasia = texto(dados.get("nome_fantasia"), "Nome fantasia", maximo=150)
        email = texto(dados.get("email"), "E-mail", maximo=150).lower()
        telefone = texto(dados.get("telefone"), "Telefone", maximo=30)
        contato = texto(dados.get("contato"), "Contato", maximo=100)
    except EntradaInvalida as e:
        return erro(str(e))
    cnpj = _cnpj_valido(dados.get("cnpj"))
    if not cnpj:
        return erro("CNPJ inválido.")
    if email:
        try:
            validate_email(email)
        except ValidationError:
            return erro("E-mail inválido.")
    forn_id = dados.get("id")
    forn = Fornecedor.objects.filter(id=forn_id).first() if forn_id else Fornecedor(ativo=True)
    if forn_id and forn is None:
        return erro("Fornecedor não encontrado.", status=404)
    if Fornecedor.objects.filter(cnpj=cnpj).exclude(pk=forn.pk).exists():
        return erro("Já existe fornecedor com este CNPJ.")
    forn.razao_social, forn.nome_fantasia, forn.cnpj = razao, fantasia, cnpj
    forn.email, forn.telefone, forn.contato = email, telefone, contato
    forn.save()
    registrar(request, "FORNECEDOR_ATUALIZADO" if forn_id else "FORNECEDOR_CADASTRADO", forn, f"{razao} ({cnpj})")
    return JsonResponse({"sucesso": True, "mensagem": "Fornecedor salvo com sucesso.", "id": str(forn.id)})


@require_POST
@api_backoffice("produtos")
def api_toggle_fornecedor(request, fornecedor_id):
    forn = Fornecedor.objects.filter(id=fornecedor_id).first()
    if forn is None:
        return erro("Fornecedor não encontrado.", status=404)
    forn.ativo = not forn.ativo
    forn.save(update_fields=["ativo"])
    registrar(request, "FORNECEDOR_ATIVADO" if forn.ativo else "FORNECEDOR_INATIVADO", forn, forn.razao_social)
    return JsonResponse({"sucesso": True, "ativo": forn.ativo})


# ============================================================================
# POLÍTICAS DE FORNECIMENTO (RF-12, RF-13, RF-14)
# ============================================================================
def _regra_json(r, mapa_funcionarios=None):
    cargo_raw = (r.cargo or "").strip()
    eh_funcionario = cargo_raw.upper().startswith(PREFIXO_FUNCIONARIO)
    funcionario_id = None
    funcionario_nome = None
    cargo_exibicao = cargo_raw or None

    if eh_funcionario:
        matricula = cargo_raw[len(PREFIXO_FUNCIONARIO):].strip().upper()
        cargo_exibicao = None
        func = (
            mapa_funcionarios.get(matricula)
            if mapa_funcionarios is not None
            else Usuario.objects.filter(codigo_matricula__iexact=matricula).first()
        )
        if func:
            funcionario_id = str(func.id)
            funcionario_nome = f"{func.nome} ({func.codigo_matricula})"
        else:
            funcionario_nome = f"Matrícula {matricula}"

    return {
        "id": str(r.id),
        "produto_id": str(r.produto_id),
        "produto": r.produto.nome,
        "tipo": "EPI" if r.produto.eh_epi else "Consumível",
        "setor_id": str(r.setor_id) if r.setor_id else None,
        "setor": r.setor.nome if r.setor else None,
        "cargo": cargo_exibicao,
        "funcionario_id": funcionario_id,
        "funcionario": funcionario_nome,
        "limite_mensal": r.limite_mensal,
        "periodicidade_dias": r.periodicidade_dias,
        "padrao_limite": r.produto.limite_padrao_mensal,
        "padrao_periodicidade": r.produto.periodicidade_dias,
        "ativo": r.ativo,
    }


@require_GET
@api_backoffice("ver")
def api_listar_regras(request):
    regras = RegraFornecimento.objects.select_related("produto__categoria", "setor").order_by("produto__nome", "cargo")
    funcionarios_ativos = list(Usuario.objects.filter(ativo=True).order_by("nome"))
    mapa_func = {u.codigo_matricula.upper(): u for u in funcionarios_ativos}
    return JsonResponse({
        "regras": [_regra_json(r, mapa_func) for r in regras],
        "produtos": [{"id": str(p.id), "nome": p.nome} for p in Produto.objects.filter(ativo=True).order_by("nome")],
        "setores": [
            {"id": str(s.id), "nome": f"{s.nome} ({s.centro_custo})" if s.centro_custo else s.nome}
            for s in Setor.objects.filter(ativo=True).order_by("nome")
        ],
        "cargos": sorted(_catalogo_cargos().values()),
        "funcionarios": [
            {"id": str(u.id), "matricula": u.codigo_matricula, "nome": f"{u.nome} ({u.codigo_matricula})"}
            for u in funcionarios_ativos
        ],
    })


@require_POST
@api_backoffice("produtos")
def api_salvar_regra(request):
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    produto = Produto.objects.filter(id=dados.get("produto_id")).first() if dados.get("produto_id") else None
    if produto is None:
        return erro("Escolha o produto.")
    setor = Setor.objects.filter(id=dados.get("setor_id")).first() if dados.get("setor_id") else None
    funcionario = Usuario.objects.filter(id=dados.get("funcionario_id")).first() if dados.get("funcionario_id") else None
    try:
        cargo = texto(dados.get("cargo"), "Cargo", maximo=100)
        limite = inteiro(dados.get("limite_mensal"), "Limite mensal", minimo=0, maximo=10000) \
            if dados.get("limite_mensal") not in (None, "") else None
        periodicidade = inteiro(dados.get("periodicidade_dias"), "Periodicidade", minimo=1, maximo=3650) \
            if dados.get("periodicidade_dias") not in (None, "") else None
    except EntradaInvalida as e:
        return erro(str(e))

    if funcionario is not None:
        cargo = f"{PREFIXO_FUNCIONARIO}{funcionario.codigo_matricula}"

    if not setor and not cargo:
        return erro("Defina o escopo: um setor, um cargo/função ou um funcionário.")
    if limite is None and periodicidade is None:
        return erro("Informe o limite mensal, a periodicidade ou ambos.")

    regra_id = dados.get("id")
    regra = RegraFornecimento.objects.filter(id=regra_id).first() if regra_id else RegraFornecimento(ativo=True)
    if regra_id and regra is None:
        return erro("Regra não encontrada.", status=404)
    duplicada = RegraFornecimento.objects.filter(produto=produto, setor=setor, cargo__iexact=cargo, ativo=True) \
        .exclude(pk=regra.pk).exists()
    if duplicada:
        return erro("Já existe uma regra ativa para este produto com o mesmo escopo.")
    regra.produto, regra.setor, regra.cargo = produto, setor, cargo
    regra.limite_mensal, regra.periodicidade_dias = limite, periodicidade
    regra.save()
    registrar(request, "REGRA_ATUALIZADA" if regra_id else "REGRA_CADASTRADA", regra, str(regra),
              limite_mensal=limite, periodicidade_dias=periodicidade)
    return JsonResponse({"sucesso": True, "mensagem": "Política salva.", "id": str(regra.id)})


@require_POST
@api_backoffice("produtos")
def api_toggle_regra(request, regra_id):
    regra = RegraFornecimento.objects.filter(id=regra_id).first()
    if regra is None:
        return erro("Regra não encontrada.", status=404)
    regra.ativo = not regra.ativo
    regra.save(update_fields=["ativo"])
    registrar(request, "REGRA_ATIVADA" if regra.ativo else "REGRA_INATIVADA", regra, str(regra))
    return JsonResponse({"sucesso": True, "ativo": regra.ativo})


# ============================================================================
# CARGOS E FUNÇÕES (RF-03, RF-04)
# ============================================================================
def _catalogo_cargos():
    """Devolve um dicionário {chave_lower: nome_exibicao} combinando o catálogo de
    cargos gerenciados, os cargos atribuídos a funcionários e as políticas de fornecimento."""
    catalogo = {}

    for evento in RegistroAuditoria.objects.filter(entidade="Cargo").order_by("data", "id"):
        detalhes = evento.detalhes if isinstance(evento.detalhes, dict) else {}
        nome = (detalhes.get("cargo") or "").strip()
        anterior = (detalhes.get("cargo_anterior") or "").strip()
        if evento.acao in ("CARGO_CADASTRADO", "CARGO_ATUALIZADO") and nome:
            if anterior and anterior.lower() in catalogo:
                catalogo.pop(anterior.lower(), None)
            catalogo[nome.lower()] = nome
        elif evento.acao == "CARGO_EXCLUIDO" and nome:
            catalogo.pop(nome.lower(), None)

    for cargo_func in Usuario.objects.filter(ativo=True).exclude(cargo__isnull=True).exclude(cargo="") \
            .values_list("cargo", flat=True):
        limpo = cargo_func.strip()
        if limpo:
            catalogo.setdefault(limpo.lower(), limpo)

    for cargo_regra in RegraFornecimento.objects.filter(ativo=True).exclude(cargo="") \
            .values_list("cargo", flat=True):
        limpo = cargo_regra.strip()
        if limpo and not limpo.upper().startswith(PREFIXO_FUNCIONARIO):
            catalogo.setdefault(limpo.lower(), limpo)

    return catalogo


def _registrar_evento_cargo(request, acao, descricao, **detalhes):
    usuario = getattr(request, "usuario", None)
    RegistroAuditoria.objects.create(
        usuario=usuario,
        usuario_nome=usuario.nome if usuario else "",
        acao=acao,
        entidade="Cargo",
        entidade_id=(detalhes.get("cargo") or "")[:64],
        descricao=descricao[:255],
        detalhes=detalhes,
        ip=ip_da_requisicao(request) if request is not None else None,
    )


@require_GET
@api_backoffice("ver")
def api_listar_cargos(request):
    """Lista todos os cargos/funções da organização, quantos funcionários ativos têm
    e quais EPIs/consumíveis as políticas vinculam a cada um (RF-03, RF-04)."""
    catalogo = _catalogo_cargos()
    contagem = {
        chave: {"cargo": nome, "total": 0, "setores": set()}
        for chave, nome in catalogo.items()
    }

    for cargo, setor in Usuario.objects.filter(ativo=True).exclude(cargo__isnull=True).exclude(cargo="") \
            .values_list("cargo", "setor__nome"):
        chave = cargo.strip().lower()
        item = contagem.setdefault(chave, {"cargo": cargo.strip(), "total": 0, "setores": set()})
        item["total"] += 1
        if setor:
            item["setores"].add(setor)

    regras = RegraFornecimento.objects.filter(ativo=True).exclude(cargo="").select_related("produto")
    epis = {}
    for r in regras:
        if not r.cargo.upper().startswith(PREFIXO_FUNCIONARIO):
            epis.setdefault(r.cargo.strip().lower(), set()).add(r.produto.nome)

    return JsonResponse({
        "cargos": [
            {
                "cargo": c["cargo"],
                "total_funcionarios": c["total"],
                "setores": sorted(c["setores"]),
                "produtos_vinculados": sorted(epis.get(c["cargo"].lower(), set())),
            }
            for c in sorted(contagem.values(), key=lambda x: x["cargo"].lower())
        ]
    })


@require_POST
@api_backoffice("pessoas")
def api_salvar_cargo(request):
    """Cadastra um novo cargo/função ou renomeia um existente atualizando funcionários e políticas (RF-03, RF-04)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        nome = texto(dados.get("cargo"), "Nome do cargo / função", obrigatorio=True, maximo=100)
        original = texto(dados.get("cargo_original"), "Cargo original", maximo=100)
    except EntradaInvalida as e:
        return erro(str(e))

    if nome.upper().startswith(PREFIXO_FUNCIONARIO):
        return erro("Nome de cargo reservado pelo sistema.")

    catalogo = _catalogo_cargos()
    chave_nova = nome.lower()
    chave_original = original.lower() if original else ""

    if not original:
        if chave_nova in catalogo:
            return erro("Já existe um cargo/função cadastrado com este nome.")
        _registrar_evento_cargo(
            request,
            "CARGO_CADASTRADO",
            f"Cadastrou o cargo/função '{nome}'",
            cargo=nome,
        )
        return JsonResponse({"sucesso": True, "mensagem": "Cargo / função cadastrado com sucesso.", "cargo": nome})

    if chave_nova != chave_original and chave_nova in catalogo:
        return erro("Já existe outro cargo/função com este nome.")

    with transaction.atomic():
        funcionarios_afetados = Usuario.objects.filter(cargo__iexact=original).update(cargo=nome)
        regras_afetadas = RegraFornecimento.objects.filter(cargo__iexact=original).update(cargo=nome)
        _registrar_evento_cargo(
            request,
            "CARGO_ATUALIZADO",
            f"Renomeou o cargo/função '{original}' para '{nome}'",
            cargo=nome,
            cargo_anterior=original,
            funcionarios_afetados=funcionarios_afetados,
            regras_afetadas=regras_afetadas,
        )
    return JsonResponse({"sucesso": True, "mensagem": "Cargo / função atualizado com sucesso.", "cargo": nome})


@require_POST
@api_backoffice("pessoas")
def api_excluir_cargo(request):
    """Remove um cargo/função do catálogo desde que não possua funcionários ativos vinculados (RF-03, RF-04)."""
    dados, erro_json = ler_json(request)
    if erro_json:
        return erro_json
    try:
        nome = texto(dados.get("cargo"), "Cargo / função", obrigatorio=True, maximo=100)
    except EntradaInvalida as e:
        return erro(str(e))

    if Usuario.objects.filter(ativo=True, cargo__iexact=nome).exists():
        return erro("Não é possível remover um cargo que possui funcionários ativos vinculados.", status=409)

    with transaction.atomic():
        Usuario.objects.filter(cargo__iexact=nome).update(cargo="")
        RegraFornecimento.objects.filter(cargo__iexact=nome).delete()
        _registrar_evento_cargo(
            request,
            "CARGO_EXCLUIDO",
            f"Removeu o cargo/função '{nome}'",
            cargo=nome,
        )
    return JsonResponse({"sucesso": True, "mensagem": f"Cargo / função '{nome}' removido."})
