import uuid

from django.conf import settings
from django.db import models


class Setor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    centro_custo = models.CharField(max_length=50, blank=True, null=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "setores"

    def __str__(self):
        return self.nome


class Usuario(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    setor = models.ForeignKey(
        Setor, on_delete=models.SET_NULL, null=True, db_column="setor_id"
    )
    # Conta de login do backoffice (django.contrib.auth). Só quem tem perfil
    # administrativo possui conta; colaboradores usam apenas o PIN no totem.
    conta = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="usuario",
    )
    codigo_matricula = models.CharField(max_length=30, unique=True)
    nome = models.CharField(max_length=150)
    email = models.CharField(max_length=150, unique=True, blank=True, null=True)
    # Legado: senhas antigas em MD5. São migradas para a conta no 1º login e apagadas.
    senha_hash = models.CharField(max_length=255, blank=True, null=True)
    # PIN do totem com hash forte do Django (PBKDF2); hashes MD5 antigos são convertidos no 1º uso.
    pin_hash = models.CharField(max_length=255, blank=True, null=True)
    cargo = models.CharField(max_length=100, blank=True, null=True)
    perfil = models.CharField(max_length=30, default="COLABORADOR")
    ativo = models.BooleanField(default=True)
    ultimo_acesso = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "usuarios"

    def __str__(self):
        return f"{self.codigo_matricula} - {self.nome}"


class Totem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=30, unique=True)
    nome = models.CharField(max_length=100)
    localizacao = models.CharField(max_length=150, blank=True, null=True)
    status_online = models.BooleanField(default=True)
    ultimo_ping = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "totens"

    def __str__(self):
        return f"{self.codigo} - {self.nome}"


class CategoriaProduto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    descricao = models.TextField(blank=True, null=True)

    class Meta:
        db_table = "categorias_produtos"

    def __str__(self):
        return self.nome


