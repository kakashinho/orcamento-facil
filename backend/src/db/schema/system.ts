import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** Configuração global de linha única — modo de manutenção (R72). */
export const systemSettings = pgTable(
  "system_settings",
  {
    id: smallint("id").primaryKey().default(1),
    maintenanceEnabled: boolean("maintenance_enabled").notNull().default(false),
    maintenanceMessage: varchar("maintenance_message", { length: 500 }),
    updatedBy: uuid("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("system_settings_singleton_check", sql`${t.id} = 1`)],
);

/**
 * Eventos importantes e erros persistidos para monitoramento (R85). Sem FK para
 * usuários: o registro sobrevive à exclusão da conta. Nunca contém valores
 * financeiros, senhas ou tokens.
 */
export const appLogs = pgTable(
  "app_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: varchar("level", { length: 10 }).notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    message: text("message"),
    context: jsonb("context"),
    userId: uuid("user_id"),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("app_logs_created_idx").on(t.createdAt.desc()),
    index("app_logs_event_idx").on(t.event, t.createdAt.desc()),
  ],
);
