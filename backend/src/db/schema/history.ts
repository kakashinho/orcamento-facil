import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  customType,
  index,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";

// Snapshot cifrado é persistido em BYTEA (contrato TARGET,
// matriz CRYPTO / DECISION-006). node-postgres materializa BYTEA como Buffer,
// que é um Uint8Array — tipado aqui como Uint8Array para não depender do global Buffer.
const bytea = customType<{ data: Uint8Array }>({
  dataType() {
    return "bytea";
  },
});

// Fatia History do TARGET ratificado (sprint-1-target-contract.md):
// action_history — histórico de undo com snapshot autorizado.

export const actionHistory = pgTable(
  "action_history",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 40 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    snapshot: bytea("snapshot").notNull(),
    snapshotKeyVersion: integer("snapshot_key_version").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "action_history_action_check",
      sql`${table.action} in ('update', 'delete')`,
    ),
    index("action_history_user_id_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    index("action_history_entity_type_entity_id_idx").on(
      table.entityType,
      table.entityId,
    ),
  ],
);
