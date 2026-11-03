import { NOTIFICATION_KINDS } from "../../../infrastructure/database/schema.js";

export { NOTIFICATION_KINDS };
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Alertas de risco (R22, R47, R67, R74, R78) e conquista (R68): push conforme `alertsPushEnabled`. */
export const ALERT_KINDS: ReadonlySet<NotificationKind> = new Set([
  "budget_warning",
  "budget_exceeded",
  "daily_limit_exceeded",
  "reduction_exceeded",
  "unusual_transaction",
  "low_balance",
  "goal_achieved",
]);

export type NotificationEntityType = "budget" | "reduction_goal" | "savings_goal" | "wallet" | "transaction" | "reminder";
export type PushStatus = "none" | "pending" | "sent" | "failed" | "skipped";

/** O que um módulo pede para avisar. Título e texto sem valores em dinheiro (ADR-S2-005). */
export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType?: NotificationEntityType;
  entityId?: string;
  /** Só dados não monetários: mês, percentual, ids. */
  data?: Record<string, string | number | boolean | null>;
  /** Mesma chave = mesmo aviso (ex.: `budget:<id>:2026-10:80`). */
  dedupeKey: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entityType: NotificationEntityType | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  dedupeKey: string;
  readAt: Date | null;
  pushStatus: PushStatus;
  pushAttempts: number;
  createdAt: Date;
}

export interface NotificationSettings {
  dailyReminderEnabled: boolean;
  dailyReminderHour: number;
  goalRemindersEnabled: boolean;
  billRemindersEnabled: boolean;
  alertsPushEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dailyReminderEnabled: true,
  dailyReminderHour: 20,
  goalRemindersEnabled: true,
  billRemindersEnabled: true,
  alertsPushEnabled: true,
};

/** Retenção (D-64): lidas por 90 dias, não lidas por 180; aparelhos revogados por 30. */
export const READ_RETENTION_DAYS = 90;
export const UNREAD_RETENTION_DAYS = 180;
export const REVOKED_DEVICE_RETENTION_DAYS = 30;
