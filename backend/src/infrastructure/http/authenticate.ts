import type { FastifyRequest } from "fastify";
import { errors } from "../../shared/errors/app-error.js";
import type { AccessTokenClaims } from "../auth/access-token.js";
import type { RequestHook } from "./types.js";

/**
 * Hook de autenticação (R03/R87): lê o `Authorization: Bearer`, valida o JWT e confirma que
 * a sessão não foi revogada (logout, reset de senha, reuso de refresh token). Preenche
 * `request.auth` para os controllers. As verificações vêm injetadas do módulo auth.
 */
export function createAuthenticate(
  verifyAccessToken: (token: string) => AccessTokenClaims,
  isSessionActive: (sessionId: string, userId: string) => Promise<boolean>,
): RequestHook {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw errors.unauthorized();
    }
    const claims = verifyAccessToken(header.slice("Bearer ".length).trim());
    if (!(await isSessionActive(claims.sid, claims.sub))) {
      throw errors.invalidToken("Sessão encerrada. Faça login novamente.");
    }
    request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  };
}

/** Autorização administrativa: usar depois de `authenticate`. */
export async function requireAdminHook(request: FastifyRequest): Promise<void> {
  if (request.auth?.role !== "admin") {
    throw errors.forbidden("Operação restrita a administradores.");
  }
}
