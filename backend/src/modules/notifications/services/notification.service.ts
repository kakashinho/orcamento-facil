import type { Clock } from "../../../infrastructure/clock.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { PushSender } from "../../../infrastructure/push/push-sender.js";
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
  ALERT_KINDS,
  type NotificationRecord,
  type NotificationSettings,
  type NotifyInput,
  READ_RETENTION_DAYS,
  REVOKED_DEVICE_RETENTION_DAYS,
  UNREAD_RETENTION_DAYS,
} from "../types/notification.types.js";

const DAY_MS = 86_400_000;
/** Reenvio de push: até 3 tentativas, a partir de 1 minuto depois do aviso. */
const MAX_PUSH_ATTEMPTS = 3;
const RETRY_AFTER_MS = 60_000;
const RETRY_BATCH = 100;
const MAX_TITLE = 120;
const MAX_BODY = 300;

export interface NotificationServiceDeps {
  notifications: NotificationRepository;
  settings: NotificationSettingsRepository;
  devices: PushDeviceRepository;
  pushSender: PushSender;
  eventLog: EventLogger;
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
 * `notify` com textos prontos e sem valores em dinheiro; a chave de deduplicação
 * garante que reavaliar um alerta nunca repita o aviso.
 */
export class NotificationService {
  private readonly pendingPush = new Set<Promise<void>>();

  constructor(private readonly deps: NotificationServiceDeps) {}

  /**
   * Grava o aviso se for novo e dispara o push em segundo plano (R18): quem chama não espera o
   * FCM. Devolve o registro criado, ou undefined se a chave já existia.
   */
  async notify(input: NotifyInput): Promise<NotificationRecord | undefined> {
    if (input.title.length > MAX_TITLE || input.body.length > MAX_BODY) {
      throw new Error(`Notificação ${input.kind} com texto acima do limite`);
    }
    const record = await this.deps.notifications.insertIfNew(input, this.deps.clock.now());
    if (record) {
      const delivery = this.firstDelivery(record).catch((error: unknown) => {
        this.deps.eventLog.record("notifications.push_failed", {
          level: "error",
          userId: record.userId,
          message: error instanceof Error ? error.message : String(error),
          context: { kind: record.kind },
        });
      });
      this.pendingPush.add(delivery);
      void delivery.finally(() => this.pendingPush.delete(delivery));
    }
    return record;
  }

  /** Aguarda os envios de push em andamento (testes e encerramento do servidor). */
  async flush(): Promise<void> {
    while (this.pendingPush.size > 0) await Promise.allSettled([...this.pendingPush]);
  }

  /** Alertas respeitam a preferência "avisos por push"; lembretes já foram filtrados por quem os criou. */
  private async firstDelivery(record: NotificationRecord): Promise<void> {
    if (ALERT_KINDS.has(record.kind) && !(await this.deps.settings.get(record.userId)).alertsPushEnabled) {
      await this.deps.notifications.setPushStatus(record.id, "skipped", 0);
      return;
    }
    await this.deliver(record);
  }

  /**
   * Envia para cada aparelho ativo. Token recusado pelo FCM é revogado; falha temporária deixa
   * o aviso pendente para a tarefa de reenvio, até 3 tentativas.
   */
  private async deliver(record: NotificationRecord): Promise<void> {
    const { devices, pushSender, notifications, clock } = this.deps;
    const targets = await devices.listActive(record.userId);
    if (targets.length === 0) {
      await notifications.setPushStatus(record.id, "skipped", record.pushAttempts);
      return;
    }
    const message = {
      title: record.title,
      body: record.body,
      data: {
        notificationId: record.id,
        kind: record.kind,
        entityType: record.entityType ?? "",
        entityId: record.entityId ?? "",
      },
    };
    let sent = 0;
    let failed = 0;
    for (const device of targets) {
      const result = await pushSender.send(device.token, message);
      if (result === "sent") sent += 1;
      else if (result === "invalid_token") await devices.revokeToken(device.token, clock.now());
      else failed += 1;
    }
    const attempts = record.pushAttempts + 1;
    if (sent > 0) await notifications.setPushStatus(record.id, "sent", attempts);
    else if (failed === 0) await notifications.setPushStatus(record.id, "skipped", attempts);
    else await notifications.setPushStatus(record.id, attempts >= MAX_PUSH_ATTEMPTS ? "failed" : "pending", attempts);
  }

  /** Tarefa agendada `notifications.push-retry`: reenvia os pushes que falharam. */
  async retryPending(now: Date): Promise<{ processed: number }> {
    const pending = await this.deps.notifications.listPushPending(new Date(now.getTime() - RETRY_AFTER_MS), RETRY_BATCH);
    for (const record of pending) await this.deliver(record);
    return { processed: pending.length };
  }

  /** R18: registra o aparelho para receber push (idempotente pelo token). */
  async registerDevice(userId: string, token: string, deviceName: string | null): Promise<{ id: string }> {
    return { id: await this.deps.devices.upsert(userId, token, deviceName, this.deps.clock.now()) };
  }

  async unregisterDevice(userId: string, deviceId: string): Promise<void> {
    if (!(await this.deps.devices.revoke(userId, deviceId, this.deps.clock.now()))) throw errors.notFound("Aparelho");
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

  /** Limpeza: notificações vencidas e aparelhos revogados há mais de 30 dias. */
  async purgeExpired(now: Date): Promise<number> {
    const removed = await this.deps.notifications.purge(
      new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS),
      new Date(now.getTime() - UNREAD_RETENTION_DAYS * DAY_MS),
    );
    return removed + (await this.deps.devices.purgeRevoked(new Date(now.getTime() - REVOKED_DEVICE_RETENTION_DAYS * DAY_MS)));
  }
}
