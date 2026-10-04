import type { FastifyPluginAsync } from "fastify";
import type { ResetPasswordController } from "../controllers/reset-password.controller.js";

/** Página web do link de recuperação: GET /reset-password e POST /reset-password (formulário HTML). */
export function resetPasswordRoutes(controller: ResetPasswordController): FastifyPluginAsync {
  return async (app) => {
    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 4096 },
      (_request, body, done) => {
        done(null, Object.fromEntries(new URLSearchParams(body as string)));
      },
    );

    app.get("/reset-password", { schema: { hide: true } }, controller.showForm);
    app.post("/reset-password", { schema: { hide: true } }, controller.submit);
  };
}
