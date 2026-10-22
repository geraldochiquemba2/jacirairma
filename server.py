import http.server
import socketserver
import os
import sys
import json
import smtplib
import secrets
import threading
import time
import urllib.parse
from email.message import EmailMessage
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
if DIR not in sys.path:
    sys.path.insert(0, DIR)

import telegram_storage

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
PASTA_ENVIO = os.path.join(DIR, 'envios')

# Configuracao SMTP (variaveis de ambiente):
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_TO, MAIL_DE
SMTP_HOST = os.environ.get('SMTP_HOST', '')
SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')
MAIL_TO = os.environ.get('MAIL_TO', 'contacto@antoniadecoracao.com')
MAIL_DE = os.environ.get('MAIL_DE', 'noreply@antoniadecoracao.com')

# ---------------------------------------------------------------------------
# Painel de administracao (API /api/admin/)
# Credenciais fixas - altere aqui se for preciso.
ADMIN_LOGIN = '999999999'
ADMIN_SENHA = '923872439'
# Validade das sessoes (tokens) em segundos (8 horas)
ADMIN_TOKEN_VALIDADE = 8 * 60 * 60
# Tokens validos em memoria: {token: instante de expiracao}
ADMIN_TOKENS = {}

# Pasta onde ficam os ficheiros JSON geridos pelo painel
ADMIN_DATA = os.path.join(DIR, 'admin', 'data')

# Definicao dos tipos de conteudo geridos
TIPOS = {
    'categorias': {
        'ficheiro': 'categorias.json',
        'prefixo': 'c',
        'campos': ('nome', 'icone', 'descricao'),
        'obrigatorios': ('nome',),
    },
    'carousel': {
        'ficheiro': 'carousel.json',
        'prefixo': 'i',
        'campos': ('src', 'legenda', 'telegram_file_id'),
        'obrigatorios': ('src',),
    },
    'produtos': {
        'ficheiro': 'produtos.json',
        'prefixo': 'p',
        'campos': ('nome', 'preco', 'descricao', 'categoria', 'src', 'telegram_file_id'),
        'obrigatorios': ('nome', 'preco'),
    },
}

# Trava para proteger a leitura/escrita dos ficheiros JSON
ADMIN_LOCK = threading.Lock()


def resposta_json(handler, estado, mensagem, codigo=200):
    corpo = json.dumps({'sendstatus': estado, 'message': mensagem}).encode('utf-8')
    handler.send_response(codigo)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(corpo)))
    handler.end_headers()
    handler.wfile.write(corpo)


def resposta_api(handler, dados, codigo=200):
    """Resposta JSON da API (sempre com a chave "ok")."""
    corpo = json.dumps(dados, ensure_ascii=False).encode('utf-8')
    handler.send_response(codigo)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(corpo)))
    handler.end_headers()
    handler.wfile.write(corpo)


def resposta_erro(handler, mensagem, codigo=400):
    return resposta_api(handler, {'ok': False, 'erro': mensagem}, codigo)


def guardar(ficheiro, texto):
    os.makedirs(PASTA_ENVIO, exist_ok=True)
    with open(os.path.join(PASTA_ENVIO, ficheiro), 'a', encoding='utf-8') as f:
        f.write(texto + '\n')


def enviar_email(nome, email, mensagem):
    corpo = EmailMessage()
    corpo['From'] = MAIL_DE
    corpo['To'] = MAIL_TO
    corpo['Reply-To'] = email
    corpo['Subject'] = 'Novo contacto pelo site - Antônia Decoração'
    corpo.set_content(f'Nome: {nome}\nEmail: {email}\n\nMensagem:\n{mensagem}\n')

    if not SMTP_HOST:
        guardar('mensagens.txt', '=' * 60 + f'\n{datetime.now():%Y-%m-%d %H:%M:%S}\n'
                                          f'Nome: {nome}\nEmail: {email}\n\n{mensagem}')
        return False

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
        s.starttls()
        if SMTP_USER and SMTP_PASS:
            s.login(SMTP_USER, SMTP_PASS)
        s.send_message(corpo)
    return True


