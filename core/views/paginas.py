"""Páginas HTML do frontend.

Todas as páginas do backoffice exigem login e o perfil adequado (o navegador é
redirecionado ao login quando a sessão expira). O login e o totem são públicos.
"""
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from ..permissoes import pagina_backoffice, usuario_da_requisicao


@ensure_csrf_cookie
def pagina_login(request):
    # Quem já está logado vai direto para o painel.
    if usuario_da_requisicao(request) is not None:
        return redirect("/backoffice/visao-geral.html")
    return render(request, "index.html")


@ensure_csrf_cookie
def pagina_totem(request):
    return render(request, "totem/index.html")


@pagina_backoffice("ver")
def pagina_visao_geral(request):
    return render(request, "visao-geral.html")


@pagina_backoffice("ver")
def pagina_solicitacoes(request):
    return render(request, "solicitacoes.html")


@pagina_backoffice("ver")
def pagina_solicitacao_detalhe(request):
    return render(request, "solicitacao.html")


@pagina_backoffice("pessoas")
def pagina_funcionarios(request):
    return render(request, "funcionarios.html")


@pagina_backoffice("ver")
def pagina_produtos(request):
    return render(request, "produtos.html")


@pagina_backoffice("ver")
def pagina_centros_custo(request):
    return render(request, "centros-de-custo.html")


@pagina_backoffice("ver")
def pagina_cargos(request):
    return render(request, "cargos.html")


@pagina_backoffice("ver")
def pagina_estoque(request):
    return render(request, "estoque.html")


@pagina_backoffice("ver")
def pagina_avaliacao_ia(request):
    return render(request, "avaliacao-ia.html")


@pagina_backoffice("ver")
def pagina_entregas(request):
    return render(request, "entregas.html")


@pagina_backoffice("ver")
def pagina_devolucoes(request):
    return render(request, "devolucoes.html")


@pagina_backoffice("pessoas")
def pagina_usuarios(request):
    return render(request, "usuarios.html")


@pagina_backoffice("auditoria")
def pagina_auditoria(request):
    return render(request, "auditoria.html")


@pagina_backoffice("ver")
def pagina_em_construcao(request):
    return render(request, "em-construcao.html")


@pagina_backoffice("ver")
def pagina_fornecedores(request):
    return render(request, "fornecedores.html")


@pagina_backoffice("ver")
def pagina_politicas(request):
    return render(request, "politicas.html")


@pagina_backoffice("ver")
def pagina_historico(request):
    return render(request, "historico.html")


@pagina_backoffice("ver")
def pagina_relatorios(request):
    return render(request, "relatorios.html")


@pagina_backoffice("ver")
def pagina_ficha_epi(request):
    return render(request, "ficha-epi.html")
