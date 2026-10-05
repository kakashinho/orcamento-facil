/**
 * Registro de erros e eventos importantes do app (R85).
 *
 * - Eventos com nome estável (ex.: "auth.login_succeeded", "http.server_error") e contexto;
 * - dados sensíveis (senha, tokens, assinatura) são mascarados antes de qualquer saída;
 * - mantém os últimos registros em memória para diagnóstico e envia cada um ao `sink`
 *   (console em desenvolvimento; avisos e erros em produção, visíveis no logcat do Android).
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  event: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: { name: string; message: string; stack?: string };
}

export interface Logger {
  debug(event: string, context?: Record<string, unknown>): void;
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, error?: unknown, context?: Record<string, unknown>): void;
  entries(): LogEntry[];
  clear(): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /pass(word)?|token|secret|signature|authorization|publickey|challenge/i;

/** Copia o contexto mascarando chaves sensíveis (inclusive em objetos aninhados). */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE.test(key) ? "[redacted]" : redact(item, depth + 1);
  }
  return result;
}

function serializeError(error: unknown): LogEntry["error"] | undefined {
  if (error === undefined || error === null) return undefined;
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "NonError", message: String(error) };
}

export function consoleSink(entry: LogEntry): void {
  const line = `[${entry.level}] ${entry.event}`;
  const extra = entry.error ? { ...entry.context, error: entry.error } : entry.context;
  if (entry.level === "error") console.error(line, extra ?? "");
  else if (entry.level === "warn") console.warn(line, extra ?? "");
  else console.log(line, extra ?? "");
}

export function createLogger(
  options: {
    minLevel?: LogLevel;
    capacity?: number;
    sink?: (entry: LogEntry) => void;
    now?: () => Date;
  } = {},
): Logger {
  const minLevel = options.minLevel ?? "debug";
  const capacity = options.capacity ?? 200;
  const now = options.now ?? (() => new Date());
  let buffer: LogEntry[] = [];

  function write(level: LogLevel, event: string, context?: Record<string, unknown>, error?: unknown) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const entry: LogEntry = {
      level,
      event,
      timestamp: now().toISOString(),
      ...(context ? { context: redact(context) as Record<string, unknown> } : {}),
      ...(error !== undefined ? { error: serializeError(error) } : {}),
    };
    buffer.push(entry);
    if (buffer.length > capacity) buffer = buffer.slice(buffer.length - capacity);
    try {
      options.sink?.(entry);
    } catch {
      // o registro nunca pode derrubar o app
    }
  }

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, error, context) => write("error", event, context, error),
    entries: () => [...buffer],
    clear: () => {
      buffer = [];
    },
  };
}

declare const __DEV__: boolean | undefined;
const isDev = typeof __DEV__ !== "undefined" && __DEV__;

/** Logger do app: tudo em desenvolvimento; eventos (info), avisos e erros em produção. */
export const logger: Logger = createLogger({
  minLevel: isDev ? "debug" : "info",
  sink: process.env.NODE_ENV === "test" ? undefined : consoleSink,
});
