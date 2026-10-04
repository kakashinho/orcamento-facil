/**
 * Erro de domínio com status HTTP e código estável. O `code` é o contrato com o
 * aplicativo (em inglês, constante); a `message` é texto para o usuário final.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: unknown;
  readonly headers: Record<string, string>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers ?? {};
  }
}

export const errors = {
  validation: (message: string, details?: unknown) =>
    new AppError(400, "VALIDATION_ERROR", message, { details }),
  unauthorized: (message = "Autenticação necessária.") => new AppError(401, "UNAUTHORIZED", message),
  invalidCredentials: (remainingAttempts?: number) =>
    new AppError(401, "INVALID_CREDENTIALS", "E-mail/usuário ou senha inválidos.", {
      details: remainingAttempts === undefined ? undefined : { remainingAttempts },
    }),
  invalidToken: (message = "Token inválido ou expirado.") => new AppError(401, "INVALID_TOKEN", message),
  forbidden: (message = "Você não tem permissão para esta operação.") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (resource: string) => new AppError(404, "NOT_FOUND", `${resource} não encontrado(a).`),
  conflict: (code: string, message: string, details?: unknown) =>
    new AppError(409, code, message, { details }),
  unprocessable: (code: string, message: string, details?: unknown) =>
    new AppError(422, code, message, { details }),
  accountLocked: (retryAfterSeconds: number) =>
    new AppError(
      423,
      "ACCOUNT_LOCKED",
      "Conta bloqueada temporariamente após várias tentativas de login sem sucesso. Tente novamente mais tarde.",
      {
        details: { retryAfterSeconds },
        headers: { "retry-after": String(retryAfterSeconds) },
      },
    ),
  maintenance: (message: string) =>
    new AppError(503, "MAINTENANCE_MODE", message, { headers: { "retry-after": "120" } }),
  serviceUnavailable: (code: string, message: string) => new AppError(503, code, message),
};
