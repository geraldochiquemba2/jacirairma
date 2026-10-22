# Publicação do site "Antônia Decoração" na Cloudflare

Guia completo, passo a passo, para publicar o site em **Cloudflare Pages** com:

- as páginas estáticas (HTML, CSS, JS, imagens e vídeos);
- uma **Pages Function** para a API de administração (`/api/admin/*`);
- uma **Pages Function** para a API pública (`/api/public/*`);
- **Workers KV** como armazenamento dos dados do painel de administração;
- envio de imagens para o **Telegram** a partir do servidor.

> O servidor Python local (`server.py`) **não é executado** na Cloudflare. A mesma
> API foi reimplementada em JavaScript nas Pages Functions, mantendo exatamente
> o mesmo contrato, para que o painel de administração funcione nos dois
> ambientes sem qualquer alteração.

---

## 1. Resumo da arquitetura

| Peça | Local (desenvolvimento) | Cloudflare |
| --- | --- | --- |
| Páginas | `index.html`, `explorar.html`, `sobre.html`, `contacto.html` | Servidas pelo CDN da Cloudflare |
| API de administração | `server.py` (Python) | `functions/api/admin/[[path]].js` |
| API pública | `server.py` (Python) | `functions/api/public/[[path]].js` |
| Armazenamento | Ficheiros JSON/disco local | Workers KV (binding `ADMIN_DATA`) |
| Envio de fotos | Telegram Bot API | Telegram Bot API (a partir do Worker) |
| Sessão do painel | Token devolvido no login | Token HMAC-SHA256 (`ADMIN_SECRET`), validade de 8 horas |

---

## 2. Pré-requisitos

