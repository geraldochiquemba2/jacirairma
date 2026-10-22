/**
 * Antônia Decoração — Middleware (Cloudflare Pages Function)
 *
 * Corre em todas as páginas da função e serve para:
 *   - garantir cabeçalhos CORS e de segurança nas respostas da API;
 *   - devolver erros em JSON (em vez de HTML) quando a API falha.
 *
 * As páginas estáticas não são alteradas: continuam a ser servidas pelo
 * Cloudflare Pages com as regras do ficheiro _headers.
 */

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

export async function onRequest(context) {
	let url;
	try {
		url = new URL(context.request.url);
	} catch (erro) {
		url = { pathname: "/" };
	}
	const ehApi = url.pathname === "/api" || url.pathname.indexOf("/api/") === 0;

	try {
		const resposta = await context.next();
		if (!ehApi) return resposta;

		const cabecalhos = new Headers(resposta.headers);
		for (const [nome, valor] of Object.entries(CABECALHOS_CORS)) {
			if (!cabecalhos.has(nome)) cabecalhos.set(nome, valor);
		}
		for (const [nome, valor] of Object.entries(CABECALHOS_SEGURANCA)) {
			if (!cabecalhos.has(nome)) cabecalhos.set(nome, valor);
		}
		return new Response(resposta.body, {
			status: resposta.status,
			statusText: resposta.statusText,
			headers: cabecalhos
		});
	} catch (erro) {
		console.error("Middleware:", erro && erro.message ? erro.message : erro);
		if (!ehApi) throw erro;
		return new Response(JSON.stringify({ ok: false, erro: "Erro interno do servidor." }), {
			status: 500,
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Cache-Control": "no-store",
				...CABECALHOS_CORS,
				...CABECALHOS_SEGURANCA
			}
		});
	}
}
