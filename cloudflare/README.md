# Antônia Decoração — Notas operacionais da Cloudflare

Resumo curto para quem for manter o site em produção.
O guia completo está em [`../DEPLOY.md`](../DEPLOY.md).

## Componentes

| Recurso | Nome | Onde |
| --- | --- | --- |
| Projeto Pages | `antoniadecoracao` | `https://antoniadecoracao.pages.dev` |
| Namespace KV | `ADMIN_DATA` | binding `ADMIN_DATA` |
| API de administração | `functions/api/admin/[[path]].js` | `/api/admin/*` |
| API pública | `functions/api/public/[[path]].js` | `/api/public/*` |
| Cabeçalhos e cache | `_headers` | ficheiros estáticos |
| Redirecionamentos | `_redirects` | `/inicio`, `/admin`, ... (nunca `/api/*`) |

## Chaves do namespace KV

| Chave | Tipo | Conteúdo |
| --- | --- | --- |
| `categorias` | Array JSON | `[{ id, nome, icone, posicao }]` |
| `carousel` | Array JSON | `[{ id, src, legenda, telegram_file_id, posicao }]` |
| `produtos` | Array JSON | `[{ id, nome, preco, descricao, categoria, src, telegram_file_id, posicao }]` |

Chave inexistente = lista vazia. A KV é eventualmente consistente: uma
escrita pode demorar até ~60 s a chegar a todos os pontos da Cloudflare.

```bash
npx wrangler kv key list   --binding=ADMIN_DATA --namespace-id=SEU_ID
npx wrangler kv key get    --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias"
npx wrangler kv key put    --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias" --path categorias.json
```

## Variáveis de ambiente e segredos

| Nome | Segredo? | Onde é usado | Observações |
| --- | --- | --- | --- |
| `ADMIN_SECRET` | Sim | Assinatura HMAC dos tokens | **Obrigatório.** Rotação invalida as sessões abertas |
| `ADMIN_LOGIN` | Não | Login do painel | Omissão = `999999999` |
| `ADMIN_SENHA` | Sim | Palavra-passe do painel | Omissão = `923872439` |
| `TELEGRAM_BOT_TOKEN` | Sim | Envio de imagens | Obrigatório para `/api/admin/telegram` |
| `TELEGRAM_CHAT_ID` | Sim | Destino no Telegram | Chat/canal de destino |
| `TELEGRAM_API_BASE` | Não | Base da API do Telegram | Omissão = `https://api.telegram.org` |

```bash
npx wrangler pages secret put ADMIN_SECRET       --project-name antoniadecoracao
npx wrangler pages secret put ADMIN_SENHA        --project-name antoniadecoracao
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name antoniadecoracao
npx wrangler pages secret put TELEGRAM_CHAT_ID   --project-name antoniadecoracao
```

Valores em texto simples no `wrangler.toml` (`[vars]`) só para o que não for
sensível. As senhas e tokens reais nunca devem ser versionados.

## Comandos

```bash
# publicar
npx wrangler pages deploy . --project-name antoniadecoracao

# publicar uma pré-visualização
npx wrangler pages deploy . --project-name antoniadecoracao --branch=testes

# testar localmente (com .dev.vars e o binding KV)
npx wrangler pages dev . --kv=ADMIN_DATA

# ver os segredos configurados
npx wrangler pages secret list --project-name antoniadecoracao
```

## Rotação de segredos

1. `wrangler pages secret put <NOME>` para o novo valor.
2. `wrangler pages deploy . --project-name antoniadecoracao` (as variáveis só
   são lidas no arranque do código).
3. Testar o login do painel.
4. No caso do `TELEGRAM_BOT_TOKEN`, gerar o novo token no @BotFather
   (`/token`) e revogar o antigo.

Recomendação: rodar `ADMIN_SECRET` de 3 em 3 meses, o token do Telegram se
alguém sair da equipa.

## Cópias de segurança

Os dados do painel só existem na KV. Guarde uma cópia após alterações
relevantes:

```bash
mkdir -p backup-kv
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias" --out-file backup-kv/categorias.json
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "carousel"   --out-file backup-kv/carousel.json
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "produtos"   --out-file backup-kv/produtos.json
```

Para restaurar, use `npx wrangler kv key put ... --path <ficheiro>`.

## Regras de manutenção

- Nunca adicionar regras `/api/*` ao `_redirects`: a API tem de devolver JSON.
- As regras do `_headers` só afetam ficheiros estáticos; as respostas da API
  enviam os seus próprios cabeçalhos (ver `functions/_middleware.js`).
- Não alterar o nome do binding `ADMIN_DATA` sem atualizar
  `functions/api/admin/[[path]].js` e `functions/api/public/[[path]].js`.
- Os tokens de sessão duram 8 horas; o painel deve voltar a pedir o login
  quando a API responder `401`.
