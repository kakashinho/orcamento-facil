import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  date,
  index,
  numeric,
  pgTable,
  primaryKey,
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

export const WALLET_TYPES = ["checking", "savings", "cash", "investment", "credit_card", "other"] as const;
export const TRANSACTION_TYPES = ["income", "expense"] as const;

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

/** Categorias predefinidas têm `user_id` nulo e `system_key`; personalizadas pertencem a um usuário. */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    systemKey: varchar("system_key", { length: 40 }),
    name: varchar("name", { length: 60 }).notNull(),
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
  ],
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
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
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
