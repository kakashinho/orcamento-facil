import { eq, inArray } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";
import { notificationSettings } from "../../../infrastructure/database/schema.js";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "../types/notification.types.js";

/** Preferências de aviso (R18, R34). Linha ausente = padrões; o primeiro PATCH cria a linha. */
export class NotificationSettingsRepository extends Repository {
  async get(userId: string): Promise<NotificationSettings> {
    const [row] = await this.db.select().from(notificationSettings).where(eq(notificationSettings.userId, userId));
    if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return {
      dailyReminderEnabled: row.dailyReminderEnabled,
      dailyReminderHour: row.dailyReminderHour,
      goalRemindersEnabled: row.goalRemindersEnabled,
      billRemindersEnabled: row.billRemindersEnabled,
      alertsPushEnabled: row.alertsPushEnabled,
    };
  }

  /** Preferências de vários usuários de uma vez (tarefas agendadas); ausentes = padrões. */
  async getMany(userIds: string[]): Promise<Map<string, NotificationSettings>> {
    const result = new Map<string, NotificationSettings>();
    for (const userId of userIds) result.set(userId, { ...DEFAULT_NOTIFICATION_SETTINGS });
    if (userIds.length === 0) return result;
    const rows = await this.db.select().from(notificationSettings).where(inArray(notificationSettings.userId, userIds));
    for (const row of rows) {
      result.set(row.userId, {
        dailyReminderEnabled: row.dailyReminderEnabled,
        dailyReminderHour: row.dailyReminderHour,
        goalRemindersEnabled: row.goalRemindersEnabled,
        billRemindersEnabled: row.billRemindersEnabled,
        alertsPushEnabled: row.alertsPushEnabled,
      });
    }
    return result;
  }

  async save(userId: string, settings: NotificationSettings, now: Date): Promise<void> {
    await this.db
      .insert(notificationSettings)
      .values({ userId, ...settings, updatedAt: now })
      .onConflictDoUpdate({ target: notificationSettings.userId, set: { ...settings, updatedAt: now } });
  }
}
