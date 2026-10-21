"""Converte os registros criados antes das regras novas (banco do Render).

- Status PENDENTE / EM_ANALISE_IA passam a AGUARDANDO_DECISAO.
- Aprovações cuja observação falava em "devolução" viram APROVADA_CONDICIONAL
  com exige_devolucao=True (antes a condição era deduzida pelo texto).
- A categoria da IA, que só existia dentro do texto do parecer, vai para o campo próprio.
- Solicitações já RETIRADAS ganham o registro de Entrega (histórico e ficha de EPI).
- Solicitações aprovadas e ainda não entregues passam a reservar o estoque.
"""
import re

from django.db import migrations, transaction
from django.db.models import F, Sum

AGUARDANDO_ANTIGOS = ["PENDENTE", "EM_ANALISE_IA"]
PADRAO_CATEGORIA = re.compile(r"Classificado como '([^']+)'")

# Bancos criados antes das migrações usavam tipos ENUM do PostgreSQL em vez de VARCHAR.
# Antes de converter os dados, garantimos que todos os valores novos existam nesses ENUMs.
ENUMS_LEGADOS = [
    (
        "solicitacoes",
        "status",
        [
            "PENDENTE",
            "EM_ANALISE_IA",
            "AGUARDANDO_DECISAO",
            "APROVADA",
            "APROVADA_CONDICIONAL",
            "REPROVADA",
            "CANCELADA",
            "RETIRADA",
        ],
    ),
    (
        "decisoes_solicitacao",
        "decisao_final",
        ["APROVADA", "APROVADA_CONDICIONAL", "REPROVADA"],
    ),
    (
        "analises_ia",
        "recomendacao",
        ["SUGESTAO_CATEGORIA", "APROVAR", "REPROVAR", "REVISAO_MANUAL"],
    ),
    (
        "analises_ia",
        "nivel_risco",
        ["NAO_SE_APLICA", "BAIXO", "MEDIO", "ALTO", "CRITICO"],
    ),
    (
        "usuarios",
        "perfil",
        ["ADMIN", "GESTOR", "TECNICO_SEGURANCA", "OPERADOR", "COMPRADOR", "COLABORADOR"],
    ),
]


def _atualizar_enums_postgres(schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for tabela, coluna, valores in ENUMS_LEGADOS:
            cursor.execute(
                """
                SELECT t.typname
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_type t ON t.oid = a.atttypid
                WHERE n.nspname = current_schema()
                  AND c.relname = %s
                  AND a.attname = %s
                  AND t.typtype = 'e'
                """,
                [tabela, coluna],
            )
            linha = cursor.fetchone()
            if not linha:
                continue
            tipo_enum = schema_editor.quote_name(linha[0])
            for valor in valores:
                cursor.execute(f"ALTER TYPE {tipo_enum} ADD VALUE IF NOT EXISTS '{valor}'")

        # Remove restrições CHECK legadas (ex.: decisoes_solicitacao_decisao_final_check)
        # criadas pelo script SQL original antes das migrações do Django.
        tabelas = [t for t, _, _ in ENUMS_LEGADOS] + ["avaliacoes_modelo_ia"]
        cursor.execute(
            """
            SELECT c.relname, con.conname
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND con.contype = 'c'
              AND c.relname = ANY(%s)
            """,
            [tabelas],
        )
        for tabela, restricao in cursor.fetchall():
            tabela_q = schema_editor.quote_name(tabela)
            restricao_q = schema_editor.quote_name(restricao)
            cursor.execute(f"ALTER TABLE {tabela_q} DROP CONSTRAINT IF EXISTS {restricao_q}")


def converter(apps, schema_editor):
    _atualizar_enums_postgres(schema_editor)

    Solicitacao = apps.get_model("core", "Solicitacao")
    Decisao = apps.get_model("core", "DecisaoSolicitacao")
    Analise = apps.get_model("core", "AnaliseIA")
    Entrega = apps.get_model("core", "Entrega")
    Estoque = apps.get_model("core", "EstoqueTotem")
    Item = apps.get_model("core", "SolicitacaoItem")

    with transaction.atomic(using=schema_editor.connection.alias):
        Solicitacao.objects.filter(status__in=AGUARDANDO_ANTIGOS).update(status="AGUARDANDO_DECISAO")

        for analise in Analise.objects.filter(categoria__isnull=True):
            achado = PADRAO_CATEGORIA.search(analise.parecer_resumo or "")
            if achado:
                analise.categoria = achado.group(1)[:50]
                analise.save(update_fields=["categoria"])

        for decisao in Decisao.objects.select_related("solicitacao"):
            analise = Analise.objects.filter(solicitacao_id=decisao.solicitacao_id).first()
            if analise and analise.categoria and not decisao.categoria_ia:
                decisao.categoria_ia = analise.categoria
                decisao.categoria_confirmada = analise.categoria
            if "devolu" in (decisao.justificativa_decisao or "").lower():
                decisao.exige_devolucao = True
                decisao.decisao_final = "APROVADA_CONDICIONAL"
                if decisao.solicitacao.status == "APROVADA":
                    Solicitacao.objects.filter(pk=decisao.solicitacao_id).update(status="APROVADA_CONDICIONAL")
            decisao.save()

        for solicitacao in Solicitacao.objects.filter(status="RETIRADA").select_related("solicitante__setor"):
            if Entrega.objects.filter(solicitacao_id=solicitacao.pk).exists():
                continue
            setor = solicitacao.solicitante.setor
            for item in Item.objects.filter(solicitacao_id=solicitacao.pk).select_related("produto__categoria"):
                produto = item.produto
                entrega = Entrega.objects.create(
                    solicitacao_id=solicitacao.pk, item_id=item.pk, colaborador_id=solicitacao.solicitante_id,
                    produto_id=produto.pk, almoxarife=None, totem_id=solicitacao.totem_id,
                    quantidade=item.quantidade_aprovada or item.quantidade_solicitada,
                    produto_nome=produto.nome,
                    eh_epi=bool(produto.categoria and "EPI" in produto.categoria.nome.upper()),
                    ca=produto.ca or "", lote="",
                    setor_nome=setor.nome if setor else "", centro_custo=(setor.centro_custo or "") if setor else "",
                    custo_unitario=item.custo_unitario_momento,
                )
                # mantém a data real da retirada
                Entrega.objects.filter(pk=entrega.pk).update(
                    data=solicitacao.data_conclusao or solicitacao.data_solicitacao
                )

        Item.objects.filter(
            solicitacao__status__in=["APROVADA", "APROVADA_CONDICIONAL"],
            quantidade_aprovada__isnull=True,
        ).update(quantidade_aprovada=F("quantidade_solicitada"))

        reservas = (
            Item.objects.filter(solicitacao__status__in=["APROVADA", "APROVADA_CONDICIONAL"])
            .values("solicitacao__totem_id", "produto_id")
            .annotate(total=Sum("quantidade_aprovada"))
        )
        for r in reservas:
            estoque = Estoque.objects.filter(totem_id=r["solicitacao__totem_id"], produto_id=r["produto_id"]).first()
            if estoque:
                estoque.quantidade_reservada = min(r["total"] or 0, max(estoque.quantidade_disponivel, 0))
                estoque.save(update_fields=["quantidade_reservada"])


class Migration(migrations.Migration):
    atomic = False
    dependencies = [("core", "0003_regras_estoque_entregas_devolucoes")]

    operations = [migrations.RunPython(converter, migrations.RunPython.noop)]
