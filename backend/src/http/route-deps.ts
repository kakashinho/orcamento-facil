import type { FastifyRequest } from "fastify";
import type { Container } from "../container.js";

export interface RouteDeps {
  container: Container;
  authenticate: (request: FastifyRequest) => Promise<void>;
}

export function requestMeta(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];
  return { requestId: request.id, userAgent: typeof userAgent === "string" ? userAgent : undefined };
}
