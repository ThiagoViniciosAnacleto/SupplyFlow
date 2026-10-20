from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import path

from core import views
from core.contas import FormularioRedefinicao

urlpatterns = [
    path("admin/", admin.site.urls),

    # =========================================================================
    # ROTAS DAS PÁGINAS HTML
    # =========================================================================
    path("", views.pagina_login, name="login"),
    path("index.html", views.pagina_login, name="index_html"),

    # Totem de Autoatendimento
    path("totem/", views.pagina_totem, name="totem"),
    path("totem/index.html", views.pagina_totem, name="totem_index"),
    path("totem.html", views.pagina_totem, name="totem_html"),

    # Backoffice Administrativo
    path("backoffice/visao-geral.html", views.pagina_visao_geral, name="visao_geral"),
    path("backoffice/solicitacoes.html", views.pagina_solicitacoes, name="solicitacoes"),
    path("backoffice/solicitacao.html", views.pagina_solicitacao_detalhe, name="solicitacao_detalhe"),
    path("backoffice/funcionarios.html", views.pagina_funcionarios, name="funcionarios"),
    path("backoffice/produtos.html", views.pagina_produtos, name="produtos"),
    path("backoffice/centros-de-custo.html", views.pagina_centros_custo, name="centros_custo"),
    path("backoffice/cargos.html", views.pagina_cargos, name="cargos"),
    path("backoffice/funcoes.html", views.pagina_cargos, name="funcoes"),
    path("backoffice/estoque.html", views.pagina_estoque, name="estoque"),
    path("backoffice/avaliacao-ia.html", views.pagina_avaliacao_ia, name="avaliacao_ia"),
    path("backoffice/entregas.html", views.pagina_entregas, name="entregas"),
    path("backoffice/devolucoes.html", views.pagina_devolucoes, name="devolucoes"),
    path("backoffice/usuarios.html", views.pagina_usuarios, name="usuarios"),
    path("backoffice/fornecedores.html", views.pagina_fornecedores, name="fornecedores"),
    path("backoffice/politicas.html", views.pagina_politicas, name="politicas"),
    path("backoffice/historico.html", views.pagina_historico, name="historico"),
    path("backoffice/relatorios.html", views.pagina_relatorios, name="relatorios"),
    path("backoffice/ficha-epi.html", views.pagina_ficha_epi, name="ficha_epi"),
    path("backoffice/auditoria.html", views.pagina_auditoria, name="auditoria"),
    path("backoffice/em-construcao.html", views.pagina_em_construcao, name="em_construcao"),

    # "Esqueci minha senha" (telas prontas do Django, com o visual do SupplyFlow)
    path(
        "senha/esqueci/",
        auth_views.PasswordResetView.as_view(
            form_class=FormularioRedefinicao,
            template_name="registration/esqueci-senha.html",
            subject_template_name="registration/assunto_redefinicao.txt",
            email_template_name="registration/email_redefinicao.txt",
            success_url="/senha/enviada/",
        ),
        name="senha_esqueci",
    ),
    path(
        "senha/enviada/",
        auth_views.PasswordResetDoneView.as_view(template_name="registration/senha-enviada.html"),
        name="senha_enviada",
    ),
    path(
        "senha/nova/<uidb64>/<token>/",
        views.RedefinirSenhaView.as_view(),
        name="password_reset_confirm",
    ),
    path(
        "senha/concluida/",
        auth_views.PasswordResetCompleteView.as_view(template_name="registration/senha-concluida.html"),
        name="senha_concluida",
    ),

    # =========================================================================
    # ENDPOINTS DA API DO TOTEM DE AUTOATENDIMENTO
    # =========================================================================
    path("api/totem/identificar/", views.api_totem_identificar, name="api_totem_identificar"),
    path("api/totem/login/", views.api_totem_login, name="api_totem_login"),
    path("api/totem/sair/", views.api_totem_sair, name="api_totem_sair"),
    path("api/totem/produtos/", views.api_totem_produtos, name="api_totem_produtos"),
    path("api/totem/solicitar/", views.api_totem_solicitar, name="api_totem_solicitar"),
    path("api/totem/solicitacoes/", views.api_totem_solicitacoes_usuario, name="api_totem_solicitacoes_usuario"),
    path("api/totem/solicitacoes/<uuid:solicitacao_id>/cancelar/", views.api_totem_cancelar, name="api_totem_cancelar"),

    # =========================================================================
    # AUTENTICAÇÃO DO BACKOFFICE
    # =========================================================================
    path("api/login/", views.api_login, name="api_login"),
    path("api/logout/", views.api_logout, name="api_logout"),
    path("api/sessao/", views.api_sessao, name="api_sessao"),

    # =========================================================================
    # ENDPOINTS DA API DO BACKOFFICE E DASHBOARD
    # =========================================================================
    path("api/dashboard/", views.api_dashboard_kpis, name="api_dashboard"),
    path("api/usuarios/", views.api_listar_usuarios, name="api_usuarios"),
    path("api/solicitacoes/", views.api_listar_solicitacoes, name="api_solicitacoes"),
    path("api/solicitacoes/<uuid:solicitacao_id>/", views.api_detalhe_solicitacao, name="api_solicitacao_detalhe"),
    path("api/solicitacoes/<uuid:solicitacao_id>/decidir/", views.api_decidir_solicitacao, name="api_decidir_solicitacao"),
    path("api/solicitacoes/<uuid:solicitacao_id>/cancelar/", views.api_cancelar_solicitacao, name="api_cancelar_solicitacao"),
    path("api/produtos/", views.api_listar_produtos, name="api_produtos"),
    path("api/produtos/salvar/", views.api_salvar_produto, name="api_salvar_produto"),
    path("api/produtos/<uuid:produto_id>/toggle/", views.api_toggle_produto, name="api_toggle_produto"),
    path("api/funcionarios/", views.api_listar_funcionarios, name="api_funcionarios"),
    path("api/funcionarios/salvar/", views.api_salvar_funcionario, name="api_salvar_funcionario"),
    path("api/funcionarios/<uuid:funcionario_id>/toggle/", views.api_toggle_funcionario, name="api_toggle_funcionario"),
    path("api/funcionarios/<uuid:funcionario_id>/enviar-link-senha/", views.api_enviar_link_senha, name="api_enviar_link_senha"),
    path("api/setores/", views.api_listar_setores, name="api_setores"),
    path("api/setores/salvar/", views.api_salvar_setor, name="api_salvar_setor"),
    path("api/setores/<uuid:setor_id>/toggle/", views.api_toggle_setor, name="api_toggle_setor"),
    path("api/estoque/", views.api_listar_estoque, name="api_estoque"),
    path("api/estoque/repor/", views.api_repor_estoque, name="api_repor_estoque"),
    path("api/estoque/movimentacoes/", views.api_movimentacoes_estoque, name="api_movimentacoes_estoque"),
    path("api/fornecedores/", views.api_listar_fornecedores, name="api_fornecedores"),
    path("api/fornecedores/salvar/", views.api_salvar_fornecedor, name="api_salvar_fornecedor"),
    path("api/fornecedores/<uuid:fornecedor_id>/toggle/", views.api_toggle_fornecedor, name="api_toggle_fornecedor"),
    path("api/politicas/", views.api_listar_regras, name="api_politicas"),
    path("api/politicas/salvar/", views.api_salvar_regra, name="api_salvar_politica"),
    path("api/politicas/<uuid:regra_id>/toggle/", views.api_toggle_regra, name="api_toggle_politica"),
    path("api/cargos/", views.api_listar_cargos, name="api_cargos"),
    path("api/avaliacao-ia/", views.api_avaliacao_ia, name="api_avaliacao_ia"),
    path("api/entregas/", views.api_listar_entregas, name="api_entregas"),
    path("api/entregas/<uuid:solicitacao_id>/confirmar/", views.api_confirmar_entrega, name="api_confirmar_entrega"),
    path("api/devolucoes/", views.api_listar_devolucoes, name="api_devolucoes"),
    path("api/devolucoes/<uuid:solicitacao_id>/registrar/", views.api_registrar_devolucao, name="api_registrar_devolucao"),
    path("api/auditoria/", views.api_listar_auditoria, name="api_auditoria"),
    path("api/historico/", views.api_historico, name="api_historico"),
    path("api/relatorios/", views.api_relatorios, name="api_relatorios"),
    path("api/funcionarios/<uuid:funcionario_id>/ficha/", views.api_ficha_epi, name="api_ficha_epi"),
]
