import uuid
from django.db import models


class Setor(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    centro_custo = models.CharField(max_length=50, blank=True, null=True)
    ativo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
        db_table = "setores"

    def __str__(self):
        return self.nome


class Usuario(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    setor = models.ForeignKey(
        Setor, on_delete=models.SET_NULL, null=True, db_column="setor_id"
    )
    codigo_matricula = models.CharField(max_length=30, unique=True)
    nome = models.CharField(max_length=150)
    email = models.CharField(max_length=150, unique=True, blank=True, null=True)
    senha_hash = models.CharField(max_length=255, blank=True, null=True)
    pin_hash = models.CharField(max_length=255, blank=True, null=True)
    cargo = models.CharField(max_length=100, blank=True, null=True)
    perfil = models.CharField(max_length=30, default="COLABORADOR")
    ativo = models.BooleanField(default=True)
    ultimo_acesso = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
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
        managed = False
        db_table = "totens"

    def __str__(self):
        return f"{self.codigo} - {self.nome}"


class CategoriaProduto(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nome = models.CharField(max_length=100, unique=True)
    descricao = models.TextField(blank=True, null=True)

    class Meta:
        managed = False
        db_table = "categorias_produtos"

    def __str__(self):
        return self.nome


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

    class Meta:
        managed = False
        db_table = "produtos"

    def __str__(self):
        return f"{self.sku} - {self.nome}"


class EstoqueTotem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    totem = models.ForeignKey(Totem, on_delete=models.CASCADE, db_column="totem_id")
    produto = models.ForeignKey(
        Produto, on_delete=models.CASCADE, db_column="produto_id"
    )
    quantidade_disponivel = models.IntegerField(default=0)
    quantidade_minima = models.IntegerField(default=5)
    slot_posicao = models.CharField(max_length=20, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "estoque_totem"


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
        managed = False
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
        managed = False
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
    recomendacao = models.CharField(max_length=30)
    score_confianca = models.DecimalField(max_digits=5, decimal_places=2)
    nivel_risco = models.CharField(max_length=20, default="BAIXO")
    parecer_resumo = models.TextField()
    fatores_analisados = models.JSONField(default=list)
    tempo_inferencia_ms = models.IntegerField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
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
    seguiu_recomendacao_ia = models.BooleanField()
    justificativa_decisao = models.TextField(blank=True, null=True)
    data_decisao = models.DateTimeField(auto_now_add=True)

    class Meta:
        managed = False
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
        managed = False
        db_table = "avaliacoes_modelo_ia"