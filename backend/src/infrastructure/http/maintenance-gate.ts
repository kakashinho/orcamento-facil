import type { FastifyRequest } from "fastify";
import { errors } from "../../shared/errors/app-error.js";

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Escritas liberadas durante a manutenção: entrar e sair da conta, e a própria administração. */
const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
  "/api/auth/logout-all",
  "/api/auth/biometric/challenge",
  "/api/auth/biometric/login",
]);

export function isMaintenanceExempt(path: string): boolean {
  return (
    EXEMPT_PATHS.has(path) || path.startsWith("/api/admin/") || !(path.startsWith("/api/") || path === "/reset-password")
  );
}

/**
 * R72: durante a manutenção, operações que alteram dados são recusadas com 503 e a mensagem
 * configurada; consultas, login e administração continuam funcionando.
 */
export function createMaintenanceGate(
  getState: () => Promise<{ enabled: boolean; message: string | null }>,
  defaultMessage: string,
) {
  return async function maintenanceGate(request: FastifyRequest): Promise<void> {
    if (!MUTATING_METHODS.has(request.method)) return;
    const path = request.url.split("?")[0] ?? "";
    if (isMaintenanceExempt(path)) return;
    const state = await getState();
    if (state.enabled) throw errors.maintenance(state.message ?? defaultMessage);
  };
}
