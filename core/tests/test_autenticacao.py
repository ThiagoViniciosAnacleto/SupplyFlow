"""Login, sessão, perfis, CSRF, senha e PIN (RF-08, RF-09, RF-11, RNF-03, RNF-04, RNF-05)."""
import hashlib
import json
import re

from django.core import mail
from django.test import Client

from core.models import RegistroAuditoria, Usuario

from .base import PIN, SENHA, BaseTeste


class LoginBackofficeTeste(BaseTeste):
    def test_login_correto_abre_sessao_e_registra_auditoria(self):
        resposta = self.entrar(self.admin)
        self.assertTrue(resposta.json()["autenticado"])
        self.assertEqual(self.client.get("/api/sessao/").status_code, 200)
        self.assertTrue(RegistroAuditoria.objects.filter(acao="LOGIN", usuario=self.admin).exists())

    def test_senha_errada_recusa_sem_dizer_se_o_email_existe(self):
        r1 = self.post("/api/login/", {"email": self.admin.email, "senha": "errada"})
        r2 = self.post("/api/login/", {"email": "naoexiste@teste.local", "senha": "errada"})
        self.assertEqual(r1.status_code, 401)
        self.assertEqual(r1.json()["erro"], r2.json()["erro"])
        self.assertEqual(self.client.get("/api/sessao/").status_code, 401)

    def test_bloqueia_apos_cinco_tentativas_erradas(self):
        for _ in range(5):
            self.post("/api/login/", {"email": self.admin.email, "senha": "errada"})
        resposta = self.post("/api/login/", {"email": self.admin.email, "senha": SENHA})
        self.assertEqual(resposta.status_code, 429)

    def test_colaborador_nao_entra_no_backoffice(self):
        self.colaborador.email = "joao@teste.local"
        self.colaborador.save()
        resposta = self.post("/api/login/", {"email": "joao@teste.local", "senha": SENHA})
        self.assertEqual(resposta.status_code, 401)

    def test_senha_md5_antiga_e_migrada_no_primeiro_login(self):
        legado = Usuario.objects.create(codigo_matricula="L-001", nome="Legado", perfil="GESTOR",
                                        email="legado@teste.local",
                                        senha_hash=hashlib.md5(b"senha-antiga-123").hexdigest())
        resposta = self.post("/api/login/", {"email": "legado@teste.local", "senha": "senha-antiga-123"})
        self.assertEqual(resposta.status_code, 200)
        legado.refresh_from_db()
        self.assertIsNone(legado.senha_hash)
        self.assertTrue(legado.conta.password.startswith("pbkdf2_"))

    def test_logout_encerra_a_sessao(self):
        self.entrar(self.admin)
        self.post("/api/logout/")
        self.assertEqual(self.client.get("/api/sessao/").status_code, 401)

    def test_csrf_e_exigido(self):
        cliente = Client(enforce_csrf_checks=True)
        resposta = cliente.post("/api/login/", json.dumps({"email": self.admin.email, "senha": SENHA}),
                                content_type="application/json")
        self.assertEqual(resposta.status_code, 403)


class PermissoesTeste(BaseTeste):
    def test_apis_exigem_login(self):
        for url in ["/api/usuarios/", "/api/funcionarios/", "/api/solicitacoes/", "/api/dashboard/",
                    "/api/estoque/", "/api/auditoria/"]:
            self.assertEqual(self.client.get(url).status_code, 401, url)

    def test_paginas_do_backoffice_voltam_ao_login(self):
        resposta = self.client.get("/backoffice/visao-geral.html")
        self.assertEqual(resposta.status_code, 302)
        self.assertTrue(resposta["Location"].startswith("/?proximo="))

    def test_perfil_sem_permissao_recebe_403(self):
        self.entrar(self.comprador)
        self.assertEqual(self.client.get("/api/funcionarios/").status_code, 403)
        self.assertEqual(self.client.get("/backoffice/funcionarios.html").status_code, 403)
        self.assertEqual(self.client.get("/api/auditoria/").status_code, 403)
        self.assertEqual(self.client.get("/api/produtos/").status_code, 200)

    def test_sem_login_nao_cria_usuario_admin(self):
        resposta = self.post("/api/funcionarios/salvar/", {"nome": "Invasor", "matricula": "HACK-1",
                                                           "perfil": "ADMIN", "pin": "8392"})
        self.assertEqual(resposta.status_code, 401)
        self.assertFalse(Usuario.objects.filter(codigo_matricula="HACK-1").exists())

    def test_gestor_nao_cadastra_funcionarios(self):
        self.entrar(self.gestor)
        resposta = self.post("/api/funcionarios/salvar/", {"nome": "X", "matricula": "X-1", "pin": "8392"})
        self.assertEqual(resposta.status_code, 403)


