import { sql } from "drizzle-orm";
import { char, check, index, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { categories } from "./finance.js";
import { bytea } from "./types.js";
import { users } from "./users.js";

// Planejamento financeiro: orçamentos e limites diários por categoria (R21, R74, R23).
// Valores cifrados na aplicação (R81), como no finance.

const MONTH_PATTERN = "^[0-9]{4}-(0[1-9]|1[0-2])$";

/**
 * Orçamento por categoria com vigência por mês (ADR-S2-006): o limite vale de `valid_from` até
 * `valid_to` (nulo = em vigor). Alterar o valor fecha a vigência atual e abre outra, então o
 * histórico (R23) mostra o limite que valia em cada mês.
 */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 10 }).notNull(),
    amount: bytea("amount").notNull(),
    // Moeda principal do usuário na criação: o gasto é convertido para ela (D-30).
    currency: char("currency", { length: 3 }).notNull(),
    validFrom: char("valid_from", { length: 7 }).notNull(),
    validTo: char("valid_to", { length: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("budgets_period_check", sql`${t.period} in ('monthly', 'daily')`),
    check("budgets_valid_from_check", sql`${t.validFrom} ~ ${sql.raw(`'${MONTH_PATTERN}'`)}`),
    check(
      "budgets_valid_to_check",
      sql`${t.validTo} is null or (${t.validTo} ~ ${sql.raw(`'${MONTH_PATTERN}'`)} and ${t.validTo} >= ${t.validFrom})`,
    ),
    uniqueIndex("budgets_active_uq").on(t.userId, t.categoryId, t.period).where(sql`${t.validTo} is null`),
    index("budgets_user_idx").on(t.userId, t.validFrom),
  ],
);
