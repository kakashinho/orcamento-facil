import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { HttpGuards } from "../../../infrastructure/http/types.js";
import type { BiometricController } from "../controllers/biometric.controller.js";
import { biometricRouteSchemas as schemas } from "../schemas/biometric.schema.js";

/** Prefixo: /api/auth/biometric — cadastro do aparelho exige login; desafio e login são públicos. */
export function biometricRoutes(controller: BiometricController, guards: HttpGuards): FastifyPluginAsyncZod {
  const limited = { config: guards.authRateLimit };
  const authenticated = { onRequest: guards.authenticate };

  return async (app) => {
    app.post("/credentials", { ...authenticated, schema: schemas.enroll }, controller.enroll);
    app.get("/credentials", { ...authenticated, schema: schemas.list }, controller.list);
    app.delete("/credentials/:id", { ...authenticated, schema: schemas.revoke }, controller.revoke);
    app.post("/challenge", { ...limited, schema: schemas.challenge }, controller.challenge);
    app.post("/login", { ...limited, schema: schemas.login }, controller.login);
  };
}
