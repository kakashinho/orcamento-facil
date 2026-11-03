import type { Clock } from "../../../infrastructure/clock.js";
import { errors } from "../../../shared/errors/app-error.js";
import { decodeCursor, encodeCursor } from "../../../shared/utils/pagination.js";
import type { NotificationRepository } from "../repositories/notification.repository.js";
import type { NotificationSettingsRepository } from "../repositories/notification-settings.repository.js";
import type { PushDeviceRepository } from "../repositories/push-device.repository.js";
import type {
  ListNotificationsQueryDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  NotificationSettingsResponseDto,
  UpdateNotificationSettingsRequestDto,
} from "../schemas/notification.schema.js";
import {
  type NotificationRecord,
  type NotificationSettings,
  type NotifyInput,
  READ_RETENTION_DAYS,
  REVOKED_DEVICE_RETENTION_DAYS,
  UNREAD_RETENTION_DAYS,
} from "../types/notification.types.js";

const DAY_MS = 86_400_000;
const MAX_TITLE = 120;
const MAX_BODY = 300;

export interface NotificationServiceDeps {
  notifications: NotificationRepository;
  settings: NotificationSettingsRepository;
  devices: PushDeviceRepository;
  clock: Clock;
}

export function toNotificationResponseDto(record: NotificationRecord): NotificationResponseDto {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    body: record.body,
    entityType: record.entityType,
    entityId: record.entityId,
    data: record.data,
    readAt: record.readAt ? record.readAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Caixa de notificações (R22, R47, R67, R74, R78, R68, R18, R34). Os outros módulos chamam
 * `notify` com textos prontos e sem valores em dinheiro (ADR-S2-005); a chave de deduplicação
 * garante que reavaliar um alerta nunca repita o aviso.
 */
export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  /** Grava o aviso se for novo. Devolve o registro criado, ou undefined se a chave já existia. */
  async notify(input: NotifyInput): Promise<NotificationRecord | undefined> {
    if (input.title.length > MAX_TITLE || input.body.length > MAX_BODY) {
      throw new Error(`Notificação ${input.kind} com texto acima do limite`);
    }
    return this.deps.notifications.insertIfNew(input, this.deps.clock.now());
  }

  async list(userId: string, query: ListNotificationsQueryDto): Promise<NotificationPageResponseDto> {
    const after = query.cursor
      ? decodeCursor<{ c: string; i: string }>(query.cursor, (value) => typeof value.c === "string" && typeof value.i === "string")
      : undefined;
    const page = await this.deps.notifications.list(userId, {
      unread: query.unread === "true",
      limit: query.limit,
      ...(after ? { after: { createdAt: after.c, id: after.i } } : {}),
    });
    const last = page.items[page.items.length - 1];
    return {
      data: page.items.map(toNotificationResponseDto),
      nextCursor: page.hasMore && last ? encodeCursor({ c: last.createdAt.toISOString(), i: last.id }) : null,
    };
  }

  countUnread(userId: string): Promise<number> {
    return this.deps.notifications.countUnread(userId);
  }

  async markRead(userId: string, notificationId: string): Promise<NotificationResponseDto> {
    const record = await this.deps.notifications.markRead(userId, notificationId, this.deps.clock.now());
    if (!record) throw errors.notFound("Notificação");
    return toNotificationResponseDto(record);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.deps.notifications.markAllRead(userId, this.deps.clock.now()) };
  }

  getSettings(userId: string): Promise<NotificationSettingsResponseDto> {
    return this.deps.settings.get(userId);
  }

  /** Contrato público para as tarefas agendadas (lembretes). */
  getSettingsMany(userIds: string[]): Promise<Map<string, NotificationSettings>> {
    return this.deps.settings.getMany(userIds);
  }

  async updateSettings(userId: string, patch: UpdateNotificationSettingsRequestDto): Promise<NotificationSettingsResponseDto> {
    const current = await this.deps.settings.get(userId);
    const next: NotificationSettings = {
      dailyReminderEnabled: patch.dailyReminderEnabled ?? current.dailyReminderEnabled,
      dailyReminderHour: patch.dailyReminderHour ?? current.dailyReminderHour,
      goalRemindersEnabled: patch.goalRemindersEnabled ?? current.goalRemindersEnabled,
      billRemindersEnabled: patch.billRemindersEnabled ?? current.billRemindersEnabled,
      alertsPushEnabled: patch.alertsPushEnabled ?? current.alertsPushEnabled,
    };
    await this.deps.settings.save(userId, next, this.deps.clock.now());
    return next;
  }

  /** Limpeza (D-64): notificações vencidas e aparelhos revogados há mais de 30 dias. */
  async purgeExpired(now: Date): Promise<number> {
    const removed = await this.deps.notifications.purge(
      new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS),
      new Date(now.getTime() - UNREAD_RETENTION_DAYS * DAY_MS),
    );
    return removed + (await this.deps.devices.purgeRevoked(new Date(now.getTime() - REVOKED_DEVICE_RETENTION_DAYS * DAY_MS)));
  }
}
