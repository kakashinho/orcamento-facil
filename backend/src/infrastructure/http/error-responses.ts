import type { FastifySchema, RouteOptions } from "fastify";
import { errorResponse } from "./common-schemas.js";
import { isMaintenanceExempt, MUTATING_METHODS } from "./maintenance-gate.js";

const DESCRIPTIONS: Record<number, string> = {
  400: "Dados inválidos: VALIDATION_ERROR (details lista cada campo e o motivo), INVALID_JSON",
  401: "Não autenticado: UNAUTHORIZED, TOKEN_EXPIRED (renove em /api/auth/refresh), INVALID_TOKEN, SESSION_REVOKED; nas rotas de entrada: INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, BIOMETRIC_*",
  403: "Sem permissão: FORBIDDEN",
  404: "Recurso não encontrado (ou de outro usuário): NOT_FOUND",
  409: "Conflito com o estado atual (ex.: nome já usado, carteira com movimentações)",
  415: "Formato não suportado: UNSUPPORTED_MEDIA_TYPE (envie JSON)",
  422: "Regra de negócio não atendida (ex.: carteira inexistente, categoria de outro tipo)",
  423: "Conta bloqueada temporariamente: ACCOUNT_LOCKED (Retry-After em segundos)",
  429: "Muitas tentativas: RATE_LIMITED",
  503: "Indisponível: MAINTENANCE_MODE (Retry-After) ou cotações de câmbio indisponíveis",
};

const LOCKABLE = new Set(["/api/auth/login", "/api/auth/biometric/login"]);
/** Rotas públicas que respondem 401 quando a credencial apresentada não vale. */
const CREDENTIAL_CHECKS = new Set([...LOCKABLE, "/api/auth/refresh", "/api/auth/biometric/challenge"]);

/**
 * Documenta no OpenAPI (R88) as respostas de erro de cada rota, deduzidas do que ela declara:
 * entrada validada → 400; login exigido → 401; `:id` → 404; escrita autenticada → 409/422;
 * escrita sujeita à manutenção → 503; limite por IP → 429. Todas usam o formato único
 * { statusCode, code, message, details? }.
 */
export function documentErrorResponses(route: RouteOptions): void {
  const schema = route.schema as (FastifySchema & { hide?: boolean; security?: unknown[] }) | undefined;
  if (!schema || schema.hide) return;

  const methods = Array.isArray(route.method) ? route.method : [route.method];
  const writes = methods.some((method) => MUTATING_METHODS.has(method));
  const codes = new Set<number>();

  if (schema.body || schema.querystring || schema.params || schema.headers) codes.add(400);
  if (schema.body) codes.add(415);
  if (schema.security || CREDENTIAL_CHECKS.has(route.url)) codes.add(401);
  if (route.url.startsWith("/api/admin")) codes.add(403);
  if (schema.params) codes.add(404);
  if (writes && schema.security) {
    codes.add(409);
    codes.add(422);
  }
  if (writes && !isMaintenanceExempt(route.url)) codes.add(503);
  if ((route.config as { rateLimit?: unknown } | undefined)?.rateLimit) codes.add(429);
  if (LOCKABLE.has(route.url)) codes.add(423);

  const documented = Object.fromEntries(
    [...codes].sort().map((code) => [code, errorResponse.meta({ description: DESCRIPTIONS[code] })]),
  );
  route.schema = { ...schema, response: { ...documented, ...(schema.response as object | undefined) } };
}
