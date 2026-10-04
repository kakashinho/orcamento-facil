import type { FastifyRequest } from "fastify";
import { errors } from "../../shared/errors/app-error.js";
import type { AccessTokenClaims } from "../auth/access-token.js";
import type { RequestHook } from "./types.js";

/**
 * Hook de autenticação (R03/R87): lê o `Authorization: Bearer`, valida o JWT e confirma que
 * a sessão não foi revogada (logout, reset de senha, reuso de refresh token). Preenche
 * `request.auth` para os controllers. As verificações vêm injetadas do módulo auth.
 *
 * Respostas 401 para o app decidir o que fazer:
 * UNAUTHORIZED (sem token) e INVALID_TOKEN/SESSION_REVOKED → tela de login;
 * TOKEN_EXPIRED → renovar em /api/auth/refresh e repetir a requisição.
 */
export function createAuthenticate(
  verifyAccessToken: (token: string) => AccessTokenClaims,
  isSessionActive: (sessionId: string, userId: string) => Promise<boolean>,
): RequestHook {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !/^Bearer\s+\S+/i.test(header)) {
      throw errors.unauthorized();
    }
    const claims = verifyAccessToken(header.replace(/^Bearer\s+/i, "").trim());
    if (!(await isSessionActive(claims.sid, claims.sub))) {
      throw errors.sessionRevoked();
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
