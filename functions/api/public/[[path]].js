/**
 * Antônia Decoração — API pública (Cloudflare Pages Function)
 * Rota: /api/public/*
 *
 * Leitura sem autenticação dos dados guardados em Workers KV:
 *   GET /api/public/categorias -> {ok:true, dados:[...]}
 *   GET /api/public/carousel   -> {ok:true, dados:[...]}
 *   GET /api/public/produtos   -> {ok:true, dados:[...]}
 *
 * As chaves do KV são as mesmas usadas pela API de administração:
 * "categorias", "carousel" e "produtos" (arrays JSON).
 */

const KV_BINDING = "ADMIN_DATA";
const TIPOS = ["categorias", "carousel", "produtos"];
const BASE_TELEGRAM = "https://api.telegram.org";

const CABECALHOS_CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "X-Admin-Token, Content-Type",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Max-Age": "86400"
};

const CABECALHOS_SEGURANCA = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Frame-Options": "SAMEORIGIN"
};

function responder(dados, estado = 200) {
	return new Response(JSON.stringify(dados), {
		status: estado,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "public, max-age=30",
			...CABECALHOS_CORS,
			...CABECALHOS_SEGURANCA
		}
	});
}

function preflight() {
	return new Response(null, { status: 204, headers: { ...CABECALHOS_CORS, ...CABECALHOS_SEGURANCA } });
}

/** Segmento final da rota (ex.: /api/public/produtos -> "produtos"). */
function rotaAtual(context) {
	let segmentos = (context && context.params && context.params.path) || [];
	if (typeof segmentos === "string") segmentos = segmentos.split("/");
	if (!Array.isArray(segmentos)) segmentos = [];
	if (!segmentos.length) {
		try {
			segmentos = new URL(context.request.url).pathname.split("/");
		} catch (erro) {
			segmentos = [];
		}
	}
	const limpos = segmentos.filter((parte) => parte !== "");
	const indice = limpos.lastIndexOf("public");
	if (indice >= 0 && indice + 1 < limpos.length) return limpos[indice + 1];
	return limpos.length ? limpos[0] : "";
}

/** Lê um array JSON do KV; devolve [] se a chave não existir. */
async function lerLista(env, tipo) {
	const kv = env && env[KV_BINDING];
	if (!kv || typeof kv.get !== "function") return [];
	try {
		const bruto = await kv.get(tipo);
		if (!bruto) return [];
		const dados = JSON.parse(bruto);
		return Array.isArray(dados) ? dados : [];
	} catch (erro) {
		return [];
	}
}

export async function onRequest(context) {
	const metodo = String(context.request.method || "GET").toUpperCase();
	if (metodo === "OPTIONS") return preflight();

	try {
		if (metodo !== "GET") {
			return responder({ ok: false, erro: "Método não permitido." }, 405);
		}
		const rota = rotaAtual(context);
		if (rota === "imagem") {
			return await servirImagem(context);
		}
		if (TIPOS.indexOf(rota) < 0) {
			return responder({ ok: false, erro: "Recurso não encontrado." }, 404);
		}
		const lista = await lerLista(context.env || {}, rota);
		return responder({ ok: true, dados: lista });
	} catch (erro) {
		console.error("API pública:", erro && erro.message ? erro.message : erro);
		return responder({ ok: false, erro: "Erro interno do servidor." }, 500);
	}
}

/**
 * Proxy das fotos guardadas no Telegram: /api/public/imagem/<file_id>
 * O token do bot nunca é exposto ao visitante.
 */
async function servirImagem(context) {
	const env = context.env || {};
	const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
	if (!token) {
		return responder({ ok: false, erro: "Telegram não configurado." }, 503);
	}

	let fileId = "";
	try {
		const url = new URL(context.request.url);
		const segmentos = url.pathname.split("/").filter((parte) => parte !== "");
		const indice = segmentos.lastIndexOf("imagem");
		if (indice >= 0 && indice + 1 < segmentos.length) {
			fileId = decodeURIComponent(segmentos[indice + 1]);
		}
	} catch (erro) {
		fileId = "";
	}

	if (!fileId) {
		return responder({ ok: false, erro: "file_id em falta." }, 400);
	}

	const base = String(env.TELEGRAM_API_BASE || BASE_TELEGRAM).replace(/\/+$/, "");
	let info;
	try {
		info = await fetch(`${base}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
	} catch (erro) {
		return responder({ ok: false, erro: "Não foi possível contactar o Telegram." }, 502);
	}
	if (!info.ok) {
		return responder({ ok: false, erro: `Telegram respondeu com erro ${info.status}.` }, 404);
	}
	let dadosInfo = null;
	try {
		dadosInfo = await info.json();
	} catch (erro) {
		dadosInfo = null;
	}
	const caminho = dadosInfo && dadosInfo.ok && dadosInfo.result ? String(dadosInfo.result.file_path || "") : "";
	if (!caminho) {
		return responder({ ok: false, erro: "Ficheiro não encontrado no Telegram." }, 404);
	}
	const caminhoUrl = caminho.split("/").map((parte) => encodeURIComponent(parte)).join("/");
	let resposta;
	try {
		resposta = await fetch(`${base}/file/bot${token}/${caminhoUrl}`);
	} catch (erro) {
		return responder({ ok: false, erro: "Não foi possível contactar o Telegram." }, 502);
	}
	if (!resposta.ok) {
		return responder({ ok: false, erro: `Telegram respondeu com erro ${resposta.status}.` }, 404);
	}

	const binario = await resposta.arrayBuffer();
	const tipo = (resposta.headers.get("Content-Type") || "image/jpeg").split(";")[0].trim();

	return new Response(binario, {
		status: 200,
		headers: {
			"Content-Type": tipo || "image/jpeg",
			"Cache-Control": "public, max-age=86400",
			...CABECALHOS_CORS,
			...CABECALHOS_SEGURANCA
		}
	});
}

/** Permite publicar este mesmo módulo como Cloudflare Worker (ver DEPLOY.md). */
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		return onRequest({
			request,
			env,
			params: { path: url.pathname.split("/").filter((parte) => parte !== "") },
			waitUntil: (promessa) => (ctx && ctx.waitUntil ? ctx.waitUntil(promessa) : undefined)
		});
	}
};
