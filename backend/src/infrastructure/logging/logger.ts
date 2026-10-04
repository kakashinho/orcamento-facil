import { pino, stdSerializers, type Logger } from "pino";

export type { Logger };

const SENSITIVE_QUERY_PARAMS = ["token", "refreshToken", "password"];

/** Remove valores de parâmetros sensíveis da URL antes de logar (ex.: link de reset de senha). */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf("?");
  if (queryStart === -1) return url;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  for (const name of SENSITIVE_QUERY_PARAMS) {
    if (params.has(name)) params.set(name, "[REDACTED]");
  }
  return `${url.slice(0, queryStart)}?${params.toString()}`;
}

interface LoggableRequest {
  method?: string;
  url?: string;
  ip?: string;
  hostname?: string;
  headers?: Record<string, unknown>;
}

/**
 * Logger estruturado (JSON) da aplicação — R85. Dados sensíveis (cabeçalho de
 * autorização, senhas, tokens) são removidos dos registros.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { service: "orcamento-facil-api" },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.password",
        "*.newPassword",
        "*.currentPassword",
        "*.refreshToken",
        "*.token",
      ],
      censor: "[REDACTED]",
    },
    serializers: {
      err: stdSerializers.err,
      req: (req: LoggableRequest) => ({
        method: req.method,
        url: req.url ? redactUrl(req.url) : undefined,
        host: req.hostname,
        remoteAddress: req.ip,
        userAgent: req.headers?.["user-agent"],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
