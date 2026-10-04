export interface PgErrorInfo {
  code: string;
  constraint?: string;
}

/**
 * Localiza o erro original do PostgreSQL, mesmo quando encapsulado pelo Drizzle
 * (DrizzleQueryError → cause).
 */
export function findPgError(error: unknown): PgErrorInfo | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return {
        code: candidate.code,
        ...(typeof candidate.constraint === "string" ? { constraint: candidate.constraint } : {}),
      };
    }
    current = candidate.cause;
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
export const PG_INVALID_TEXT_REPRESENTATION = "22P02";

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = findPgError(error);
  return pg?.code === PG_UNIQUE_VIOLATION && (constraint === undefined || pg.constraint === constraint);
}
