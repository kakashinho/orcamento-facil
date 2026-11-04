import type { AppNotification, NotificationEntityType, NotificationKind } from "@/data/api/types";

/** Rota do Expo Router (texto ou caminho com parâmetros). */
export type NotificationHref = string | { pathname: string; params: Record<string, string> };

/** Para onde o app vai ao tocar num aviso, na caixa de notificações ou no push (R22, R47, R68, R78, R18, R34). */
export type NotificationTarget =
  { type: "route"; href: NotificationHref } | { type: "transaction"; id: string } | { type: "newTransaction" };

/** Campos do aviso que decidem o destino. */
export interface NotificationRef {
  kind: NotificationKind | null;
  entityType: NotificationEntityType | null;
  entityId: string | null;
}

const ENTITY_TYPES: readonly NotificationEntityType[] = [
  "budget",
  "reduction_goal",
  "savings_goal",
  "wallet",
  "transaction",
  "reminder",
];

const KINDS: readonly NotificationKind[] = [
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
];

const planning = (params: Record<string, string>): NotificationTarget => ({
  type: "route",
  href: { pathname: "/planning", params },
});

/**
 * Destino de um aviso: orçamento e meta de redução → Planejamento › Orçamentos; meta de economia →
 * Planejamento › Metas (com o id para abrir o detalhe); lembrete de conta → Planejamento › Contas;
 * carteira → Carteiras; transação → detalhes da transação; lembrete diário (sem entidade) → nova
 * transação. Sem destino conhecido devolve `null` (o toque só marca como lido).
 */
export function notificationTarget(ref: NotificationRef): NotificationTarget | null {
  switch (ref.entityType) {
    case "budget":
    case "reduction_goal":
      return planning({ section: "budgets" });
    case "savings_goal":
      return planning(ref.entityId ? { section: "goals", goalId: ref.entityId } : { section: "goals" });
    case "reminder":
      return planning({ section: "accounts" });
    case "wallet":
      return { type: "route", href: "/wallets" };
    case "transaction":
      return ref.entityId ? { type: "transaction", id: ref.entityId } : null;
    default:
      return ref.kind === "daily_reminder" ? { type: "newTransaction" } : null;
  }
}

export function targetOf(notification: AppNotification): NotificationTarget | null {
  return notificationTarget(notification);
}

/** Dados de um push recebido, já validados. */
export interface PushData extends NotificationRef {
  notificationId: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Lê os campos `data` que o servidor manda no push (FCM: `notificationId`, `kind`, `entityType`,
 * `entityId`, todos texto; vazio = sem valor). Valores desconhecidos viram `null`.
 */
export function parsePushData(data: Record<string, unknown> | null | undefined): PushData {
  const entityType = text(data?.entityType);
  const kind = text(data?.kind);
  return {
    notificationId: text(data?.notificationId),
    kind: KINDS.includes(kind as NotificationKind) ? (kind as NotificationKind) : null,
    entityType: ENTITY_TYPES.includes(entityType as NotificationEntityType)
      ? (entityType as NotificationEntityType)
      : null,
    entityId: text(data?.entityId),
  };
}
