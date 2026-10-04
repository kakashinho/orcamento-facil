import type { FastifyRequest } from "fastify";
import { errors } from "../../shared/errors/app-error.js";
import type { AuthContext } from "./types.js";

/** Usuário autenticado da requisição (preenchido pelo hook `authenticate`). */
export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) {
    throw errors.unauthorized();
  }
  return request.auth;
}

/** Dados da requisição úteis aos services sem expor o Fastify a eles. */
export function requestMeta(request: FastifyRequest): { requestId: string; userAgent: string | undefined } {
  const userAgent = request.headers["user-agent"];
  return { requestId: request.id, userAgent: typeof userAgent === "string" ? userAgent : undefined };
}
