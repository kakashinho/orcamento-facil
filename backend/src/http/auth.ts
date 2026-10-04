import type { FastifyRequest } from "fastify";
import { errors } from "../shared/errors.js";
import type { AccessTokenService } from "../modules/auth/access-token.js";
import type { AuthService } from "../modules/auth/auth.service.js";
import type { AuthContext } from "./types.js";

/**
 * Hook de autenticação: valida o access token (JWT HS256) e confirma que a sessão
 * não foi revogada (logout, reset de senha, reuso de refresh token) — R03/R87.
 */
export function createAuthenticate(accessTokens: AccessTokenService, auth: AuthService) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw errors.unauthorized();
    }
    const claims = accessTokens.verify(header.slice("Bearer ".length).trim());
    const active = await auth.isSessionActive(claims.sid, claims.sub);
    if (!active) {
      throw errors.invalidToken("Sessão encerrada. Faça login novamente.");
    }
    request.auth = { userId: claims.sub, role: claims.role, sessionId: claims.sid };
  };
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw errors.unauthorized();
  }
  return request.auth;
}

export function requireAdmin(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request);
  if (auth.role !== "admin") {
    throw errors.forbidden("Operação restrita a administradores.");
  }
  return auth;
}
