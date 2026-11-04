import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";
import { notifications } from "../../../infrastructure/database/schema.js";
import type {
  NotificationEntityType,
  NotificationKind,
  NotificationRecord,
  NotifyInput,
  PushStatus,
} from "../types/notification.types.js";

type NotificationRow = typeof notifications.$inferSelect;

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    entityType: row.entityType as NotificationEntityType | null,
    entityId: row.entityId,
    data: (row.data as Record<string, unknown> | null) ?? null,
    dedupeKey: row.dedupeKey,
    readAt: row.readAt,
    pushStatus: row.pushStatus as PushStatus,
    pushAttempts: row.pushAttempts,
    createdAt: row.createdAt,
  };
}

/** Caixa de notificações. Nunca guarda valores em dinheiro (os textos chegam prontos sem eles). */
export class NotificationRepository extends Repository {
  /** Grava o aviso; se a chave já existe para o usuário, não faz nada e devolve undefined. */
  async insertIfNew(input: NotifyInput, now: Date): Promise<NotificationRecord | undefined> {
    const [row] = await this.db
      .insert(notifications)
      .values({
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        data: input.data ?? null,
        dedupeKey: input.dedupeKey,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning();
    return row ? toRecord(row) : undefined;
  }

  /** Mais recentes primeiro, com paginação por keyset `(created_at, id)`. */
  async list(
    userId: string,
    options: { unread: boolean; limit: number; after?: { createdAt: string; id: string } },
  ): Promise<{ items: NotificationRecord[]; hasMore: boolean }> {
    const conditions = [eq(notifications.userId, userId)];
    if (options.unread) conditions.push(isNull(notifications.readAt));
    if (options.after) {
      const at = new Date(options.after.createdAt);
      conditions.push(
        or(lt(notifications.createdAt, at), and(eq(notifications.createdAt, at), lt(notifications.id, options.after.id)))!,
      );
    }
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(options.limit + 1);
    return { items: rows.slice(0, options.limit).map(toRecord), hasMore: rows.length > options.limit };
  }

  async countUnread(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.value ?? 0;
  }

  async markRead(userId: string, notificationId: string, now: Date): Promise<NotificationRecord | undefined> {
    await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.readAt)));
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    return row ? toRecord(row) : undefined;
  }

  async markAllRead(userId: string, now: Date): Promise<number> {
    const result = await this.db
      .update(notifications)
      .set({ readAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return result.rowCount ?? 0;
  }

  async setPushStatus(notificationId: string, status: PushStatus, attempts: number): Promise<void> {
    await this.db.update(notifications).set({ pushStatus: status, pushAttempts: attempts }).where(eq(notifications.id, notificationId));
  }

  /** Avisos com push pendente criados antes de `before` (reenvio). */
  async listPushPending(before: Date, limit: number): Promise<NotificationRecord[]> {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.pushStatus, "pending"), lt(notifications.createdAt, before)))
      .orderBy(notifications.createdAt)
      .limit(limit);
    return rows.map(toRecord);
  }

  /** Remove lidas antes de `readBefore` e não lidas criadas antes de `unreadBefore`. */
  async purge(readBefore: Date, unreadBefore: Date): Promise<number> {
    const result = await this.db
      .delete(notifications)
      .where(
        or(
          and(isNotNull(notifications.readAt), lt(notifications.readAt, readBefore)),
          and(isNull(notifications.readAt), lt(notifications.createdAt, unreadBefore)),
        ),
      );
    return result.rowCount ?? 0;
  }
}
