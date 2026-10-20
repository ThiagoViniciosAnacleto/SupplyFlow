"""Registro das operações críticas (RF-46, RNF-07)."""
from .models import RegistroAuditoria


def ip_da_requisicao(request):
    # No Render a requisição passa por um proxy; o IP real vem no X-Forwarded-For.
    encaminhado = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


def registrar(request, acao, objeto=None, descricao="", usuario=None, **detalhes):
    """Grava um evento de auditoria. `usuario` padrão = quem está logado (request.usuario)."""
    usuario = usuario if usuario is not None else getattr(request, "usuario", None)
    RegistroAuditoria.objects.create(
        usuario=usuario,
        usuario_nome=usuario.nome if usuario else "",
        acao=acao,
        entidade=objeto.__class__.__name__ if objeto is not None else "",
        entidade_id=str(getattr(objeto, "pk", "") or "") if objeto is not None else "",
        descricao=descricao[:255],
        detalhes=detalhes,
        ip=ip_da_requisicao(request) if request is not None else None,
    )
