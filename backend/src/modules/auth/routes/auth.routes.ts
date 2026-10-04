import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { AuthController } from "../controllers/auth.controller.js";
import { authRouteSchemas as schemas } from "../schemas/auth.schema.js";

/** Prefixo: /api/auth */
export function authRoutes(controller: AuthController, guards: HttpGuards): FastifyPluginAsyncZod {
  const limited = { config: guards.authRateLimit };
  const authenticated = { onRequest: guards.authenticate };

  return async (app) => {
    app.post("/register", { ...limited, schema: schemas.register }, controller.register);
    app.post("/login", { ...limited, schema: schemas.login }, controller.login);
    // Sem limite por IP: refresh tokens têm 256 bits de entropia (força bruta inviável) e,
    // atrás de CGNAT de operadora, muitos usuários legítimos compartilham o mesmo IP.
    app.post("/refresh", { schema: schemas.refresh }, controller.refresh);
    app.post("/logout", { schema: schemas.logout }, controller.logout);
    app.post("/logout-all", { ...authenticated, schema: schemas.logoutAll }, controller.logoutAll);
    app.post("/password/forgot", { ...limited, schema: schemas.forgotPassword }, controller.forgotPassword);
    app.post("/password/reset", { ...limited, schema: schemas.resetPassword }, controller.resetPassword);
    app.post("/password/change", { ...authenticated, schema: schemas.changePassword }, controller.changePassword);
  };
}
