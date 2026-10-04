import type { users } from "../../../infrastructure/database/schema.js";

/** Linha da tabela `users`, como o repository devolve. */
export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;

/** Tema do app (R42): `system` acompanha a configuração do aparelho. */
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** Preferências do usuário que outros módulos podem consultar (contrato público do auth). */
export interface UserPreferences {
  userId: string;
  username: string;
  primaryCurrency: string;
  timezone: string;
}