class Fornecedor(models.Model):
    """Fornecedores de EPIs e consumíveis (RF-05)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    razao_social = models.CharField(max_length=150)
    nome_fantasia = models.CharField(max_length=150, blank=True)
    cnpj = models.CharField(max_length=18, unique=True)
    email = models.CharField(max_length=150, blank=True)
    telefone = models.CharField(max_length=30, blank=True)
    contato = models.CharField(max_length=100, blank=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fornecedores"
        ordering = ["razao_social"]

    def __str__(self):
        return self.nome_fantasia or self.razao_social


class Produto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    categoria = models.ForeignKey(
        CategoriaProduto,
        on_delete=models.SET_NULL,
        null=True,
        db_column="categoria_id",
    )
    sku = models.CharField(max_length=50, unique=True)
    nome = models.CharField(max_length=150)
    descricao = models.TextField(blank=True, null=True)
    unidade_medida = models.CharField(max_length=20, default="UN")
    custo_unitario = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    limite_padrao_mensal = models.IntegerField(blank=True, null=True)
    requer_justificativa = models.BooleanField(default=False)
    imagem_url = models.TextField(blank=True, null=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    # Dados específicos de EPI (RF-07) e periodicidade mínima entre entregas (RF-13)
    ca = models.CharField("Certificado de Aprovação", max_length=30, blank=True, null=True)
    validade_ca = models.DateField(blank=True, null=True)
    tamanho = models.CharField(max_length=30, blank=True, null=True)
    periodicidade_dias = models.PositiveIntegerField(blank=True, null=True)
    fornecedor = models.ForeignKey(
        Fornecedor, on_delete=models.SET_NULL, null=True, blank=True, db_column="fornecedor_id"
    )

    class Meta:
        db_table = "produtos"

    def __str__(self):
        return f"{self.sku} - {self.nome}"

    @property
    def eh_epi(self):
        return bool(self.categoria and "EPI" in self.categoria.nome.upper())


class EstoqueTotem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    totem = models.ForeignKey(Totem, on_delete=models.CASCADE, db_column="totem_id")
    produto = models.ForeignKey(
        Produto, on_delete=models.CASCADE, db_column="produto_id"
    )
    quantidade_disponivel = models.IntegerField(default=0)
    # Parte do disponível já prometida a solicitações aprovadas e ainda não entregues (RF-39)
    quantidade_reservada = models.IntegerField(default=0)
    quantidade_minima = models.IntegerField(default=5)
    slot_posicao = models.CharField(max_length=20, blank=True, null=True)
    lote = models.CharField(max_length=50, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "estoque_totem"

    @property
    def livre(self):
        """Quantidade que ainda pode ser prometida a novas solicitações."""
        return self.quantidade_disponivel - self.quantidade_reservada


class Solicitacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo = models.CharField(max_length=30, unique=True)
    solicitante = models.ForeignKey(
        Usuario, on_delete=models.RESTRICT, db_column="solicitante_id"
    )
    totem = models.ForeignKey(
        Totem, on_delete=models.SET_NULL, null=True, db_column="totem_id"
    )
    status = models.CharField(max_length=30, default="PENDENTE")
    justificativa_solicitante = models.TextField(blank=True, null=True)
    motivo_categoria = models.CharField(max_length=100, blank=True, null=True)
    fora_da_cota = models.BooleanField(default=False)
    valor_total_estimado = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )
    data_solicitacao = models.DateTimeField(auto_now_add=True)
    data_conclusao = models.DateTimeField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "solicitacoes"

    def __str__(self):
        return self.codigo


class SolicitacaoItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitacao = models.ForeignKey(
        Solicitacao,
        related_name="itens",
        on_delete=models.CASCADE,
        db_column="solicitacao_id",
    )
    produto = models.ForeignKey(
        Produto, on_delete=models.RESTRICT, db_column="produto_id"
    )
    quantidade_solicitada = models.IntegerField()
    quantidade_aprovada = models.IntegerField(blank=True, null=True)
    custo_unitario_momento = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00
    )

    class Meta:
        db_table = "solicitacao_itens"


class AnaliseIA(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitacao = models.OneToOneField(
        Solicitacao,
        related_name="analise_ia",
        on_delete=models.CASCADE,
        db_column="solicitacao_id",
    )
    modelo_versao = models.CharField(max_length=50)
    # Categoria sugerida pelo classificador. A IA NÃO recomenda aprovar/rejeitar (RF-25);
    # "recomendacao" é mantida só por compatibilidade e recebe "SUGESTAO_CATEGORIA".
    categoria = models.CharField(max_length=50, blank=True, null=True)
    recomendacao = models.CharField(max_length=30)
    score_confianca = models.DecimalField(max_digits=5, decimal_places=2)
    nivel_risco = models.CharField(max_length=20, default="BAIXO")
    parecer_resumo = models.TextField()
    fatores_analisados = models.JSONField(default=list)
    tempo_inferencia_ms = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "analises_ia"


class DecisaoSolicitacao(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitacao = models.OneToOneField(
        Solicitacao,
        related_name="decisao",
        on_delete=models.CASCADE,
        db_column="solicitacao_id",
    )
    aprovador = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, db_column="aprovador_id"
    )
    decisao_final = models.CharField(max_length=30)
    # True quando o responsável manteve a categoria sugerida pela IA.
    seguiu_recomendacao_ia = models.BooleanField()
    justificativa_decisao = models.TextField(blank=True, null=True)
    data_decisao = models.DateTimeField(auto_now_add=True)
    # Trilha da classificação: sugerida pela IA x confirmada pelo responsável (RF-24)
    categoria_ia = models.CharField(max_length=50, blank=True, null=True)
    categoria_confirmada = models.CharField(max_length=50, blank=True, null=True)
    # Aprovação condicionada à devolução do EPI anterior (RF-29, RF-35)
    exige_devolucao = models.BooleanField(default=False)

    class Meta:
        db_table = "decisoes_solicitacao"


class AvaliacaoModeloIA(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    analise_ia = models.OneToOneField(
        AnaliseIA,
        related_name="avaliacao",
        on_delete=models.CASCADE,
        db_column="analise_ia_id",
    )
    avaliador = models.ForeignKey(
        Usuario, on_delete=models.RESTRICT, db_column="avaliador_id"
    )
    classificacao = models.CharField(max_length=50)
    nota_precisao = models.IntegerField()
    feedback_comentario = models.TextField(blank=True, null=True)
    tags_erro = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "avaliacoes_modelo_ia"


class RegistroAuditoria(models.Model):
    """Trilha de auditoria (RF-46, RNF-07): quem fez o quê, quando e em qual registro.
    Os registros só são criados, nunca editados ou apagados pela aplicação."""

    id = models.BigAutoField(primary_key=True)
    usuario = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True, db_column="usuario_id"
    )
    usuario_nome = models.CharField(max_length=150, blank=True)  # cópia: sobrevive à exclusão
    acao = models.CharField(max_length=50, db_index=True)
    entidade = models.CharField(max_length=50, blank=True)
    entidade_id = models.CharField(max_length=64, blank=True)
    descricao = models.CharField(max_length=255, blank=True)
    detalhes = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    data = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "auditoria"
        ordering = ["-data"]

    def __str__(self):
        return f"{self.data:%d/%m/%Y %H:%M} {self.acao} {self.usuario_nome}"

class RegraFornecimento(models.Model):
    """Política de fornecimento (RF-12 a RF-14): sobrepõe o limite e a periodicidade
    padrão do produto para um setor e/ou cargo. Vale a regra mais específica."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    produto = models.ForeignKey(Produto, on_delete=models.CASCADE, related_name="regras", db_column="produto_id")
    setor = models.ForeignKey(Setor, on_delete=models.CASCADE, null=True, blank=True, db_column="setor_id")
    cargo = models.CharField(max_length=100, blank=True)
    limite_mensal = models.PositiveIntegerField(blank=True, null=True)
    periodicidade_dias = models.PositiveIntegerField(blank=True, null=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "regras_fornecimento"

    def __str__(self):
        escopo = " / ".join(filter(None, [self.setor.nome if self.setor else "", self.cargo])) or "Todos"
        return f"{self.produto.nome} — {escopo}"


class MovimentacaoEstoque(models.Model):
    """Toda alteração de saldo fica registrada (RF-36, RF-37, RF-45, RNF-08)."""

    ENTRADA = "ENTRADA"
    RESERVA = "RESERVA"
    LIBERACAO = "LIBERACAO"
    SAIDA = "SAIDA"
    AJUSTE = "AJUSTE"
    TIPOS = [(ENTRADA, "Entrada"), (RESERVA, "Reserva"), (LIBERACAO, "Liberação de reserva"),
             (SAIDA, "Saída (entrega)"), (AJUSTE, "Ajuste")]

    id = models.BigAutoField(primary_key=True)
    estoque = models.ForeignKey(EstoqueTotem, on_delete=models.CASCADE, db_column="estoque_id")
    produto = models.ForeignKey(Produto, on_delete=models.RESTRICT, db_column="produto_id")
    tipo = models.CharField(max_length=20, choices=TIPOS)
    quantidade = models.IntegerField()
    saldo_disponivel_apos = models.IntegerField()
    saldo_reservado_apos = models.IntegerField()
    lote = models.CharField(max_length=50, blank=True)
    solicitacao = models.ForeignKey(Solicitacao, on_delete=models.SET_NULL, null=True, blank=True,
                                    db_column="solicitacao_id")
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, db_column="usuario_id")
    observacao = models.CharField(max_length=255, blank=True)
    data = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "movimentacoes_estoque"
        ordering = ["-data"]


