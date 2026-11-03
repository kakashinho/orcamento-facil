import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// Notificações (R22, R47, R67, R74, R78, R68, R18, R34): caixa do app, aparelhos para push e
// preferências de aviso. Título e texto NUNCA levam valores em dinheiro (ADR-S2-005): o detalhe
// fica na tela da entidade.

export const NOTIFICATION_KINDS = [
  "budget_warning",
  "budget_exceeded",
  "daily_limit_exceeded",
  "reduction_exceeded",
  "unusual_transaction",
  "low_balance",
  "goal_achieved",
  "goal_deadline",
  "daily_reminder",
  "bill_reminder",
] as const;

const kindList = NOTIFICATION_KINDS.map((kind) => `'${kind}'`).join(", ");

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 40 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    body: varchar("body", { length: 300 }).notNull(),
    // Sem FK: o aviso sobrevive à exclusão da entidade (o app só não navega mais até ela).
    entityType: varchar("entity_type", { length: 20 }),
    entityId: uuid("entity_id"),
    data: jsonb("data"),
    // Mesma chave = mesmo aviso: reavaliar um alerta nunca duplica a notificação.
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    pushStatus: varchar("push_status", { length: 10 }).notNull().default("none"),
    pushAttempts: smallint("push_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("notifications_kind_check", sql`${t.kind} in (${sql.raw(kindList)})`),
    check("notifications_push_status_check", sql`${t.pushStatus} in ('none', 'pending', 'sent', 'failed', 'skipped')`),
    uniqueIndex("notifications_user_dedupe_uq").on(t.userId, t.dedupeKey),
    index("notifications_user_created_idx").on(t.userId, t.createdAt.desc(), t.id.desc()),
    index("notifications_unread_idx").on(t.userId).where(sql`${t.readAt} is null`),
    index("notifications_push_pending_idx").on(t.createdAt).where(sql`${t.pushStatus} = 'pending'`),
  ],
);

/** Aparelhos que recebem push (R18): token do FCM, transferido para quem fizer login no aparelho. */
export const pushDevices = pgTable(
  "push_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 10 }).notNull().default("android"),
    deviceName: varchar("device_name", { length: 80 }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("push_devices_token_uq").on(t.token),
    index("push_devices_user_idx").on(t.userId).where(sql`${t.revokedAt} is null`),
    check("push_devices_platform_check", sql`${t.platform} in ('android')`),
  ],
);

/** Preferências de aviso (R18, R34). Linha ausente = padrões. */
export const notificationSettings = pgTable(
  "notification_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyReminderEnabled: boolean("daily_reminder_enabled").notNull().default(true),
    dailyReminderHour: smallint("daily_reminder_hour").notNull().default(20),
    goalRemindersEnabled: boolean("goal_reminders_enabled").notNull().default(true),
    billRemindersEnabled: boolean("bill_reminders_enabled").notNull().default(true),
    alertsPushEnabled: boolean("alerts_push_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("notification_settings_hour_check", sql`${t.dailyReminderHour} between 0 and 23`)],
);
