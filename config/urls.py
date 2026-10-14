from django.contrib import admin
from django.urls import path
from core import views

urlpatterns = [
    path("admin/", admin.site.urls),
    # Rotas das páginas HTML (Raiz e Backoffice)
    path("", views.pagina_login, name="login"),
    path("index.html", views.pagina_login, name="index_html"),
    path("backoffice/visao-geral.html", views.pagina_visao_geral, name="visao_geral"),
    path("backoffice/solicitacoes.html", views.pagina_solicitacoes, name="solicitacoes"),
    path("backoffice/em-construcao.html", views.pagina_em_construcao, name="em_construcao"),
    path("backoffice/solicitacao.html", views.pagina_em_construcao, name="solicitacao_detalhe"),
    # Rotas da API em JSON (Conectadas ao PostgreSQL)
    path("api/usuarios/", views.api_listar_usuarios, name="api_usuarios"),
    path("api/dashboard/", views.api_dashboard_kpis, name="api_dashboard"),
    path("api/solicitacoes/", views.api_listar_solicitacoes, name="api_solicitacoes"),
    path("api/solicitacoes/<uuid:solicitacao_id>/decidir/", views.api_decidir_solicitacao, name="api_decidir_solicitacao"),
    path("api/produtos/", views.api_listar_produtos, name="api_produtos"),
    path("api/login/", views.api_login, name="api_login"),
]