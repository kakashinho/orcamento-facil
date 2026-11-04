import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { bytea } from "./types.js";
import { users } from "./users.js";

// Domínio financeiro: carteiras (R53, R55, R56), categorias (R07, R08), tags (R43),
// transações (R06, R09–R12, R26, R48, R52, R70) e transferências (R54).
// Valores monetários são cifrados na aplicação (R81): colunas BYTEA, nunca em claro.


export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("other"),
    currency: char("currency", { length: 3 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    // Saldo materializado e saldo inicial, ambos cifrados. O saldo é atualizado na mesma
    // transação de banco do movimento, com bloqueio de linha (SELECT ... FOR UPDATE).
    initialBalance: bytea("initial_balance").notNull(),
    balance: bytea("balance").notNull(),
    // Saldo mínimo opcional (R78), cifrado; abaixo dele o usuário recebe alerta. Pode ser negativo.
    minBalance: bytea("min_balance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("wallets_user_name_uq").on(t.userId, sql`lower(${t.name})`),
    uniqueIndex("wallets_user_default_uq").on(t.userId).where(sql`${t.isDefault}`),
    check(
      "wallets_type_check",
      sql`${t.type} in ('checking', 'savings', 'cash', 'investment', 'credit_card', 'other')`,
    ),
  ],
);

/**
 * Categorias predefinidas têm `user_id` nulo e `system_key`; personalizadas pertencem a um usuário.
 * `type` restringe a categoria a receitas ou despesas; nulo vale para as duas (ex.: "Outros").
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    systemKey: varchar("system_key", { length: 40 }),
    name: varchar("name", { length: 60 }).notNull(),
    type: varchar("type", { length: 10 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_system_key_uq").on(t.systemKey),
    uniqueIndex("categories_user_name_uq")
      .on(t.userId, sql`lower(${t.name})`)
      .where(sql`${t.userId} is not null and ${t.deletedAt} is null`),
    index("categories_user_id_idx").on(t.userId),
    check("categories_owner_check", sql`(${t.userId} is null) = (${t.systemKey} is not null)`),
    check("categories_type_check", sql`${t.type} is null or ${t.type} in ('income', 'expense')`),
  ],
);

/**
 * Preferências do usuário sobre categorias (R46). Linha à parte porque as predefinidas são globais:
 * ocultar "Alimentação" vale só para quem ocultou. Linha ausente = visível.
 */
export const categoryPreferences = pgTable(
  "category_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    hiddenInReports: boolean("hidden_in_reports").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.categoryId] })],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tags_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

/**
 * Recorrência (R37) ou parcelamento (R62): o plano das ocorrências. Cada ocorrência só vira
 * transação quando a data chega, gerada pelo `TransactionService`; o saldo e os
 * relatórios atuais não mudam de significado.
 */
export const transactionSeries = pgTable(
  "transaction_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 12 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(),
    frequency: varchar("frequency", { length: 10 }).notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    description: varchar("description", { length: 200 }).notNull(),
    tagIds: uuid("tag_ids").array().notNull().default(sql`'{}'::uuid[]`),
    // Recorrência: valor de cada ocorrência. Parcelamento: valor total (a sobra vai na 1ª parcela).
    amount: bytea("amount").notNull(),
    installments: smallint("installments"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    // Dia original: 31/01 mensal cai em 28/02 e volta a 31/03.
    anchorDay: smallint("anchor_day").notNull(),
    endDate: date("end_date", { mode: "string" }),
    nextDate: date("next_date", { mode: "string" }),
    generatedCount: integer("generated_count").notNull().default(0),
    status: varchar("status", { length: 10 }).notNull().default("active"),
    // Chave enviada pelo app (Idempotency-Key): repetir a criação devolve a mesma série.
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transaction_series_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    check("transaction_series_kind_check", sql`${t.kind} in ('recurring', 'installment')`),
    check("transaction_series_type_check", sql`${t.type} in ('income', 'expense')`),
    check("transaction_series_frequency_check", sql`${t.frequency} in ('weekly', 'monthly', 'yearly')`),
    check("transaction_series_status_check", sql`${t.status} in ('active', 'ended', 'cancelled')`),
    check("transaction_series_anchor_check", sql`${t.anchorDay} between 1 and 31`),
    check("transaction_series_installments_check", sql`(${t.kind} = 'installment') = (${t.installments} is not null)`),
    check(
      "transaction_series_installment_shape_check",
      sql`${t.kind} <> 'installment' or (${t.type} = 'expense' and ${t.frequency} = 'monthly' and ${t.endDate} is null and ${t.installments} between 2 and 72)`,
    ),
    index("transaction_series_due_idx").on(t.nextDate).where(sql`${t.status} = 'active'`),
    index("transaction_series_user_idx").on(t.userId, t.status),
    index("transaction_series_wallet_idx").on(t.walletId),
  ],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    type: varchar("type", { length: 10 }).notNull(),
    amount: bytea("amount").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    // Nota livre (R57), cifrada: texto livre pode conter dados sensíveis e não entra na busca (R10).
    notes: bytea("notes"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    // Série que gerou a transação (R37, R62) e o número da ocorrência/parcela.
    seriesId: uuid("series_id").references(() => transactionSeries.id, { onDelete: "set null" }),
    seriesOccurrence: integer("series_occurrence"),
    // Exclusão lógica: preserva o registro para o "desfazer" (R49).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("transactions_type_check", sql`${t.type} in ('income', 'expense')`),
    // R09: lista cronológica inversa com rolagem infinita (keyset pagination).
    index("transactions_user_date_idx")
      .on(t.userId, t.date.desc(), t.createdAt.desc(), t.id.desc())
      .where(sql`${t.deletedAt} is null`),
    index("transactions_wallet_idx").on(t.walletId),
    index("transactions_user_category_idx").on(t.userId, t.categoryId),
    // Uma ocorrência por número: gerar duas vezes é inofensivo.
    uniqueIndex("transactions_series_occurrence_uq")
      .on(t.seriesId, t.seriesOccurrence)
      .where(sql`${t.seriesId} is not null`),
  ],
);

export const transactionTags = pgTable(
  "transaction_tags",
  {
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.transactionId, t.tagId] }),
    index("transaction_tags_tag_idx").on(t.tagId),
  ],
);

/** Transferência entre carteiras (R54): movimento interno, nunca receita nem despesa. */
export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceWalletId: uuid("source_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    targetWalletId: uuid("target_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    sourceAmount: bytea("source_amount").notNull(),
    targetAmount: bytea("target_amount").notNull(),
    // Taxa aplicada quando as moedas diferem (R29/R56); nula quando são iguais.
    exchangeRate: numeric("exchange_rate", { precision: 24, scale: 12 }),
    date: date("date", { mode: "string" }).notNull(),
    description: varchar("description", { length: 200 }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("transfers_distinct_wallets_check", sql`${t.sourceWalletId} <> ${t.targetWalletId}`),
    uniqueIndex("transfers_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    index("transfers_user_date_idx").on(t.userId, t.date.desc(), t.createdAt.desc()),
    index("transfers_source_wallet_idx").on(t.sourceWalletId),
    index("transfers_target_wallet_idx").on(t.targetWalletId),
  ],
);