# ---------------------------------------------------------------------------
# Utilitarios da API de administracao
# ---------------------------------------------------------------------------

def texto(valor):
    if valor is None:
        return ''
    if isinstance(valor, bool):
        return 'true' if valor else 'false'
    if isinstance(valor, (int, float)):
        return str(valor)
    return str(valor).strip()


def valor_posicao(valor, padrao=0):
    try:
        return int(valor)
    except (TypeError, ValueError):
        return padrao


def caminho_dados(ficheiro):
    return os.path.join(ADMIN_DATA, ficheiro)


def guardar_lista(ficheiro, dados):
    """Grava a lista de forma atomica (ficheiro temporario + os.replace)."""
    os.makedirs(ADMIN_DATA, exist_ok=True)
    caminho = caminho_dados(ficheiro)
    temporario = caminho + '.tmp'
    with open(temporario, 'w', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(temporario, caminho)


def carregar_lista(ficheiro):
    """Le a lista do disco; cria o ficheiro se ainda nao existir."""
    os.makedirs(ADMIN_DATA, exist_ok=True)
    caminho = caminho_dados(ficheiro)
    if not os.path.exists(caminho):
        guardar_lista(ficheiro, [])
        return []
    try:
        with open(caminho, encoding='utf-8') as f:
            dados = json.load(f)
    except (OSError, ValueError):
        return []
    return dados if isinstance(dados, list) else []


def ordenar_lista(lista):
    """Ordena por posicao (crescente), mantendo a ordem original em caso de empate."""
    return sorted(lista, key=lambda item: valor_posicao(item.get('posicao'), 0))


def proxima_posicao(lista):
    maior = 0
    for item in lista:
        maior = max(maior, valor_posicao(item.get('posicao'), 0))
    return maior + 1


def gerar_id(tipo, lista):
    prefixo = TIPOS[tipo]['prefixo']
    usados = {texto(item.get('id')) for item in lista}
    numero = 1
    while f'{prefixo}{numero}' in usados:
        numero += 1
    return f'{prefixo}{numero}'


def criar_token():
    token = secrets.token_hex(24)
    ADMIN_TOKENS[token] = time.time() + ADMIN_TOKEN_VALIDADE
    return token


def token_valido(handler):
    token = texto(handler.headers.get('X-Admin-Token'))
    if not token:
        return False
    expira = ADMIN_TOKENS.get(token)
    if expira is None:
        return False
    if expira < time.time():
        ADMIN_TOKENS.pop(token, None)
        return False
    return True


class SemCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass

    # -- Utilitarios de rotas ------------------------------------------------

    def caminho_api(self):
        caminho = urllib.parse.urlparse(self.path).path
        if len(caminho) > 1:
            caminho = caminho.rstrip('/')
        return caminho

    def query(self):
        return urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

    def ler_json(self):
        """Le um corpo JSON. Devolve None quando o corpo e invalido."""
        try:
            tamanho = int(self.headers.get('Content-Length') or 0)
        except (TypeError, ValueError):
            tamanho = 0
        bruto = self.rfile.read(tamanho) if tamanho > 0 else b''
        if not bruto.strip():
            return {}
        try:
            dados = json.loads(bruto.decode('utf-8', 'replace'))
        except ValueError:
            return None
        return dados if isinstance(dados, dict) else None

    def exigir_token(self):
        if token_valido(self):
            return True
        resposta_erro(self, 'Sessão inválida ou expirada. Inicie sessão novamente.', 401)
        return False

    # -- Pedidos --------------------------------------------------------------

    def do_POST(self):
        caminho = self.path.split('?')[0]

        if caminho.endswith('/php/contacto.php'):
            return self.tratar_contacto()
        if caminho.endswith('/php/subscribe.php'):
            return self.tratar_subscricao()

        rota = self.caminho_api()
        if rota.startswith('/api/admin/'):
            return self.tratar_admin_post(rota)
        if rota.startswith('/api/public/'):
            return resposta_erro(self, 'Metodo nao permitido.', 405)

        self.send_error(404, 'Endpoint nao encontrado')
        return None

    def do_GET(self):
        rota = self.caminho_api()

        if rota.startswith('/api/public/'):
            return self.tratar_publico(rota)
        if rota.startswith('/api/admin/'):
            if not self.exigir_token():
                return None
            return self.tratar_admin_get(rota)

        return super().do_GET()

    def do_DELETE(self):
        rota = self.caminho_api()
        if rota.startswith('/api/admin/'):
            if not self.exigir_token():
                return None
            return self.tratar_admin_delete(rota)
        if rota.startswith('/api/public/'):
            return resposta_erro(self, 'Metodo nao permitido.', 405)

        self.send_error(404, 'Endpoint nao encontrado')
        return None

    # -- Contacto e subscricao (inalterados) ----------------------------------

    def ler_corpo(self):
        tamanho = int(self.headers.get('Content-Length', 0))
        bruto = self.rfile.read(tamanho).decode('utf-8', 'replace')
        return {k: v[0] for k, v in urllib.parse.parse_qs(bruto).items()}

    def tratar_contacto(self):
        dados = self.ler_corpo()
        nome = (dados.get('name') or '').strip()
        email = (dados.get('email') or '').strip()
        mensagem = (dados.get('message') or '').strip()

        if not nome or not email or not mensagem:
            return resposta_json(self, 0, '<div class="alert alert-danger"><strong>Erro:</strong> Preencha todos os campos.</div>', 400)
        if '@' not in email or '.' not in email.split('@')[-1]:
            return resposta_json(self, 0, '<div class="alert alert-danger"><strong>Erro:</strong> Email inválido.</div>', 400)
        if '\n' in nome or '\r' in nome or '\n' in email or '\r' in email:
            return resposta_json(self, 0, '<div class="alert alert-danger"><strong>Erro:</strong> Dados inválidos.</div>', 400)

        try:
            enviado = enviar_email(nome, email, mensagem)
        except Exception as erro:
            print('Falha no envio:', erro)
            return resposta_json(self, 0, '<div class="alert alert-danger"><strong>Erro:</strong> Não foi possível enviar a mensagem. Tente o telefone +244 933 354 976.</div>', 500)

        if enviado:
            return resposta_json(self, 1, '<div class="alert alert-success"><strong>Sucesso!</strong> A sua mensagem foi enviada. Entraremos em contacto em breve.</div>')

        return resposta_json(self, 1, '<div class="alert alert-success"><strong>Sucesso!</strong> A sua mensagem foi registada. Entraremos em contacto em breve.</div>')

    def tratar_subscricao(self):
        dados = self.ler_corpo()
        email = (dados.get('email') or '').strip()

        if not email or '@' not in email:
            return resposta_json(self, 0, '<div class="alert alert-danger subscription-error" role="alert"><strong>Error:</strong> Email inválido.</div>', 400)

        guardar('inscritos.txt', f'{datetime.now():%Y-%m-%d %H:%M:%S}  {email}')
        return resposta_json(self, 1, '<div class="alert alert-success subscription-success" role="alert"><strong>Success!</strong> Subscrição registada.</div>')

    # -- API de administracao -------------------------------------------------

    def tratar_admin_post(self, rota):
        if rota == '/api/admin/login':
            return self.tratar_login()

        if not self.exigir_token():
            return None

        if rota == '/api/admin/categorias':
            return self.tratar_guardar('categorias')
        if rota == '/api/admin/carousel':
            return self.tratar_guardar('carousel')
        if rota == '/api/admin/produtos':
            return self.tratar_guardar('produtos')
        if rota == '/api/admin/ordem':
            return self.tratar_ordem()
        if rota == '/api/admin/telegram':
            return self.tratar_telegram()

        return resposta_erro(self, 'Endpoint nao encontrado.', 404)

    def tratar_admin_get(self, rota):
        if rota == '/api/admin/estado':
            return self.tratar_estado()
        if rota in ('/api/admin/categorias', '/api/admin/carousel', '/api/admin/produtos'):
            tipo = rota.rsplit('/', 1)[1]
            with ADMIN_LOCK:
                dados = ordenar_lista(carregar_lista(TIPOS[tipo]['ficheiro']))
            return resposta_api(self, {'ok': True, 'dados': dados})

        return resposta_erro(self, 'Endpoint nao encontrado.', 404)

    def tratar_admin_delete(self, rota):
        partes = rota.rsplit('/', 1)
        if len(partes) != 2 or partes[1] not in TIPOS:
            return resposta_erro(self, 'Endpoint nao encontrado.', 404)

        tipo = partes[1]
        id_alvo = texto((self.query().get('id') or [''])[0])
        if not id_alvo:
            return resposta_erro(self, 'Parametro "id" em falta.', 400)

        with ADMIN_LOCK:
            lista = carregar_lista(TIPOS[tipo]['ficheiro'])
            restantes = [item for item in lista if texto(item.get('id')) != id_alvo]
            if len(restantes) == len(lista):
                return resposta_erro(self, 'Registo nao encontrado.', 404)
            guardar_lista(TIPOS[tipo]['ficheiro'], restantes)

        return resposta_api(self, {'ok': True})

    def tratar_login(self):
        dados = self.ler_json()
        if dados is None:
            return resposta_erro(self, 'Dados invalidos.', 400)

        login = texto(dados.get('login'))
        senha = texto(dados.get('senha'))
        if not login or not senha:
            return resposta_erro(self, 'Credenciais inválidas.', 401)
        if not secrets.compare_digest(login, ADMIN_LOGIN) or not secrets.compare_digest(senha, ADMIN_SENHA):
            return resposta_erro(self, 'Credenciais inválidas.', 401)

        return resposta_api(self, {'ok': True, 'token': criar_token()})

    def tratar_estado(self):
        with ADMIN_LOCK:
            contagens = {
                'categorias': len(carregar_lista(TIPOS['categorias']['ficheiro'])),
                'carousel': len(carregar_lista(TIPOS['carousel']['ficheiro'])),
                'produtos': len(carregar_lista(TIPOS['produtos']['ficheiro'])),
            }

        return resposta_api(self, {
            'ok': True,
            'telegram': {'configurado': telegram_storage.configurado()},
            'contagens': contagens,
        })

    def tratar_guardar(self, tipo):
        dados = self.ler_json()
        if dados is None:
            return resposta_erro(self, 'Dados invalidos.', 400)

        definicao = TIPOS[tipo]
        registo = {campo: texto(dados.get(campo)) for campo in definicao['campos']}

        for campo in definicao['obrigatorios']:
            if not registo.get(campo):
                return resposta_erro(self, f'O campo "{campo}" é obrigatório.', 400)

        id_enviado = texto(dados.get('id'))

        with ADMIN_LOCK:
            lista = carregar_lista(definicao['ficheiro'])

            if id_enviado:
                indice = next((i for i, item in enumerate(lista) if texto(item.get('id')) == id_enviado), None)
                if indice is None:
                    return resposta_erro(self, 'Registo nao encontrado.', 404)
                registo['id'] = id_enviado
                if dados.get('posicao') is None:
                    registo['posicao'] = valor_posicao(lista[indice].get('posicao'), proxima_posicao(lista))
                else:
                    registo['posicao'] = valor_posicao(dados.get('posicao'), proxima_posicao(lista))
                lista[indice] = registo
            else:
                registo['id'] = gerar_id(tipo, lista)
                if dados.get('posicao') is None:
                    registo['posicao'] = proxima_posicao(lista)
                else:
                    registo['posicao'] = valor_posicao(dados.get('posicao'), proxima_posicao(lista))
                lista.append(registo)

            guardar_lista(definicao['ficheiro'], lista)

        return resposta_api(self, {'ok': True, 'dados': registo})

    def tratar_ordem(self):
        dados = self.ler_json()
        if dados is None:
            return resposta_erro(self, 'Dados invalidos.', 400)

        tipo = texto(dados.get('tipo'))
        if tipo not in TIPOS:
            return resposta_erro(self, 'Tipo invalido. Use categorias, carousel ou produtos.', 400)

        ordem = dados.get('ordem')
        if not isinstance(ordem, list):
            return resposta_erro(self, 'O campo "ordem" tem de ser uma lista de ids.', 400)

        with ADMIN_LOCK:
            lista = carregar_lista(TIPOS[tipo]['ficheiro'])
            por_id = {texto(item.get('id')): item for item in lista}

            nova = []
            for id_item in ordem:
                item = por_id.get(texto(id_item))
                if item is not None and not any(x is item for x in nova):
                    nova.append(item)
            for item in lista:
                if not any(x is item for x in nova):
                    nova.append(item)

            for indice, item in enumerate(nova, start=1):
                item['posicao'] = indice

            guardar_lista(TIPOS[tipo]['ficheiro'], nova)

        return resposta_api(self, {'ok': True})

    def tratar_telegram(self):
        dados = self.ler_json()
        if dados is None:
            return resposta_erro(self, 'Dados invalidos.', 400)

        ficheiro = texto(dados.get('ficheiro'))
        nome = texto(dados.get('nome')) or 'foto.jpg'
        if not ficheiro:
            return resposta_erro(self, 'O campo "ficheiro" é obrigatório.', 400)

        resultado = telegram_storage.enviar_foto(ficheiro, nome)
        if 'erro' in resultado:
            return resposta_erro(self, resultado['erro'], 500)

        return resposta_api(self, {
            'ok': True,
            'telegram': {
                'file_id': resultado.get('file_id', ''),
                'message_id': resultado.get('message_id'),
                'chat_id': resultado.get('chat_id'),
            },
        })

    # -- API publica (sem token) ---------------------------------------------

    def tratar_publico(self, rota):
        if rota.startswith('/api/public/imagem/'):
            return self.tratar_imagem(rota[len('/api/public/imagem/'):])

        tipo = rota.rsplit('/', 1)[1]
        if tipo not in TIPOS:
            return resposta_erro(self, 'Endpoint nao encontrado.', 404)

        with ADMIN_LOCK:
            dados = ordenar_lista(carregar_lista(TIPOS[tipo]['ficheiro']))

        return resposta_api(self, {'ok': True, 'dados': dados})

    def tratar_imagem(self, file_id):
        """Proxy das fotos guardadas no Telegram (file_id -> binario)."""
        file_id = urllib.parse.unquote(file_id or '').strip()

        if not file_id:
            return resposta_erro(self, 'file_id em falta.', 400)

        resultado = telegram_storage.obter_ficheiro(file_id)

        if 'erro' in resultado:
            return resposta_erro(self, resultado['erro'], 404)

        dados = resultado['dados']
        self.send_response(200)
        self.send_header('Content-Type', resultado.get('tipo') or 'image/jpeg')
        self.send_header('Content-Length', str(len(dados)))
        self.send_header('Cache-Control', 'public, max-age=86400')
        self.end_headers()
        self.wfile.write(dados)
        return None


class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    with ThreadedServer(("", PORT), SemCache) as httpd:
        print(f"Servidor em http://localhost:{PORT} (sem cache)")
        if SMTP_HOST:
            print(f"SMTP: {SMTP_HOST}:{SMTP_PORT} -> {MAIL_TO}")
        else:
            print("SMTP nao configurado: as mensagens ficam guardadas na pasta 'envios'")
        print(f"Painel de administracao: http://localhost:{PORT}/admin.html")
        httpd.serve_forever()
