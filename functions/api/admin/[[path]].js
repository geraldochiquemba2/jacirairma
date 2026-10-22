/**
 * Antônia Decoração — API de administração (Cloudflare Pages Function)
 * Rota: /api/admin/*
 *
 * Contrato idêntico ao servidor local (server.py) para que o painel
 * administrativo funcione sem alterações nos dois ambientes:
 *   POST   /api/admin/login        -> {ok:true, token} | {ok:false, erro}
 *   GET    /api/admin/estado       -> {ok:true, telegram:{configurado}, contagens:{...}}
 *   GET    /api/admin/categorias   -> {ok:true, dados:[...]}
 *   POST   /api/admin/categorias   -> {ok:true, dados:{...}}
 *   DELETE /api/admin/categorias?id= -> {ok:true}
 *   GET/POST/DELETE /api/admin/carousel
 *   GET/POST/DELETE /api/admin/produtos
 *   POST   /api/admin/ordem        -> {ok:true}
 *   POST   /api/admin/telegram     -> {ok:true, telegram:{file_id, message_id, chat_id}}
 *
 * Todos os endpoints (exceto /login) exigem o cabeçalho "X-Admin-Token".
 * Os dados são guardados em Workers KV (binding ADMIN_DATA) nas chaves
 * "categorias", "carousel" e "produtos" (cada uma com um array JSON).
 */

const KV_BINDING = "ADMIN_DATA";
const TIPOS = ["categorias", "carousel", "produtos"];
const DURACAO_TOKEN_SEGUNDOS = 8 * 60 * 60;
const LOGIN_PADRAO = "999999999";
const SENHA_PADRAO = "923872439";
const SEGREDO_RESERVA = "antonia-decoracao-segredo-de-desenvolvimento";
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

/* ------------------------------------------------------------------ */
/* Respostas                                                           */
/* ------------------------------------------------------------------ */

function responder(dados, estado = 200) {
	return new Response(JSON.stringify(dados), {
		status: estado,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
			...CABECALHOS_CORS,
			...CABECALHOS_SEGURANCA
		}
	});
}

function preflight() {
	return new Response(null, { status: 204, headers: { ...CABECALHOS_CORS, ...CABECALHOS_SEGURANCA } });
}

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */

function responderErro(mensagem, estado = 400) {
	return responder({ ok: false, erro: mensagem }, estado);
}

/** Segmento final da rota (ex.: /api/admin/login -> "login"). */
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
	const indice = limpos.lastIndexOf("admin");
	if (indice >= 0 && indice + 1 < limpos.length) return limpos[indice + 1];
	return limpos.length ? limpos[limpos.length - 1] : "";
}

/** Le o corpo em JSON, form-urlencoded, multipart ou texto simples. */
async function lerCorpo(request) {
	const tipo = String(request.headers.get("content-type") || "").toLowerCase();
	try {
		if (tipo.indexOf("application/json") >= 0) {
			const dados = await request.json();
			return dados && typeof dados === "object" ? dados : {};
		}
		if (tipo.indexOf("application/x-www-form-urlencoded") >= 0 || tipo.indexOf("multipart/form-data") >= 0) {
			const formulario = await request.formData();
			const saida = {};
			for (const [chave, valor] of formulario.entries()) {
				saida[chave] = typeof valor === "string" ? valor : "";
			}
			return saida;
		}
		const texto = await request.text();
		if (!texto) return {};
		try {
			const dados = JSON.parse(texto);
			return dados && typeof dados === "object" ? dados : { valor: dados };
		} catch (erro) {
			return { valor: texto };
		}
	} catch (erro) {
		return {};
	}
}

function texto(valor) {
	if (valor === undefined || valor === null) return "";
	return String(valor).trim();
}

function numero(valor) {
	const resultado = Number(valor);
	return Number.isFinite(resultado) ? resultado : 0;
}

/** Comparação em tempo aproximadamente constante. */
function comparar(a, b) {
	const x = String(a === undefined || a === null ? "" : a);
	const y = String(b === undefined || b === null ? "" : b);
	let diferenca = x.length ^ y.length;
	const tamanho = Math.max(x.length, y.length);
	for (let i = 0; i < tamanho; i++) {
		const cx = x.charCodeAt(i % (x.length || 1)) || 0;
		const cy = y.charCodeAt(i % (y.length || 1)) || 0;
		diferenca |= cx ^ cy;
	}
	return diferenca === 0;
}

/* ------------------------------------------------------------------ */
/* Token HMAC (ADMIN_SECRET)                                           */
/* ------------------------------------------------------------------ */