class CadastroDeUsuarioTeste(BaseTeste):
    def test_admin_cadastra_gestor_e_o_link_de_senha_e_enviado(self):
        self.entrar(self.admin)
        resposta = self.post("/api/funcionarios/salvar/", {
            "nome": "Nova Gestora", "matricula": "G-777", "perfil": "GESTOR",
            "email": "nova.gestora@teste.local", "pin": "8392", "setor_id": str(self.setor.id),
        })
        self.assertEqual(resposta.status_code, 200, resposta.content)
        self.assertTrue(resposta.json()["convite_enviado"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("/senha/nova/", mail.outbox[0].body)
        nova = Usuario.objects.get(codigo_matricula="G-777")
        self.assertFalse(nova.conta.has_usable_password())  # ninguém definiu a senha por ela

    def test_pin_obrigatorio_e_nao_obvio(self):
        self.entrar(self.admin)
        sem_pin = self.post("/api/funcionarios/salvar/", {"nome": "A", "matricula": "P-1"})
        pin_fraco = self.post("/api/funcionarios/salvar/", {"nome": "A", "matricula": "P-1", "pin": "1234"})
        self.assertEqual(sem_pin.status_code, 400)
        self.assertEqual(pin_fraco.status_code, 400)

    def test_perfil_administrativo_exige_email(self):
        self.entrar(self.admin)
        resposta = self.post("/api/funcionarios/salvar/", {"nome": "A", "matricula": "P-2", "perfil": "GESTOR",
                                                           "pin": "8392"})
        self.assertEqual(resposta.status_code, 400)

    def test_admin_nao_se_rebaixa_nem_se_inativa(self):
        self.entrar(self.admin)
        rebaixar = self.post("/api/funcionarios/salvar/", {
            "id": str(self.admin.id), "nome": self.admin.nome, "matricula": self.admin.codigo_matricula,
            "email": self.admin.email, "perfil": "GESTOR"})
        inativar = self.post(f"/api/funcionarios/{self.admin.id}/toggle/")
        self.assertEqual(rebaixar.status_code, 400)
        self.assertEqual(inativar.status_code, 400)

    def test_inativar_usuario_desativa_a_conta(self):
        self.entrar(self.admin)
        self.post(f"/api/funcionarios/{self.gestor.id}/toggle/")
        self.gestor.conta.refresh_from_db()
        self.assertFalse(self.gestor.conta.is_active)
        self.assertEqual(self.post("/api/login/", {"email": self.gestor.email, "senha": SENHA},
                                   Client()).status_code, 401)


class EsqueciSenhaTeste(BaseTeste):
    def test_fluxo_completo_de_redefinicao(self):
        resposta = self.client.post("/senha/esqueci/", {"email": self.gestor.email})
        self.assertRedirects(resposta, "/senha/enviada/")
        self.assertEqual(len(mail.outbox), 1)
        link = re.search(r"https?://[^/]+(/senha/nova/\S+/)", mail.outbox[0].body).group(1)

        pagina = self.client.get(link, follow=True)  # o Django troca o token da URL por um da sessão
        url_formulario = pagina.redirect_chain[-1][0]
        nova = "Outra-senha-forte-77"
        resposta = self.client.post(url_formulario, {"new_password1": nova, "new_password2": nova})
        self.assertRedirects(resposta, "/senha/concluida/")

        self.assertEqual(self.post("/api/login/", {"email": self.gestor.email, "senha": nova}, Client()).status_code, 200)
        self.assertTrue(RegistroAuditoria.objects.filter(acao="SENHA_DEFINIDA", usuario=self.gestor).exists())

    def test_email_desconhecido_nao_revela_nada(self):
        resposta = self.client.post("/senha/esqueci/", {"email": "ninguem@teste.local"})
        self.assertRedirects(resposta, "/senha/enviada/")
        self.assertEqual(len(mail.outbox), 0)


class TotemAutenticacaoTeste(BaseTeste):
    def test_identificar_mostra_so_o_primeiro_nome(self):
        dados = self.post("/api/totem/identificar/", {"matricula": "001245"}).json()
        self.assertEqual(dados["primeiro_nome"], "João")
        self.assertNotIn("cargo", dados)
        self.assertNotIn("setor", dados)

    def test_operacoes_do_totem_exigem_pin(self):
        self.assertEqual(self.client.get("/api/totem/produtos/").status_code, 401)
        self.assertEqual(self.client.get("/api/totem/solicitacoes/").status_code, 401)
        resposta = self.post("/api/totem/solicitar/", {"produto_id": str(self.luva.id)})
        self.assertEqual(resposta.status_code, 401)

    def test_pin_correto_abre_sessao_do_totem(self):
        self.entrar_no_totem()
        self.assertEqual(self.client.get("/api/totem/produtos/").status_code, 200)
        self.post("/api/totem/sair/")
        self.assertEqual(self.client.get("/api/totem/produtos/").status_code, 401)

    def test_pin_errado_bloqueia_apos_cinco_tentativas(self):
        for _ in range(5):
            self.assertEqual(self.post("/api/totem/login/", {"matricula": "001245", "pin": "0000"}).status_code, 401)
        self.assertEqual(self.post("/api/totem/login/", {"matricula": "001245", "pin": PIN}).status_code, 429)

    def test_pin_md5_antigo_e_convertido(self):
        self.colaborador.pin_hash = hashlib.md5(b"5193").hexdigest()
        self.colaborador.save()
        self.assertEqual(self.post("/api/totem/login/", {"matricula": "001245", "pin": "5193"}).status_code, 200)
        self.colaborador.refresh_from_db()
        self.assertTrue(self.colaborador.pin_hash.startswith("pbkdf2_"))
