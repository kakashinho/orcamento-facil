import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import { errors } from "../../../shared/errors/app-error.js";
import { addDays, formatDateBr, hourInTimeZone, todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import { occurrenceDate } from "../../finance/services/series-rules.js";
import type { SeriesService } from "../../finance/services/series.service.js";
import type { ReminderRepository } from "../repositories/reminder.repository.js";
import type {
  CreateReminderRequestDto,
  ReminderListResponseDto,
  ReminderResponseDto,
  UpdateReminderRequestDto,
} from "../schemas/reminder.schema.js";
import { BILL_REMINDER_HOUR, type ReminderChanges, type ReminderRecord } from "../types/reminder.types.js";
import type { NotificationService } from "./notification.service.js";

export interface ReminderServiceDeps {
  reminders: ReminderRepository;
  series: SeriesService;
  notifications: NotificationService;
  users: UserService;
  clock: Clock;
}

function toDto(record: ReminderRecord): ReminderResponseDto {
  return {
    id: record.id,
    title: record.title,
    amount: record.amountCents === null ? null : fromCents(record.amountCents),
    currency: record.currency,
    frequency: record.frequency,
    nextDueDate: record.nextDueDate,
    seriesId: record.seriesId,
    active: record.active,
    lastNotifiedOn: record.lastNotifiedOn,
    createdAt: record.createdAt.toISOString(),
  };
}

const dayOf = (date: string) => Number(date.slice(8, 10));

/**
 * Lembretes de contas fixas (R34): no dia do vencimento, às 9h no fuso do usuário (D-63), um
 * aviso na caixa e por push; depois o vencimento avança pela frequência, mantendo o dia original.
 */
export class ReminderService {
  constructor(private readonly deps: ReminderServiceDeps) {}

  async list(userId: string): Promise<ReminderListResponseDto> {
    return { data: (await this.deps.reminders.list(userId)).map(toDto) };
  }

  async create(userId: string, input: CreateReminderRequestDto): Promise<ReminderResponseDto> {
    let title = input.title;
    let nextDueDate = input.nextDueDate;
    let frequency = input.frequency;
    if (input.seriesId) {
      const series = await this.deps.series.get(userId, input.seriesId).catch(() => null);
      if (!series || series.kind !== "recurring" || series.type !== "expense" || series.status !== "active" || !series.nextDate) {
        throw errors.unprocessable("INVALID_SERIES", "Escolha uma despesa recorrente ativa.", "seriesId");
      }
      title ??= series.description.slice(0, 80);
      nextDueDate ??= series.nextDate;
      frequency ??= series.frequency;
    }
    const { primaryCurrency } = await this.deps.users.getPreferences(userId);
    const now = this.deps.clock.now();
    const record: ReminderRecord = {
      id: randomUUID(),
      userId,
      title: title!,
      amountCents: input.amount === undefined ? null : toCents(input.amount),
      currency: input.amount === undefined ? null : primaryCurrency,
      frequency: frequency!,
      anchorDay: dayOf(nextDueDate!),
      nextDueDate: nextDueDate!,
      seriesId: input.seriesId ?? null,
      active: true,
      lastNotifiedOn: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.reminders.insert(record);
    return toDto(record);
  }

  async update(userId: string, reminderId: string, input: UpdateReminderRequestDto): Promise<ReminderResponseDto> {
    const current = await this.deps.reminders.findOwned(userId, reminderId);
    if (!current) throw errors.notFound("Lembrete");
    const changes: ReminderChanges = { updatedAt: this.deps.clock.now() };
    if (input.title !== undefined) changes.title = input.title;
    if (input.frequency !== undefined) changes.frequency = input.frequency;
    if (input.active !== undefined) changes.active = input.active;
    if (input.nextDueDate !== undefined) {
      changes.nextDueDate = input.nextDueDate;
      changes.anchorDay = dayOf(input.nextDueDate);
    }
    if (input.amount !== undefined) {
      changes.amountCents = input.amount === null ? null : toCents(input.amount);
      changes.currency = input.amount === null ? null : (current.currency ?? (await this.deps.users.getPreferences(userId)).primaryCurrency);
    }
    await this.deps.reminders.update(reminderId, changes);
    return toDto((await this.deps.reminders.findOwned(userId, reminderId))!);
  }

  async remove(userId: string, reminderId: string): Promise<void> {
    if (!(await this.deps.reminders.delete(userId, reminderId))) throw errors.notFound("Lembrete");
  }

  /**
   * Tarefa `notifications.bill-reminders`. Avisa uma vez por vencimento (se o servidor ficou
   * parado vários períodos, avisa só uma vez) e avança até passar de hoje. Com a preferência
   * desligada, só avança.
   */
  async runDue(now: Date): Promise<{ processed: number }> {
    const { reminders, notifications, users, clock } = this.deps;
    const due = await reminders.listDue(addDays(now.toISOString().slice(0, 10), 1));
    const settings = await notifications.getSettingsMany([...new Set(due.map((reminder) => reminder.userId))]);
    let processed = 0;
    for (const reminder of due) {
      const { timezone } = await users.getPreferences(reminder.userId);
      const today = todayInTimeZone(now, timezone);
      if (reminder.nextDueDate > today || hourInTimeZone(now, timezone) < BILL_REMINDER_HOUR) continue;

      if (settings.get(reminder.userId)?.billRemindersEnabled && reminder.lastNotifiedOn !== reminder.nextDueDate) {
        const created = await notifications.notify({
          userId: reminder.userId,
          kind: "bill_reminder",
          title: "Conta vence hoje",
          body:
            reminder.nextDueDate === today
              ? `Hoje vence: ${reminder.title}.`
              : `${reminder.title} venceu em ${formatDateBr(reminder.nextDueDate)}.`,
          entityType: "reminder",
          entityId: reminder.id,
          dedupeKey: `bill:${reminder.id}:${reminder.nextDueDate}`,
        });
        if (created) processed += 1;
      }
      let next = reminder.nextDueDate;
      while (next <= today) next = occurrenceDate(next, reminder.anchorDay, reminder.frequency, 1);
      await reminders.update(reminder.id, { nextDueDate: next, lastNotifiedOn: reminder.nextDueDate, updatedAt: clock.now() });
    }
    return { processed };
  }
}