function segredoDe(env) {
	return String((env && (env.ADMIN_SECRET || env.ADMIN_SENHA)) || SEGREDO_RESERVA);
}

function base64Url(bytes) {
	let binario = "";
	for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
	return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(valor) {
	let base = String(valor).replace(/-/g, "+").replace(/_/g, "/");
	while (base.length % 4) base += "=";
	return atob(base);
}

async function assinar(conteudo, segredo) {
	const encoder = new TextEncoder();
	const chave = await crypto.subtle.importKey(
		"raw",
		encoder.encode(segredo),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const assinatura = await crypto.subtle.sign("HMAC", chave, encoder.encode(conteudo));
	return base64Url(new Uint8Array(assinatura));
}

async function criarToken(env) {
	const exp = Math.floor(Date.now() / 1000) + DURACAO_TOKEN_SEGUNDOS;
	const carga = base64Url(new TextEncoder().encode(JSON.stringify({ exp })));
	const assinatura = await assinar(carga, segredoDe(env));
	return carga + "." + assinatura;
}

async function verificarToken(token, segredo) {
	if (!token || typeof token !== "string") return false;
	const partes = token.split(".");
	if (partes.length !== 2) return false;
	const esperada = await assinar(partes[0], segredo);
	if (!comparar(partes[1], esperada)) return false;
	try {
		const dados = JSON.parse(deBase64Url(partes[0]));
		const exp = Number(dados && dados.exp);
		if (!Number.isFinite(exp)) return false;
		return exp > Math.floor(Date.now() / 1000);
	} catch (erro) {
		return false;
	}
}

async function exigirSessao(context) {
	const pedido = context.request;
	const token = pedido.headers.get("X-Admin-Token") || pedido.headers.get("x-admin-token") || "";
	if (!token) return responderErro("Sessão inválida ou expirada.", 401);
	const valido = await verificarToken(token, segredoDe(context.env));
	if (!valido) return responderErro("Sessão inválida ou expirada.", 401);
	return null;
}

/* ------------------------------------------------------------------ */
/* Workers KV                                                          */
/* ------------------------------------------------------------------ */

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

async function gravarLista(env, tipo, lista) {
	const kv = env && env[KV_BINDING];
	if (!kv || typeof kv.put !== "function") {
		throw new Error("Armazenamento (KV) não configurado.");
	}
	await kv.put(tipo, JSON.stringify(lista));
}

function proximoId(lista) {
	let maior = 0;
	for (const item of lista) {
		const valor = Number(item && item.id);
		if (Number.isFinite(valor) && valor > maior) maior = valor;
	}
	return maior + 1;
}

function montarItem(tipo, corpo, existente, lista) {
	const item = { ...(existente || {}), ...(corpo || {}) };
	const idEnviado = corpo && corpo.id !== undefined && corpo.id !== null && corpo.id !== "" ? corpo.id : null;
	item.id = existente ? existente.id : idEnviado !== null ? idEnviado : proximoId(lista);

	if (tipo === "categorias") {
		item.nome = texto(corpo.nome !== undefined ? corpo.nome : existente && existente.nome);
		item.icone = texto(corpo.icone !== undefined ? corpo.icone : existente && existente.icone);
		item.posicao = numero(
			corpo.posicao !== undefined ? corpo.posicao : existente && existente.posicao !== undefined ? existente.posicao : lista.length
		);
	} else if (tipo === "carousel") {
		item.src = texto(corpo.src !== undefined ? corpo.src : existente && existente.src);
		item.legenda = texto(corpo.legenda !== undefined ? corpo.legenda : existente && existente.legenda);
		item.telegram_file_id = texto(
			corpo.telegram_file_id !== undefined ? corpo.telegram_file_id : existente && existente.telegram_file_id
		);
		item.posicao = numero(
			corpo.posicao !== undefined ? corpo.posicao : existente && existente.posicao !== undefined ? existente.posicao : lista.length
		);
	} else {
		item.nome = texto(corpo.nome !== undefined ? corpo.nome : existente && existente.nome);
		item.preco = corpo.preco !== undefined ? corpo.preco : existente && existente.preco !== undefined ? existente.preco : "";
		item.descricao = texto(corpo.descricao !== undefined ? corpo.descricao : existente && existente.descricao);
		item.categoria = texto(corpo.categoria !== undefined ? corpo.categoria : existente && existente.categoria);
		item.src = texto(corpo.src !== undefined ? corpo.src : existente && existente.src);
		item.telegram_file_id = texto(
			corpo.telegram_file_id !== undefined ? corpo.telegram_file_id : existente && existente.telegram_file_id
		);
		item.posicao = numero(
			corpo.posicao !== undefined ? corpo.posicao : existente && existente.posicao !== undefined ? existente.posicao : lista.length
		);
	}
	return item;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

async function tratarLogin(context) {
	const pedido = context.request;
	if (pedido.method.toUpperCase() !== "POST") return responderErro("Método não permitido.", 405);

	const corpo = await lerCorpo(pedido);
	const env = context.env || {};
	const login = texto(corpo.login !== undefined ? corpo.login : corpo.utilizador);
	const senha = String(corpo.senha !== undefined ? corpo.senha : corpo.password !== undefined ? corpo.password : "");

	const loginEsperado = String(env.ADMIN_LOGIN || LOGIN_PADRAO);
	const senhaEsperada = String(env.ADMIN_SENHA || SENHA_PADRAO);

	const loginCerto = comparar(login, loginEsperado);
	const senhaCerta = comparar(senha, senhaEsperada);
	const segredoCerto = env.ADMIN_SECRET ? comparar(senha, String(env.ADMIN_SECRET)) : false;

	if (!loginCerto || (!senhaCerta && !segredoCerto)) {
		return responder({ ok: false, erro: "Credenciais inválidas." }, 401);
	}

	const token = await criarToken(env);
	return responder({ ok: true, token });
}

async function tratarEstado(context) {
	const bloqueio = await exigirSessao(context);
	if (bloqueio) return bloqueio;
	if (context.request.method.toUpperCase() !== "GET") return responderErro("Método não permitido.", 405);

	const env = context.env || {};
	const [categorias, carousel, produtos] = await Promise.all([
		lerLista(env, "categorias"),
		lerLista(env, "carousel"),
		lerLista(env, "produtos")
	]);
	const telegramConfigurado = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);

	return responder({
		ok: true,
		telegram: { configurado: telegramConfigurado },
		contagens: {
			categorias: categorias.length,
			carousel: carousel.length,
			produtos: produtos.length
		}
	});
}

async function tratarColecao(context, tipo) {
	const bloqueio = await exigirSessao(context);
	if (bloqueio) return bloqueio;

	const pedido = context.request;
	const metodo = pedido.method.toUpperCase();
	const env = context.env || {};

	if (metodo === "GET") {
		const lista = await lerLista(env, tipo);
		return responder({ ok: true, dados: lista });
	}

	if (metodo === "POST") {
		const corpo = await lerCorpo(pedido);
		const lista = await lerLista(env, tipo);
		let existente = null;
		const idEnviado = corpo && corpo.id !== undefined && corpo.id !== null && corpo.id !== "";
		if (idEnviado) {
			existente = lista.find((item) => String(item.id) === String(corpo.id)) || null;
		}
		const item = montarItem(tipo, corpo, existente, lista);
		if (existente) {
			lista[lista.indexOf(existente)] = item;
		} else {
			lista.push(item);
		}
		try {
			await gravarLista(env, tipo, lista);
		} catch (erro) {
			return responderErro("Armazenamento (KV) não configurado.", 503);
		}
		return responder({ ok: true, dados: item });
	}

	if (metodo === "DELETE") {
		const url = new URL(pedido.url);
		let id = url.searchParams.get("id");
		if (id === null || id === "") {
			const corpo = await lerCorpo(pedido);
			id = corpo && corpo.id !== undefined && corpo.id !== null ? String(corpo.id) : "";
		}
		if (!id) return responderErro("Parâmetro id em falta.", 400);
		const lista = await lerLista(env, tipo);
		const restantes = lista.filter((item) => String(item.id) !== String(id));
		try {
			await gravarLista(env, tipo, restantes);
		} catch (erro) {
			return responderErro("Armazenamento (KV) não configurado.", 503);
		}
		return responder({ ok: true });
	}

	return responderErro("Método não permitido.", 405);
}

async function tratarOrdem(context) {
	const bloqueio = await exigirSessao(context);
	if (bloqueio) return bloqueio;
	if (context.request.method.toUpperCase() !== "POST") return responderErro("Método não permitido.", 405);

	const corpo = await lerCorpo(context.request);
	const tipo = texto(corpo.tipo);
	if (TIPOS.indexOf(tipo) < 0) return responderErro("Tipo inválido.", 400);

	const ordem = Array.isArray(corpo.ordem) ? corpo.ordem : [];
	const env = context.env || {};
	const lista = await lerLista(env, tipo);

	const restantes = lista.slice();
	const nova = [];
	for (const id of ordem) {
		const indice = restantes.findIndex((item) => String(item.id) === String(id));
		if (indice >= 0) nova.push(restantes.splice(indice, 1)[0]);
	}
	nova.push(...restantes);
	nova.forEach((item, indice) => {
		item.posicao = indice;
	});

	try {
		await gravarLista(env, tipo, nova);
	} catch (erro) {
		return responderErro("Armazenamento (KV) não configurado.", 503);
	}
	return responder({ ok: true });
}

function base64ParaBytes(base64) {
	let limpo = String(base64 || "").trim();
	const marca = limpo.indexOf("base64,");
	if (marca >= 0) limpo = limpo.slice(marca + 7);
	limpo = limpo.replace(/\s+/g, "");
	if (!limpo) return new Uint8Array(0);
	try {
		const binario = atob(limpo);
		const bytes = new Uint8Array(binario.length);
		for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
		return bytes;
	} catch (erro) {
		return new Uint8Array(0);
	}
}

function tipoMime(nome) {
	const extensao = String(nome || "").split(".").pop().toLowerCase();
	const mapa = {
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
		svg: "image/svg+xml",
		avif: "image/avif",
		bmp: "image/bmp"
	};
	return mapa[extensao] || "application/octet-stream";
}

async function tratarTelegram(context) {
	const bloqueio = await exigirSessao(context);
	if (bloqueio) return bloqueio;
	if (context.request.method.toUpperCase() !== "POST") return responderErro("Método não permitido.", 405);

	const env = context.env || {};
	const token = texto(env.TELEGRAM_BOT_TOKEN);
	const chatId = texto(env.TELEGRAM_CHAT_ID);
	if (!token || !chatId) return responder({ ok: false, erro: "Telegram não configurado." }, 503);

	const corpo = await lerCorpo(context.request);
	const base64 = texto(corpo.ficheiro !== undefined ? corpo.ficheiro : corpo.ficheiro_base64);
	if (!base64) return responderErro("Ficheiro em base64 ausente.", 400);

	const nome = texto(corpo.nome) || "foto.jpg";
	const binario = base64ParaBytes(base64);
	if (!binario.length) return responderErro("Ficheiro inválido.", 400);

	const formulario = new FormData();
	formulario.append("chat_id", chatId);
	formulario.append("photo", new Blob([binario], { type: tipoMime(nome) }), nome);

	const base = texto(env.TELEGRAM_API_BASE) || BASE_TELEGRAM;
	let resposta;
	try {
		resposta = await fetch(`${base.replace(/\/+$/, "")}/bot${token}/sendPhoto`, {
			method: "POST",
			body: formulario
		});
	} catch (erro) {
		return responder({ ok: false, erro: "Não foi possível contactar o Telegram." }, 502);
	}

	let dados = null;
	try {
		dados = await resposta.json();
	} catch (erro) {
		dados = null;
	}
	if (!resposta.ok || !dados || dados.ok !== true) {
		const descricao = dados && dados.description ? dados.description : "HTTP " + resposta.status;
		return responder({ ok: false, erro: "Falha ao enviar para o Telegram: " + descricao }, 502);
	}

	const resultado = dados.result || {};
	const fotos = Array.isArray(resultado.photo) ? resultado.photo : [];
	const foto = fotos.length ? fotos[fotos.length - 1] : null;
	const documento = resultado.document || null;
	const chat = resultado.chat && resultado.chat.id !== undefined ? resultado.chat.id : chatId;

	return responder({
		ok: true,
		telegram: {
			file_id: (foto && foto.file_id) || (documento && documento.file_id) || "",
			message_id: resultado.message_id === undefined ? null : resultado.message_id,
			chat_id: chat
		}
	});
}

/* ------------------------------------------------------------------ */
/* Entrada (Pages Functions + alternativa Workers)                    */
/* ------------------------------------------------------------------ */

export async function onRequest(context) {
	const metodo = String(context.request.method || "GET").toUpperCase();
	if (metodo === "OPTIONS") return preflight();

	try {
		const rota = rotaAtual(context);
		switch (rota) {
			case "login":
				return await tratarLogin(context);
			case "estado":
				return await tratarEstado(context);
			case "categorias":
				return await tratarColecao(context, "categorias");
			case "carousel":
				return await tratarColecao(context, "carousel");
			case "produtos":
				return await tratarColecao(context, "produtos");
			case "ordem":
				return await tratarOrdem(context);
			case "telegram":
				return await tratarTelegram(context);
			default:
				return responderErro("Endpoint não encontrado.", 404);
		}
	} catch (erro) {
		console.error("API admin:", erro && erro.message ? erro.message : erro);
		return responder({ ok: false, erro: "Erro interno do servidor." }, 500);
	}
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
