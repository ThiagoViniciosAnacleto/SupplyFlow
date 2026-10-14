from django.contrib import admin
from django.urls import path
from core import views

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
    path("backoffice/em-construcao.html", views.pagina_em_construcao, name="em_construcao"),

    # =========================================================================
    # ENDPOINTS DA API DO TOTEM DE AUTOATENDIMENTO
    # =========================================================================
    path("api/totem/identificar/", views.api_totem_identificar, name="api_totem_identificar"),
    path("api/totem/login/", views.api_totem_login, name="api_totem_login"),
    path("api/totem/produtos/", views.api_totem_produtos, name="api_totem_produtos"),
    path("api/totem/solicitar/", views.api_totem_solicitar, name="api_totem_solicitar"),
    path("api/totem/solicitacoes/", views.api_totem_solicitacoes_usuario, name="api_totem_solicitacoes_usuario"),

    # =========================================================================
    # ENDPOINTS DA API DO BACKOFFICE E DASHBOARD
    # =========================================================================
    path("api/dashboard/", views.api_dashboard_kpis, name="api_dashboard"),
    path("api/usuarios/", views.api_listar_usuarios, name="api_usuarios"),
    path("api/solicitacoes/", views.api_listar_solicitacoes, name="api_solicitacoes"),
    path("api/solicitacoes/<uuid:solicitacao_id>/", views.api_detalhe_solicitacao, name="api_solicitacao_detalhe"),
    path("api/solicitacoes/<uuid:solicitacao_id>/decidir/", views.api_decidir_solicitacao, name="api_decidir_solicitacao"),
    path("api/produtos/", views.api_listar_produtos, name="api_produtos"),
    path("api/produtos/salvar/", views.api_salvar_produto, name="api_salvar_produto"),
    path("api/produtos/<uuid:produto_id>/toggle/", views.api_toggle_produto, name="api_toggle_produto"),
    path("api/funcionarios/", views.api_listar_funcionarios, name="api_funcionarios"),
    path("api/funcionarios/salvar/", views.api_salvar_funcionario, name="api_salvar_funcionario"),
    path("api/funcionarios/<uuid:funcionario_id>/toggle/", views.api_toggle_funcionario, name="api_toggle_funcionario"),
    path("api/setores/", views.api_listar_setores, name="api_setores"),
    path("api/setores/salvar/", views.api_salvar_setor, name="api_salvar_setor"),
    path("api/setores/<uuid:setor_id>/toggle/", views.api_toggle_setor, name="api_toggle_setor"),
    path("api/estoque/", views.api_listar_estoque, name="api_estoque"),
    path("api/estoque/repor/", views.api_repor_estoque, name="api_repor_estoque"),
    path("api/avaliacao-ia/", views.api_avaliacao_ia, name="api_avaliacao_ia"),
    path("api/entregas/", views.api_listar_entregas, name="api_entregas"),
    path("api/entregas/<uuid:solicitacao_id>/confirmar/", views.api_confirmar_entrega, name="api_confirmar_entrega"),
    path("api/devolucoes/", views.api_listar_devolucoes, name="api_devolucoes"),
    path("api/login/", views.api_login, name="api_login"),
]