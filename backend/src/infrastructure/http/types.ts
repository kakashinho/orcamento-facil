import type {
  ContextConfigDefault,
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
  RouteGenericInterface,
} from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/**
 * Request já validado pelo schema `S`: `request.body`, `request.query` e `request.params`
 * chegam ao controller com os tipos dos DTOs declarados em `schemas/`.
 */
export type ZodRequest<S extends FastifySchema> = FastifyRequest<
  RouteGenericInterface,
  RawServerDefault,
  RawRequestDefaultExpression,
  S,
  ZodTypeProvider
>;

/** Reply cujo `send()` só aceita o DTO de resposta declarado no schema `S`. */
export type ZodReply<S extends FastifySchema> = FastifyReply<
  RouteGenericInterface,
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  ContextConfigDefault,
  S,
  ZodTypeProvider
>;

export type RequestHook = (request: FastifyRequest) => Promise<void>;

/** Proteções reutilizadas pelas rotas: autenticação, perfil de admin e limite por IP. */
export interface HttpGuards {
  authenticate: RequestHook;
  requireAdmin: RequestHook;
  authRateLimit: { rateLimit: { max: number; timeWindow: string } };
}

export interface AuthContext {
  userId: string;
  role: "user" | "admin";
  /** Família da sessão (login) — usada para revogação. */
  sessionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
