import { bigserial, index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { bytea } from "./types.js";
import { users } from "./users.js";

/**
 * Histórico de ações desfazíveis (R49). O snapshot carrega o estado necessário para
 * reverter a ação e pode conter valores financeiros, por isso é cifrado (R81).
 * `seq` dá a ordem estrita das ações — timestamps podem empatar no mesmo milissegundo.
 */
export const actionHistory = pgTable(
  "action_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 40 }).notNull(),
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: uuid("entity_id"),
    snapshot: bytea("snapshot").notNull(),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("action_history_user_seq_idx").on(t.userId, t.seq.desc()),
    index("action_history_entity_idx").on(t.entityType, t.entityId),
  ],
);
