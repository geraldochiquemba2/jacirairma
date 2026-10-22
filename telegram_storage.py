"""Envio de fotos para o Telegram atraves da Bot API (apenas biblioteca padrao).

Configuracao por variaveis de ambiente:
    TELEGRAM_BOT_TOKEN  token do bot (obrigatorio)
    TELEGRAM_CHAT_ID    id do chat de destino (obrigatorio)
    TELEGRAM_API_BASE   base da API (opcional, default https://api.telegram.org)
"""

import base64
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

BASE_PADRAO = 'https://api.telegram.org'
TEMPO_LIMITE = 60


def _config():
    token = (os.environ.get('TELEGRAM_BOT_TOKEN') or '').strip()
    chat_id = (os.environ.get('TELEGRAM_CHAT_ID') or '').strip()
    base = (os.environ.get('TELEGRAM_API_BASE') or BASE_PADRAO).strip().rstrip('/')
    if not base:
        base = BASE_PADRAO
    return token, chat_id, base


def configurado():
    """True quando o Telegram esta pronto a ser usado."""
    token, chat_id, _ = _config()
    return bool(token and chat_id)


def _limpar_nome(nome):
    nome = (nome or '').strip().replace('\\', '_').replace('/', '_')
    nome = nome.replace('"', '').replace('\r', '').replace('\n', '')
    if not nome:
        nome = 'foto.jpg'
    return nome


def _decodificar(dados_base64):
    texto = (dados_base64 or '').strip()
    if texto.startswith('data:') and ',' in texto:
        texto = texto.split(',', 1)[1]
    try:
        return base64.b64decode(texto + '=' * (-len(texto) % 4), validate=False)
    except (ValueError, TypeError):
        return None


def _construir_multipart(campos, ficheiro_nome, ficheiro_bytes):
    limite = '----AntoniaDecoracao' + secrets.token_hex(16)
    partes = []
    for nome, valor in campos:
        partes.append(
            f'--{limite}\r\nContent-Disposition: form-data; name="{nome}"\r\n\r\n{valor}\r\n'
        )
    partes.append(
        f'--{limite}\r\n'
        f'Content-Disposition: form-data; name="photo"; filename="{ficheiro_nome}"\r\n'
        'Content-Type: application/octet-stream\r\n\r\n'
    )
    cauda = f'\r\n--{limite}--\r\n'
    corpo = ''.join(partes).encode('utf-8') + ficheiro_bytes + cauda.encode('utf-8')
    return corpo, f'multipart/form-data; boundary={limite}'


def _token_disponivel():
    token, _, _ = _config()
    return token


def obter_ficheiro(file_id):
    """Descarrega um ficheiro guardado no Telegram pelo seu file_id.

    Devolve {"dados": bytes, "tipo": mime} em caso de sucesso ou
    {"erro": "mensagem"} quando nao e possivel obter o ficheiro.
    """
    token, _, base = _config()
    if not token:
        return {'erro': 'Telegram nao configurado (defina TELEGRAM_BOT_TOKEN).'}

    identificador = (file_id or '').strip()
    if not identificador:
        return {'erro': 'file_id invalido.'}

    try:
        url_info = f'{base}/bot{token}/getFile?file_id={urllib.parse.quote(identificador, safe="")}'
        pedido_info = urllib.request.Request(url_info, method='GET')
        with urllib.request.urlopen(pedido_info, timeout=TEMPO_LIMITE) as resposta_info:
            info = json.loads(resposta_info.read().decode('utf-8'))
        caminho = ((info or {}).get('result') or {}).get('file_path') or ''
        if not caminho:
            return {'erro': 'Ficheiro nao encontrado no Telegram.'}
        url = f'{base}/file/bot{token}/{urllib.parse.quote(caminho, safe="/")}'
        pedido = urllib.request.Request(url, method='GET')
        with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:
            dados = resposta.read()
            tipo = (resposta.headers.get('Content-Type') or 'image/jpeg').split(';')[0].strip()
    except urllib.error.HTTPError as erro:
        return {'erro': f'Telegram respondeu com erro {erro.code} ao obter o ficheiro.'}
    except Exception as erro:
        return {'erro': f'Falha ao obter o ficheiro do Telegram: {erro}'}

    if not dados:
        return {'erro': 'Ficheiro vazio.'}

    return {'dados': dados, 'tipo': tipo or 'image/jpeg'}


def enviar_foto(dados_base64, nome='foto.jpg'):
    """Envia uma foto (base64) para o chat configurado.

    Devolve {"file_id":..., "message_id":..., "chat_id":...} em caso de sucesso
    ou {"erro": "mensagem"} quando nao e possivel enviar.
    """
    token, chat_id, base = _config()
    if not token or not chat_id:
        return {'erro': 'Telegram nao configurado (defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID).'}

    ficheiro_nome = _limpar_nome(nome)
    ficheiro_bytes = _decodificar(dados_base64)
    if ficheiro_bytes is None:
        return {'erro': 'Ficheiro base64 invalido.'}
    if not ficheiro_bytes:
        return {'erro': 'Ficheiro vazio.'}

    corpo, tipo = _construir_multipart(
        [('chat_id', chat_id), ('caption', ficheiro_nome)],
        ficheiro_nome,
        ficheiro_bytes,
    )

    url = f'{base}/bot{token}/sendPhoto'
    pedido = urllib.request.Request(
        url,
        data=corpo,
        headers={'Content-Type': tipo, 'Content-Length': str(len(corpo))},
        method='POST',
    )

    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resposta:
            texto = resposta.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as erro:
        detalhe = ''
        try:
            detalhe = erro.read().decode('utf-8', 'replace')[:300]
        except Exception:
            detalhe = ''
        return {'erro': f'Telegram respondeu com erro {erro.code}. {detalhe}'.strip()}
    except Exception as erro:
        return {'erro': f'Falha ao contactar o Telegram: {erro}'}

    try:
        dados = json.loads(texto)
    except ValueError:
        return {'erro': 'Resposta invalida do Telegram.'}

    if not isinstance(dados, dict) or not dados.get('ok'):
        descricao = ''
        if isinstance(dados, dict):
            descricao = dados.get('description') or ''
        return {'erro': descricao or 'O Telegram recusou o envio.'}

    resultado = dados.get('result') or {}
    fotos = resultado.get('photo') or []
    file_id = ''
    if fotos:
        file_id = fotos[-1].get('file_id') or ''

    chat = resultado.get('chat') or {}
    return {
        'file_id': file_id,
        'message_id': resultado.get('message_id'),
        'chat_id': chat.get('id', chat_id),
    }
