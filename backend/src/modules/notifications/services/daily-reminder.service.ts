import { hourInTimeZone, todayInTimeZone } from "../../../shared/utils/dates.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { PushDeviceRepository } from "../repositories/push-device.repository.js";
import type { NotificationService } from "./notification.service.js";

export interface DailyReminderServiceDeps {
  notifications: NotificationService;
  devices: PushDeviceRepository;
  transactions: TransactionService;
  users: UserService;
}

/**
 * R18: lembrete de registrar as despesas no fim do dia. Tarefa agendada: a partir da hora
 * escolhida (padrão 20h, no fuso do usuário), só para quem tem aparelho para receber push e ainda
 * não registrou nenhuma transação naquele dia. Um por dia, pela chave de deduplicação.
 */
export class DailyReminderService {
  constructor(private readonly deps: DailyReminderServiceDeps) {}

  async run(now: Date): Promise<{ processed: number }> {
    const { notifications, devices, transactions, users } = this.deps;
    const userIds = await devices.listUsersWithDevices();
    const settings = await notifications.getSettingsMany(userIds);
    let processed = 0;
    for (const userId of userIds) {
      const preference = settings.get(userId)!;
      if (!preference.dailyReminderEnabled) continue;
      const { timezone } = await users.getPreferences(userId);
      if (hourInTimeZone(now, timezone) < preference.dailyReminderHour) continue;
      const today = todayInTimeZone(now, timezone);
      if (await transactions.hasCreatedOn(userId, today, timezone)) continue;
      const created = await notifications.notify({
        userId,
        kind: "daily_reminder",
        title: "Registrou seus gastos de hoje?",
        body: "Toque para anotar as despesas do dia.",
        dedupeKey: `daily:${today}`,
      });
      if (created) processed += 1;
    }
    return { processed };
  }
}
