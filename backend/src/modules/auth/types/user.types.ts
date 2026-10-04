import type { users } from "../../../infrastructure/database/schema.js";

/** Linha da tabela `users`, como o repository devolve. */
export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;

export type UserRole = "user" | "admin";

/** Preferências do usuário que outros módulos podem consultar (contrato público do auth). */
export interface UserPreferences {
  userId: string;
  username: string;
  primaryCurrency: string;
  timezone: string;
}

export interface UpdateProfileInput {
  username?: string | undefined;
  primaryCurrency?: string | undefined;
  timezone?: string | undefined;
}