1. Uma conta na Cloudflare (gratuita): <https://dash.cloudflare.com/sign-up>
2. [Node.js](https://nodejs.org/) versão 18 ou superior (verificar com `node -v`).
3. O Wrangler (CLI da Cloudflare), instalado globalmente ouvia `npx`:

   ```bash
   npm install -g wrangler
   # ou, sem instalar globalmente:
   npx wrangler --version
   ```

4. O código do site (esta pasta) com os ficheiros `wrangler.toml`, `_headers`,
   `_redirects` e a pasta `functions/`.

---

## 3. Criar a conta e o projeto na Cloudflare

1. Inicie sessão em <https://dash.cloudflare.com>.
2. No menu lateral escolha **Workers & Pages** → **Create application** (Criar aplicação).
3. Escolha **Pages** → **Connect to Git** (se pretende publicar a partir do
   GitHub/GitLab — veja o passo 9) **ou** **Direct Upload** (se pretende
   publicar com o terminal — veja o passo 8).
4. Nome do projeto: `antoniadecoracao` (tem de coincidir com o `name` do
   `wrangler.toml`).
5. A Cloudflare atribui um endereço do tipo `https://antoniadecoracao.pages.dev`.
   Depois pode associar o domínio próprio (`www.antoniadecoracao.com`) em
   **Custom domains**.

---

## 4. Criar o namespace KV e associar o binding

O painel de administração guarda três listas (categorias, carousel e produtos)
em **Workers KV**.

### 4.1 Criar o namespace

Na Cloudflare, a forma mais simples é pelo terminal (com a sessão iniciada):

```bash
npx wrangler login
npx wrangler kv namespace create ADMIN_DATA
```

O comando devolve o ID do namespace criado, por exemplo:

```
[[kv_namespaces]]
binding = "ADMIN_DATA"
id = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

Ou pelo painel: **Workers & Pages** → **KV** → **Create namespace** → nome `ADMIN_DATA`.

### 4.2 Ligar o binding ao projeto

**Opção A — pelo ficheiro `wrangler.toml` (recomendado):**
edite o ficheiro `wrangler.toml` e substitua o id de exemplo pelo id real:

```toml
[[kv_namespaces]]
binding = "ADMIN_DATA"
id = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
```

**Opção B — pelo painel:**
**Workers & Pages** → projeto `antoniadecoracao` → **Settings** → **Bindings**
→ **Add** → **KV namespace** → *Variable name*: `ADMIN_DATA` → escolher o
namespace criado. Depois é necessário fazer um novo deploy para a ligação
ficar ativa.

> O nome do binding tem de ser exatamente `ADMIN_DATA`, tal como definido em
> `functions/api/admin/[[path]].js`.

### 4.3 Chaves usadas dentro do namespace

| Chave | Conteúdo |
| --- | --- |
| `categorias` | Array JSON: `[{ "id": 1, "nome": "...", "icone": "...", "posicao": 0 }]` |
| `carousel` | Array JSON: `[{ "id": 1, "src": "...", "legenda": "...", "telegram_file_id": "...", "posicao": 0 }]` |
| `produtos` | Array JSON: `[{ "id": 1, "nome": "...", "preco": "...", "descricao": "...", "categoria": "...", "src": "...", "telegram_file_id": "...", "posicao": 0 }]` |

Se uma chave ainda não existir, a API devolve uma lista vazia (`[]`) — o
painel começa simplesmente sem conteúdo. Para ver e fazer cópias de segurança:

```bash
npx wrangler kv key list --binding=ADMIN_DATA --namespace-id=SEU_ID
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias"
```

---

## 5. Definir os segredos e as variáveis de ambiente

Valores **privados** nunca devem ser escritos no `wrangler.toml` (ficheiro
versionado no Git). Defina-os como segredos:

```bash
# Segredo que assina os tokens de sessão (obrigatório)
npx wrangler pages secret put ADMIN_SECRET --project-name antoniadecoracao

# Credenciais do painel de administração
npx wrangler pages secret put ADMIN_LOGIN --project-name antoniadecoracao
npx wrangler pages secret put ADMIN_SENHA --project-name antoniadecoracao

# Telegram
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name antoniadecoracao
npx wrangler pages secret put TELEGRAM_CHAT_ID --project-name antoniadecoracao
```

O terminal pede o valor e grava-o cifrado (nunca é mostrado novamente). O
comando `wrangler pages secret put` aplica-se ao ambiente **Production**; para
as pre-visualizações use `--env preview` ou defina os segredos no painel
(**Settings** → **Variables and Secrets** → **Add** → *Encrypt*).

Variáveis sem segredos (podem ficar no `wrangler.toml`, em `[vars]`):

| Variável | Valor | Finalidade |
| --- | --- | --- |
| `ADMIN_LOGIN` | `999999999` | Utilizador do painel |
| `ADMIN_SENHA` | `923872439` | Palavra-passe do painel |
| `TELEGRAM_API_BASE` | `https://api.telegram.org` | Base da API do Telegram (alterável para um proxy) |
| `ADMIN_SECRET` | *(segredo)* | Chave HMAC para assinar os tokens (8 horas de validade) |
| `TELEGRAM_BOT_TOKEN` | *(segredo)* | Token do bot do Telegram |
| `TELEGRAM_CHAT_ID` | *(segredo)* | Id do chat/canal de destino |

### Como funciona o login

O endpoint `POST /api/admin/login` aceita o par **login/senha** configurado em
`ADMIN_LOGIN` e `ADMIN_SENHA`. Para manter a paridade total com o servidor
Python local, se essas variáveis não estiverem definidas a API usa os valores
por omissão `999999999` / `923872439`.

Como medida adicional, o valor de `ADMIN_SECRET` também é aceite como
palavra-passe (com o mesmo `ADMIN_LOGIN`). Assim, mesmo que alguém leia o
`wrangler.toml` do repositório, não consegue entrar no painel.

Ao iniciar sessão com sucesso, a API devolve um token HMAC-SHA256 com
validade de **8 horas**:

```json
{ "ok": true, "token": "eyJleHAiOjE3MDAwMDAwMDB9.xxxxx" }
```

Todas as restantes chamadas do painel enviam esse valor no cabeçalho:

```
X-Admin-Token: eyJleHAiOjE3MDAwMDAwMDB9.xxxxx
```

Se o token estiver expirado ou adulterado, a API responde
`401` com `{ "ok": false, "erro": "Sessão inválida ou expirada." }`.

---

## 6. Criar o bot do Telegram (BotFather)

1. Abra o Telegram e comece uma conversa com **@BotFather**
   (<https://t.me/BotFather>).
2. Envie `/newbot` e responda às perguntas:
   - *name* do bot (ex.: `Antônia Decoração Bot`);
   - *username* do bot, terminado em `bot` (ex.: `antonia_decoracao_bot`).
3. O BotFather devolve o **token** do bot (ex.: `8123456789:AAH...`). É este
   valor que vai para `TELEGRAM_BOT_TOKEN` (segredo, nunca em texto simples no
   repositório).
4. **Obter o chat_id**:
   - Envie uma mensagem (por exemplo `/start`) para o bot, a partir da conta
     que vai receber as imagens; **ou**
   - se usar um canal, adicione o bot ao canal, publique uma mensagem e
     consulte o id.
   - O `chat_id` da pessoa é (habitualmente) o mesmo número do seu Telegram,
     começando por `4` (por exemplo `481516234`) e **sem** o prefixo `+`.
   - Para um canal, o `chat_id` é negativo (por exemplo `-1001234567890`).
   - Também pode obter o `chat_id` de qualquer mensagem com um bot como o
     **@userinfobot** ou consultando a API:
     `https://api.telegram.org/bot<TOKEN>/getUpdates` (com o bot a receber uma
     mensagem nova).
5. Guarde o `chat_id` no segredo `TELEGRAM_CHAT_ID`.

Teste rápido da configuração (opcional):

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/sendPhoto" \
  -F chat_id="<TELEGRAM_CHAT_ID>" \
  -F photo="@assets/logo-antonia.jpg"
```

Se a API devolver `"ok": true`, a integração está correta.

---

## 7. Testar localmente

### 7.1 Com o servidor Python (referência)

```bash
python server.py 8000
```

O site fica em <http://localhost:8000> e a API de administração é servida pelo
Python. As credenciais por omissão são `999999999` / `923872439`.

### 7.2 Com o Wrangler (igual à Cloudflare)

```bash
# com o ficheiro .dev.vars (ver abaixo) para os segredos
npx wrangler pages dev . --kv=ADMIN_DATA
```

Crie um ficheiro `.dev.vars` (NÃO versione este ficheiro) na raiz do projeto:

```
ADMIN_SECRET="uma-chave-longa-e-aleatoria-para-desenvolvimento"
ADMIN_LOGIN="999999999"
ADMIN_SENHA="923872439"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
```

Requisito do `wrangler pages dev`: um projeto Pages **já criado** na
Cloudflare. Para testar apenas a API, sem projeto, use `npx wrangler dev`
dentro de `functions/`.

Testes rápidos:

```bash
curl -s -X POST http://localhost:8788/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"login":"999999999","senha":"923872439"}'

curl -s http://localhost:8788/api/public/produtos
```

---

## 8. Publicar com o Wrangler (Direct Upload)

```bash
# 1. autenticar
npx wrangler login

# 2. confirmar que o id do KV em wrangler.toml está correto
npx wrangler kv namespace list

# 3. publicar
npx wrangler pages deploy . --project-name antoniadecoracao
```

Saída esperada:

```
✨ Deployment complete! Take a peek over at https://antoniadecoracao.pages.dev
```

Para publicar uma versão de teste (pré-visualização) use uma branch:

```bash
npx wrangler pages deploy . --project-name antoniadecoracao --branch=testes
```

Fica disponível em `https://testes.antoniadecoracao.pages.dev`.

> O deploy envia a raiz do projeto como ficheiros estáticos **e** compila a
> pasta `functions/` como Pages Functions. Os ficheiros `_headers` e
> `_redirects` são interpretados automaticamente pela Cloudflare.

---

## 9. Publicar com a integração Git (painel)

1. **Workers & Pages** → projeto `antoniadecoracao` → **Settings** →
   **Builds & deployments** → **Connect to Git repository**.
2. Escolha o repositório e a branch de produção (`main` ou `master`).
3. Defina os parâmetros de build:
   - **Framework preset**: `None`
   - **Build command**: `npx wrangler pages deploy .` *(ou deixe vazio)*
   - **Build output directory**: `.`
4. Guarde. A Cloudflare executa o build a cada `push` na branch e cria
   pre-visualizações automáticas para as restantes branches e pull requests.
5. **Settings** → **Environment variables**: confirme que os segredos
   (`ADMIN_SECRET`, `ADMIN_SENHA`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
   existem **tanto** em *Production* como em *Preview*.
6. **Settings** → **Bindings**: confirme que `ADMIN_DATA` está associado ao
   namespace KV.

> A integração Git e o Direct Upload são métodos de publicação mutuamente
> exclusivos: um projeto criado com Direct Upload não pode ser ligado ao Git
> depois (terá de criar outro projeto).

---

## 10. Comparação: `server.py` local vs. Pages Functions na Cloudflare

| Aspeto | `server.py` (local) | Pages Functions (Cloudflare) |
| --- | --- | --- |
| Execução | Máquina do dono | Rede global da Cloudflare |
| Endpoint de login | `POST /api/admin/login` | `POST /api/admin/login` (idêntico) |
| Token | String aleatória guardada em memória | HMAC-SHA256 assinado com `ADMIN_SECRET` |
| Validade do token | Sessão do processo | 8 horas (campo `exp` do token) |
| Dados | Ficheiros na pasta do projeto | Workers KV (`ADMIN_DATA`) |
| Escrita | Imediata | Consistente na mesma localização; propagate-se globalmente em até ~60 s |
| Envio Telegram | `urllib`/`requests` do Python | `fetch()` + `FormData` no Worker |
| Formato de resposta | JSON `{"ok": true, ...}` | JSON `{"ok": true, ...}` (igual) |
| Erros | `{"ok": false, "erro": "..."}` | `{"ok": false, "erro": "..."}` (igual) |
| CORS | Não existia | `Access-Control-Allow-Origin: *` + suporte a `OPTIONS` |

O corpo da resposta é idêntico nos dois casos, pelo que o `admin/admin.js`
funciona sem alterações. A única diferença visível para o utilizador é o
pequeno atraso (até ~1 minuto) com que uma alteração feita no painel se
propaga a nível mundial — a Cloudflare KV é distribuída.

---

## 11. Alternativa: publicar como Cloudflare Worker

Se preferir um Worker em vez de Pages (por exemplo, para servir o site e a API
na mesma rota `api.antoniadecoracao.com`), os módulos já exportam um
`default { fetch }` compatível com o runtime de Workers:

```js
// cloudflare/worker.js  (ficheiro a criar por si, fora do âmbito desta entrega)
import admin from "../functions/api/admin/[[path]].js";
import publico from "../functions/api/public/[[path]].js";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const modulo = url.pathname.startsWith("/api/admin") ? admin : url.pathname.startsWith("/api/public") ? publico : null;
		if (modulo) return modulo.fetch(request, env, ctx);
		return new Response("Use /api/admin/* ou /api/public/*", { status: 404 });
	}
};
```

E um `wrangler.worker.toml` para o Worker:

```toml
name = "antoniadecoracao-api"
main = "cloudflare/worker.js"
compatibility_date = "2026-10-21"

[[kv_namespaces]]
binding = "ADMIN_DATA"
id = "SEU_ID_REAL_DO_NAMESPACE"

[vars]
ADMIN_LOGIN = "999999999"
ADMIN_SENHA = "923872439"
TELEGRAM_API_BASE = "https://api.telegram.org"
```

Publicação:

```bash
npx wrangler deploy -c wrangler.worker.toml
npx wrangler secret put ADMIN_SECRET -c wrangler.worker.toml
npx wrangler secret put TELEGRAM_BOT_TOKEN -c wrangler.worker.toml
npx wrangler secret put TELEGRAM_CHAT_ID -c wrangler.worker.toml
```

Depois basta apontar o `admin.html` (ou a configuração do frontend) para
`https://antoniadecoracao-api.<subdominio>.workers.dev/api/admin/...`.

> A configuração deste ficheiro (`wrangler.toml`) é a das **Pages**; a variante
> Worker fica em `wrangler.worker.toml` para não confundir a publicação do
> site com a da API.

---

## 12. Como alterar as credenciais do administrador

1. Escolha o novo par login/palavra-passe.
2. Atualize as variáveis no projeto (secretos, para não ficarem no Git):

   ```bash
   npx wrangler pages secret put ADMIN_LOGIN --project-name antoniadecoracao
   npx wrangler pages secret put ADMIN_SENHA --project-name antoniadecoracao
   ```

   Ou, no painel: **Settings** → **Variables and Secrets** → **Add** →
   *Encrypt* → **Save**.
3. Faça um novo deploy (as variáveis só são lidas no arranque do código):

   ```bash
   npx wrangler pages deploy . --project-name antoniadecoracao
   ```

4. Se mudar o `ADMIN_SECRET`, **todas as sessões abertas são invalidadas**
   (é isso que a rotação de segredos faz) e os tokens existentes deixam de
   ser aceites — os utilizadores têm de iniciar sessão novamente.
5. Se apenas mudar a palavra-passe, o `ADMIN_SECRET` pode manter-se: as
   sessões abertas continuam válidas até expirarem (8 horas).

---

## 13. Cópias de segurança e rotação de segredos

**Cópias de segurança do KV** (os dados do painel são o único conteúdo que
não vive no Git):

```bash
# descarregar tudo para a pasta "backup-kv"
mkdir backup-kv
npx wrangler kv key list --binding=ADMIN_DATA --namespace-id=SEU_ID
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias" --out-file backup-kv/categorias.json
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "carousel"   --out-file backup-kv/carousel.json
npx wrangler kv key get --binding=ADMIN_DATA --namespace-id=SEU_ID "produtos"   --out-file backup-kv/produtos.json
```

**Restaurar:**

```bash
npx wrangler kv key put --binding=ADMIN_DATA --namespace-id=SEU_ID "categorias" --path backup-kv/categorias.json
```

**Rotação de segredos** (recomendada a cada 3 a 6 meses, ou sempre que alguém
deixa de ter acesso):

```bash
npx wrangler pages secret put ADMIN_SECRET --project-name antoniadecoracao
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name antoniadecoracao
npx wrangler pages deploy . --project-name antoniadecoracao
```

No BotFather é também possível gerar um novo token para o bot
(`/token` → escolher o bot → escolher o token antigo ou gerar um novo) e
atualizar o segredo `TELEGRAM_BOT_TOKEN`.

---

## 14. Resolução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `{"ok":false,"erro":"Armazenamento (KV) não configurado."}` | Binding `ADMIN_DATA` em falta ou id errado | Confirmar o binding em **Settings → Bindings** ou corrigir o `id` em `wrangler.toml` e republicar |
| `401` com `"Sessão inválida ou expirada."` | Token expirado (8 h) ou `ADMIN_SECRET` alterado | Iniciar sessão outra vez; se acabou de mudar o segredo, republicar o projeto |
| `401` com `"Credenciais inválidas."` | `ADMIN_LOGIN`/`ADMIN_SENHA` diferentes dos enviados | Confirmar os valores em **Variables and Secrets** e republicar |
| `503` com `"Telegram não configurado."` | Faltam `TELEGRAM_BOT_TOKEN` ou `TELEGRAM_CHAT_ID` | Definir os dois segredos e republicar |
| `502` ao enviar para o Telegram | Chat id errado, bot removido do chat ou token inválido | Testar com `curl` (ver passo 6) e confirmar que o bot ainda tem acesso ao chat |
| As alterações no painel demoram a aparecer no site | Consistência eventual da KV (até ~60 s) | Aguardar; para leitura imediata no mesmo local, reiniciar o teste com `wrangler pages dev` |
| `404` em `/api/admin/...` | O ficheiro da Function não foi compilado | Confirmar que `functions/api/admin/[[path]].js` existe na raiz do projeto e que o deploy foi feito a partir dessa pasta |
| O vídeo `assets/reel.mp4` não carrega | Ficheiro grande (a Cloudflare serve ficheiros até 25 MB) | Verificar o tamanho e a compressão do vídeo; `assets/bg.mp4` (12 MB) também é grande |
| As Google Fonts não carregam em HTTPS | Os ficheiros HTML usam `http://fonts.googleapis.com` (conteúdo misto bloqueado pelo browser) | Substituir por `https://fonts.googleapis.com` nos ficheiros `index.html`, `explorar.html`, `sobre.html` e `contacto.html` |
| `Error: Invalid project name` ao publicar | Nome do projeto inválido | Usar apenas letras minúsculas, números e hífenes: `antoniadecoracao` |
| `wrangler` não encontra a conta | Sessão expirada | `npx wrangler login` |
| O pedido devolve a página inicial em vez de JSON | Existe uma regra genérica para `/api/*` em `_redirects` | Remover a regra; as rotas da API nunca devem ser reescritas |

---

## 15. Verificação final após a publicação

```bash
# 1. API pública (não exige token)
curl -s https://antoniadecoracao.pages.dev/api/public/categorias

# 2. Login
curl -s -X POST https://antoniadecoracao.pages.dev/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"login":"999999999","senha":"923872439"}'

# 3. Estado (usar o token devolvido no passo 2)
curl -s https://antoniadecoracao.pages.dev/api/admin/estado \
  -H "X-Admin-Token: TOKEN_DO_PASSO_2"

# 4. Páginas do site
curl -I https://antoniadecoracao.pages.dev/
curl -I https://antoniadecoracao.pages.dev/explorar.html
```

Checklist:

- [ ] `/`, `/explorar.html`, `/sobre.html`, `/contacto.html` e `/admin.html` abrem no navegador.
- [ ] `POST /api/admin/login` devolve `{"ok":true,"token":"..."}`.
- [ ] `GET /api/admin/estado` devolve as contagens e `telegram.configurado: true`.
- [ ] Criar uma categoria, um item do carousel e um produto no painel; confirmar que aparecem no site.
- [ ] Enviar uma imagem pelo painel e confirmar que chega ao Telegram.
- [ ] `ADMIN_SECRET`, `ADMIN_SENHA`, `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID` estão definidos como **segredos** (nunca em texto simples no Git).
- [ ] Cópia de segurança do KV guardada.

## 16. Endpoint das imagens guardadas no Telegram

Quando uma imagem é enviada pelo painel, o ficheiro fica no Telegram e o `file_id` é guardado no KV. O site público nunca vê o token do bot: a imagem é servida por um *proxy* que só existe no servidor.

```
GET /api/public/imagem/<file_id>   ->  a imagem (Content-Type do ficheiro)
```

Exemplo:

```bash
curl -s -o foto.jpg https://antoniadecoracao.pages.dev/api/public/imagem/AgACAgIAAxkBAAI...
```

Notas:

- É público por Necessidade (o `<img>` do site não pode enviar cabeçalhos), mas só aceita `file_id` do Telegram — o token do bot nunca é exposto.
- Sem `TELEGRAM_BOT_TOKEN` definido responde `503 {"ok":false,"erro":"Telegram não configurado."}`.
- Resposta com cache de 24 h (`Cache-Control: public, max-age=86400`).
- O mesmo endpoint existe no `server.py` local, para o comportamento ser igual nos dois ambientes.

Exemplo de item guardado no KV (chave `carousel`):

```json
{
  "id": "i6",
  "src": "/api/public/imagem/AgACAgIAAxkBAAI...",
  "legenda": "Decoração de casamento",
  "telegram_file_id": "AgACAgIAAxkBAAI...",
  "posicao": 6
}
```

