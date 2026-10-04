import { errors } from "./errors.js";

/**
 * Cursores opacos para rolagem infinita (R09). O conteúdo é JSON em base64url;
 * o cliente apenas devolve o `nextCursor` recebido.
 */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string,
  isValid: (value: Record<string, unknown>) => boolean,
): T {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value) && isValid(value as Record<string, unknown>)) {
      return value as T;
    }
  } catch {
    // cai no erro abaixo
  }
  throw errors.validation("Cursor de paginação inválido.");
}
