import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { transactions } from "./finance.js";
import { bytea } from "./types.js";
import { users } from "./users.js";

/**
 * Anexos das transações (R24, R25, R76): fotos, documentos e comprovantes, guardados cifrados no
 * próprio banco (ADR-S2-009) — um só lugar para o backup da Sprint 3. Somem com a exclusão
 * definitiva da transação; na exclusão lógica ficam guardados para o desfazer.
 */
export const transactionAttachments = pgTable(
  "transaction_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 10 }).notNull(),
    fileName: varchar("file_name", { length: 120 }).notNull(),
    mimeType: varchar("mime_type", { length: 80 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytea("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("transaction_attachments_kind_check", sql`${t.kind} in ('photo', 'document', 'receipt')`),
    check(
      "transaction_attachments_mime_check",
      sql`${t.mimeType} in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')`,
    ),
    check("transaction_attachments_size_check", sql`${t.sizeBytes} between 1 and 5242880`),
    index("transaction_attachments_tx_idx").on(t.transactionId),
    index("transaction_attachments_user_idx").on(t.userId),
  ],
);
