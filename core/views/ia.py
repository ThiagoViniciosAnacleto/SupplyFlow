"""Avaliação do classificador (RNF-14, RNF-16, RNF-17) e acompanhamento da supervisão humana (RF-24, RNF-15).

Duas fontes, sem nenhum número fixo no código:
- métricas do teste separado, geradas pelo comando treinar_classificador (core/ia/modelo/metricas.json);
- o que acontece em uso: quantas sugestões da IA os responsáveis confirmaram ou reclassificaram.
"""
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from ..ia import CATEGORIAS
from ..ia import modelo as modelo_ia
from ..models import DecisaoSolicitacao
from ..permissoes import api_backoffice
from .util import fmt


@require_GET
@api_backoffice("ver")
def api_avaliacao_ia(request):
    metricas = modelo_ia.metricas()

    decisoes = DecisaoSolicitacao.objects.exclude(categoria_ia__isnull=True).exclude(categoria_ia="") \
        .select_related("solicitacao", "aprovador").order_by("-data_decisao")
    total = decisoes.count()
    concordou = decisoes.filter(seguiu_recomendacao_ia=True).count()
    reclassificacoes = [
        {
            "codigo": d.solicitacao.codigo,
            "data": fmt(d.data_decisao, "%d/%m/%Y"),
            "categoria_ia": d.categoria_ia,
            "categoria_confirmada": d.categoria_confirmada,
            "responsavel": d.aprovador.nome if d.aprovador else "—",
        }
        for d in decisoes.filter(seguiu_recomendacao_ia=False)[:20]
    ]

    return JsonResponse({
        "modelo_disponivel": metricas is not None,
        "metricas": metricas,
        "categorias": CATEGORIAS,
        "uso": {
            "decisoes_com_ia": total,
            "concordancia": round(concordou * 100 / total, 1) if total else None,
            "reclassificadas": total - concordou,
            "ultimas_reclassificacoes": reclassificacoes,
        },
    })
