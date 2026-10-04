import type { FastifyPluginAsync } from "fastify";
import type { RouteDeps } from "../../http/route-deps.js";
import { requestMeta } from "../../http/route-deps.js";
import { AppError } from "../../shared/errors.js";
import { escapeHtml } from "../../shared/html.js";

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — Orçamento Fácil</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px 16px;
         background: #f5f7f5; color: #1f2933; }
  main { max-width: 420px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px;
         box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  h1 { font-size: 1.35rem; margin: 0 0 12px; color: #1b5e20; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; }
  input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #cbd2d9; border-radius: 8px; font-size: 1rem; }
  button { margin-top: 20px; width: 100%; padding: 12px; border: 0; border-radius: 8px; background: #2e7d32; color: #fff;
           font-size: 1rem; font-weight: 600; cursor: pointer; }
  .hint { font-size: .85rem; color: #52606d; }
  .error { background: #fdecea; color: #8a1c1c; padding: 10px 12px; border-radius: 8px; }
  .ok { background: #e8f5e9; color: #1b5e20; padding: 10px 12px; border-radius: 8px; }
  @media (prefers-color-scheme: dark) {
    body { background: #111; color: #e4e7eb; } main { background: #1f2933; }
    input { background: #111; color: #e4e7eb; border-color: #52606d; } .hint { color: #9aa5b1; }
  }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

function form(token: string, error?: string): string {
  return page(
    "Redefinir senha",
    `<h1>Redefinir senha</h1>
${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/reset-password">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label for="password">Nova senha</label>
  <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128">
  <p class="hint">Mínimo de 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.</p>
  <label for="confirm">Confirme a nova senha</label>
  <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="8" maxlength="128">
  <button type="submit">Salvar nova senha</button>
</form>`,
  );
}

/**
 * Página web aberta pelo link do e-mail de recuperação (R04). Funciona sem JavaScript e
 * sem depender do aplicativo instalado; a regra de negócio é a mesma da API.
 */
export function resetPasswordPage(deps: RouteDeps): FastifyPluginAsync {
  const { auth } = deps.container;
  return async (app) => {
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 4096 }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });

    const headers = {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    };

    app.get("/reset-password", { schema: { hide: true } }, async (request, reply) => {
      const token = (request.query as Record<string, unknown>).token;
      if (typeof token !== "string" || token.length === 0) {
        return reply
          .headers(headers)
          .status(400)
          .send(page("Link inválido", `<h1>Link inválido</h1><p class="error">Solicite um novo link de recuperação no aplicativo.</p>`));
      }
      return reply.headers(headers).send(form(token));
    });

    app.post("/reset-password", { schema: { hide: true } }, async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const token = typeof body.token === "string" ? body.token : "";
      const password = typeof body.password === "string" ? body.password : "";
      const confirm = typeof body.confirm === "string" ? body.confirm : "";
      if (password !== confirm) {
        return reply.headers(headers).status(400).send(form(token, "As senhas não coincidem."));
      }
      try {
        await auth.resetPassword(token, password, requestMeta(request));
      } catch (error) {
        if (error instanceof AppError) {
          const detail = (error.details as { password?: string[] } | undefined)?.password?.join(" ");
          return reply
            .headers(headers)
            .status(error.statusCode)
            .send(form(token, detail ? `${error.message} ${detail}` : error.message));
        }
        throw error;
      }
      return reply
        .headers(headers)
        .send(
          page(
            "Senha redefinida",
            `<h1>Senha redefinida</h1><p class="ok">Sua senha foi alterada com sucesso. Volte ao aplicativo e entre com a nova senha.</p>`,
          ),
        );
    });
  };
}
