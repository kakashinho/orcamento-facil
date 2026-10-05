/**
 * Erro padronizado do app. Espelha o formato único de erro da API
 * `{ statusCode, code, message, details? }` e acrescenta os casos sem resposta
 * (sem conexão e tempo esgotado), que recebem status 0.
 */
export interface FieldIssue {
  location?: string;
  path?: string;
  message: string;
}

export const NETWORK_ERROR = "NETWORK_ERROR";
export const TIMEOUT = "TIMEOUT";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Sem resposta do servidor (offline, DNS, tempo esgotado). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Erros por campo (`details[].path`) prontos para exibir abaixo de cada campo do formulário. */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    if (!Array.isArray(this.details)) return result;
    for (const issue of this.details as FieldIssue[]) {
      if (issue && typeof issue.path === "string" && issue.path && !(issue.path in result)) {
        result[issue.path] = issue.message;
      }
    }
    return result;
  }

  /** Segundos até liberar o login após o bloqueio (R87), quando informados pela API. */
  get retryAfterSeconds(): number | null {
    const details = this.details as { retryAfterSeconds?: unknown } | undefined;
    return typeof details?.retryAfterSeconds === "number" ? details.retryAfterSeconds : null;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Mensagem para o usuário a partir de qualquer erro. */
export function errorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente."): string {
  if (isApiError(error)) return error.message || fallback;
  return fallback;
}

/** Erros por campo de qualquer erro (vazio se não for erro da API). */
export function fieldErrorsOf(error: unknown): Record<string, string> {
  return isApiError(error) ? error.fieldErrors : {};
}
