import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  char,
  integer,
  boolean,
  timestamp,
  text,
  date,
  customType,
  decimal,
  index,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";

// Valor financeiro cifrado é persistido em BYTEA (contrato TARGET,
// matriz CRYPTO / DECISION-003). node-postgres materializa BYTEA como Buffer,
// que é um Uint8Array — tipado aqui como Uint8Array para não depender do global Buffer.
const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

// Fatia Finance do TARGET ratificado (sprint-1-target-contract.md):
// wallets, categories, tags, transaction_tags, transactions, transfers.

// ===== WALLETS =====
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    balance: bytea("balance").notNull(),
    balanceKeyVersion: integer("balance_key_version").notNull(),
    minimumBalance: bytea("minimum_balance"),
    minimumBalanceKeyVersion: integer("minimum_balance_key_version"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wallets_user_id_idx").on(table.userId),
    unique("wallets_user_id_name_unique").on(table.userId, table.name),
  ],
);

// ===== CATEGORIES =====
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    hideInReports: boolean("hide_in_reports").default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  () => [
    // UNIQUE (owner_id, lower(name)) WHERE owner_id IS NOT NULL AND deleted_at IS NULL
    // será implementado via migration customizada, pois Drizzle ORM não suporta
    // unique com lower() e condição parcial diretamente.
  ],
);

// ===== TAGS =====
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // UNIQUE (owner_id, lower(name)) será implementado via migration customizada,
    // pois Drizzle ORM não suporta unique com lower() diretamente.
    unique("tags_owner_id_name_unique").on(table.ownerId, table.name),
  ],
);

// ===== TRANSACTIONS =====
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    amount: bytea("amount").notNull(),
    amountKeyVersion: integer("amount_key_version").notNull(),
    date: date("date").notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    type: varchar("type", { length: 10 }).notNull(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    recurring: boolean("recurring").notNull().default(false),
    frequency: varchar("frequency", { length: 10 }),
    archived: boolean("archived").notNull().default(false),
    observations: text("observations"),
    // savings_goal_id FK será adicionado quando savings_goals for definido em outra TASK
    savingsGoalId: uuid("savings_goal_id"),
    installmentCount: integer("installment_count"),
    totalAmount: bytea("total_amount"),
    totalAmountKeyVersion: integer("total_amount_key_version"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "transactions_type_check",
      sql`${table.type} in ('income', 'expense')`,
    ),
    check(
      "transactions_frequency_check",
      sql`${table.frequency} IS NULL OR ${table.frequency} in ('monthly', 'weekly', 'yearly')`,
    ),
    index("transactions_user_id_date_created_at_id_idx").on(
      table.userId,
      table.date.desc(),
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index("transactions_wallet_id_idx").on(table.walletId),
    index("transactions_user_id_category_id_idx").on(
      table.userId,
      table.categoryId,
    ),
    index("transactions_user_id_date_idx").on(table.userId, table.date),
    index("transactions_user_id_archived_partial_idx")
      .on(table.userId, table.archived)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

// ===== TRANSACTION_TAGS =====
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
  (table) => [
    { primaryKey: { columns: [table.transactionId, table.tagId] } },
    index("transaction_tags_tag_id_idx").on(table.tagId),
  ],
);

// ===== TRANSFERS =====
export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey(),
    sourceWalletId: uuid("source_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    targetWalletId: uuid("target_wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    sourceAmount: bytea("source_amount").notNull(),
    sourceAmountKeyVersion: integer("source_amount_key_version").notNull(),
    sourceCurrency: char("source_currency", { length: 3 }).notNull(),
    targetAmount: bytea("target_amount").notNull(),
    targetAmountKeyVersion: integer("target_amount_key_version").notNull(),
    targetCurrency: char("target_currency", { length: 3 }).notNull(),
    exchangeRate: decimal("exchange_rate", { precision: 18, scale: 8 }),
    rateSource: varchar("rate_source", { length: 40 }),
    rateQuotedAt: timestamp("rate_quoted_at", { withTimezone: true }),
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "transfers_source_target_check",
      sql`${table.sourceWalletId} <> ${table.targetWalletId}`,
    ),
    unique("transfers_idempotency_key_unique").on(table.idempotencyKey),
    index("transfers_source_wallet_id_idx").on(table.sourceWalletId),
    index("transfers_target_wallet_id_idx").on(table.targetWalletId),
  ],
);
