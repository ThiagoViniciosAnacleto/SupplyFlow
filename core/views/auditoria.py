"""Consulta da trilha de auditoria (RF-46, RNF-07). Somente leitura."""
from datetime import datetime, time

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET

from ..models import RegistroAuditoria
from ..permissoes import api_backoffice
from .util import fmt

LIMITE = 300


def _data(valor, fim_do_dia=False):
    try:
        dia = datetime.strptime(valor, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(datetime.combine(dia, time.max if fim_do_dia else time.min))


@require_GET
@api_backoffice("auditoria")
def api_listar_auditoria(request):
    """Lista os eventos mais recentes, com filtros por ação, usuário e período."""
    qs = RegistroAuditoria.objects.all()
    acao = (request.GET.get("acao") or "").strip().upper()
    termo = (request.GET.get("q") or "").strip()
    inicio = _data(request.GET.get("de"))
    fim = _data(request.GET.get("ate"), fim_do_dia=True)
    if acao:
        qs = qs.filter(acao=acao)
    if termo:
        qs = qs.filter(usuario_nome__icontains=termo) | qs.filter(descricao__icontains=termo)
    if inicio:
        qs = qs.filter(data__gte=inicio)
    if fim:
        qs = qs.filter(data__lte=fim)

    eventos = [
        {
            "id": r.id,
            "data": fmt(r.data, "%d/%m/%Y %H:%M:%S"),
            "usuario": r.usuario_nome or "—",
            "acao": r.acao,
            "entidade": r.entidade,
            "entidade_id": r.entidade_id,
            "descricao": r.descricao,
            "detalhes": r.detalhes,
            "ip": r.ip or "—",
        }
        for r in qs.order_by("-data")[:LIMITE]
    ]
    acoes = sorted(RegistroAuditoria.objects.values_list("acao", flat=True).distinct())
    return JsonResponse({"eventos": eventos, "acoes": acoes, "limite": LIMITE})