class Entrega(models.Model):
    """Entrega física confirmada pelo almoxarife (RF-41, RF-42, RF-43).
    Guarda uma cópia dos dados do momento (RNF-18): mudar o cadastro depois não
    altera o histórico nem a ficha de EPI do funcionário."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitacao = models.ForeignKey(Solicitacao, on_delete=models.RESTRICT, related_name="entregas",
                                    db_column="solicitacao_id")
    item = models.ForeignKey(SolicitacaoItem, on_delete=models.RESTRICT, db_column="item_id")
    colaborador = models.ForeignKey(Usuario, on_delete=models.RESTRICT, related_name="entregas_recebidas",
                                    db_column="colaborador_id")
    produto = models.ForeignKey(Produto, on_delete=models.RESTRICT, db_column="produto_id")
    almoxarife = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name="entregas_feitas",
                                   db_column="almoxarife_id")
    totem = models.ForeignKey(Totem, on_delete=models.SET_NULL, null=True, db_column="totem_id")
    quantidade = models.PositiveIntegerField()
    # Cópias do momento da entrega
    produto_nome = models.CharField(max_length=150)
    eh_epi = models.BooleanField(default=False)
    ca = models.CharField(max_length=30, blank=True)
    lote = models.CharField(max_length=50, blank=True)
    setor_nome = models.CharField(max_length=100, blank=True)
    centro_custo = models.CharField(max_length=50, blank=True)
    custo_unitario = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    data = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "entregas"
        ordering = ["-data"]


class Devolucao(models.Model):
    """Devolução do EPI anterior exigida numa aprovação condicionada (RF-31 a RF-35)."""

    CONDICOES = [
        ("BOM_ESTADO", "Bom estado"),
        ("DESGASTE_NORMAL", "Desgaste normal"),
        ("DANIFICADO", "Danificado"),
        ("CONTAMINADO", "Contaminado"),
        ("INUTILIZAVEL", "Inutilizável"),
    ]
    DESTINACOES = [
        ("DESCARTE", "Descarte"),
        ("AVALIACAO_TECNICA", "Avaliação técnica"),
        ("QUARENTENA", "Quarentena"),
        ("DEVOLUCAO_FORNECEDOR", "Devolução ao fornecedor"),
        ("REUSO", "Reutilização"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    solicitacao = models.OneToOneField(Solicitacao, on_delete=models.CASCADE, related_name="devolucao",
                                       db_column="solicitacao_id")
    entrega_original = models.ForeignKey(Entrega, on_delete=models.SET_NULL, null=True, blank=True,
                                         db_column="entrega_original_id")
    dispensada = models.BooleanField(default=False)
    condicao = models.CharField(max_length=30, choices=CONDICOES, blank=True)
    destinacao = models.CharField(max_length=30, choices=DESTINACOES, blank=True)
    observacao = models.TextField(blank=True)
    registrado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, db_column="registrado_por_id")
    data = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "devolucoes"
