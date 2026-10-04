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

/** Onde está o campo com problema — o mesmo formato dos erros de schema (DTO). */
export type FieldLocation = "body" | "querystring" | "params" | "headers";

/** Item de `details` que aponta um campo: o app usa `path` para marcar o campo do formulário. */
export interface FieldIssue {
  location: FieldLocation;
  path?: string;
  message: string;
}

export function fieldIssue(path: string, message: string, location: FieldLocation = "body"): FieldIssue {
  return { location, path, message };
}

const INVALID_REQUEST = "Dados inválidos na requisição.";
const BEARER = 'Bearer realm="api"';
const BEARER_INVALID = 'Bearer realm="api", error="invalid_token"';

export const errors = {
  validation: (message: string = INVALID_REQUEST, details?: FieldIssue[]) =>
    new AppError(400, "VALIDATION_ERROR", message, { details }),
  /** Regra de campo verificada no service (ex.: valor de destino diferente do de origem). */
  invalidField: (path: string, message: string, location: FieldLocation = "body") =>
    new AppError(400, "VALIDATION_ERROR", INVALID_REQUEST, { details: [fieldIssue(path, message, location)] }),
  unauthorized: (message = "Faça login para continuar.") =>
    new AppError(401, "UNAUTHORIZED", message, { headers: { "www-authenticate": BEARER } }),
  invalidCredentials: () => new AppError(401, "INVALID_CREDENTIALS", "E-mail/usuário ou senha inválidos."),
  invalidToken: (message = "Token de acesso inválido. Faça login novamente.") =>
    new AppError(401, "INVALID_TOKEN", message, { headers: { "www-authenticate": BEARER_INVALID } }),
  /** Access token válido, mas vencido: o app deve chamar /api/auth/refresh e repetir a requisição. */
  tokenExpired: () =>
    new AppError(401, "TOKEN_EXPIRED", "O token de acesso expirou. Renove a sessão.", {
      headers: { "www-authenticate": BEARER_INVALID },
    }),
  /** A sessão foi encerrada (logout, troca/recuperação de senha, reuso de refresh token). */
  sessionRevoked: () =>
    new AppError(401, "SESSION_REVOKED", "Sessão encerrada. Faça login novamente.", {
      headers: { "www-authenticate": BEARER_INVALID },
    }),
  forbidden: (message = "Você não tem permissão para esta operação.") =>
    new AppError(403, "FORBIDDEN", message),
  notFound: (resource: string) => new AppError(404, "NOT_FOUND", `${resource} não encontrado(a).`),
  conflict: (code: string, message: string, details?: unknown) =>
    new AppError(409, code, message, { details }),
  /** Regra de negócio não atendida; `field` aponta o campo do corpo que a causou. */
  unprocessable: (code: string, message: string, field?: string) =>
    new AppError(422, code, message, field ? { details: [fieldIssue(field, message)] } : {}),
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
