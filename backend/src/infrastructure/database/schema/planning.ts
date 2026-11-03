import { sql } from "drizzle-orm";
import { char, check, date, index, pgTable, smallint, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { categories, transactions } from "./finance.js";
import { bytea } from "./types.js";
import { users } from "./users.js";

// Planejamento financeiro: orçamentos e limites diários por categoria (R21, R74, R23) e metas de
// redução de gastos (R67).
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

/**
 * Meta de redução de gastos numa categoria (R67). A base (média mensal dos 3 meses anteriores ao
 * início) é calculada uma vez e guardada cifrada; o alvo do mês sai dela e do percentual.
 */
export const reductionGoals = pgTable(
  "reduction_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    percent: smallint("percent").notNull(),
    baselineAmount: bytea("baseline_amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    baselineMonths: smallint("baseline_months").notNull().default(3),
    startMonth: char("start_month", { length: 7 }).notNull(),
    endMonth: char("end_month", { length: 7 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("reduction_goals_percent_check", sql`${t.percent} between 1 and 90`),
    check("reduction_goals_months_check", sql`${t.endMonth} is null or ${t.endMonth} >= ${t.startMonth}`),
    uniqueIndex("reduction_goals_active_uq").on(t.userId, t.categoryId).where(sql`${t.endMonth} is null`),
  ],
);

/**
 * Meta de economia (R15): valor alvo, data limite e categoria. O progresso (R16) não é gravado:
 * sai dos vínculos com receitas, calculado na leitura (ADR-S2-007).
 */
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    targetAmount: bytea("target_amount").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    deadline: date("deadline", { mode: "string" }).notNull(),
    status: varchar("status", { length: 10 }).notNull().default("active"),
    achievedAt: timestamp("achieved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("savings_goals_status_check", sql`${t.status} in ('active', 'achieved', 'cancelled')`),
    index("savings_goals_user_idx").on(t.userId, t.status),
  ],
);

/**
 * Parte de uma receita destinada a uma meta (R17). O dinheiro continua na carteira (D-03); a
 * receita só conta enquanto existir e for receita, e no máximo pelo valor dela.
 */
export const goalContributions = pgTable(
  "goal_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    // Na moeda da carteira da receita.
    amount: bytea("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goal_contributions_goal_tx_uq").on(t.goalId, t.transactionId),
    index("goal_contributions_tx_idx").on(t.transactionId),
  ],
);
