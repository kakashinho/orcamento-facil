import type { HttpClient } from "@/core/http/http-client";
import type {
  AppNotification,
  CreateReminderRequest,
  DataList,
  NotificationSettings,
  Page,
  Reminder,
  UpdateReminderRequest,
} from "./types";

/** Caixa de avisos (R22, R47, R68, R78), preferências e aparelhos para push (R18). */
export function notificationsApi(http: HttpClient) {
  return {
    list: (query: { unread?: boolean; limit?: number; cursor?: string } = {}) =>
      http.get<Page<AppNotification>>("/api/notifications", {
        query: { unread: query.unread ? "true" : undefined, limit: query.limit, cursor: query.cursor },
      }),
    unreadCount: () => http.get<{ count: number }>("/api/notifications/unread-count"),
    markRead: (id: string) => http.post<AppNotification>(`/api/notifications/${id}/read`),
    markAllRead: () => http.post<{ updated: number }>("/api/notifications/read-all"),
    settings: () => http.get<NotificationSettings>("/api/notifications/settings"),
    updateSettings: (body: Partial<NotificationSettings>) =>
      http.patch<NotificationSettings>("/api/notifications/settings", body),
    registerDevice: (token: string, deviceName?: string) =>
      http.post<{ id: string }>("/api/notifications/devices", { token, ...(deviceName ? { deviceName } : {}) }),
    unregisterDevice: (id: string) => http.delete(`/api/notifications/devices/${id}`),
  };
}

/** Lembretes de contas fixas (R34). */
export function remindersApi(http: HttpClient) {
  return {
    list: () => http.get<DataList<Reminder>>("/api/reminders"),
    create: (body: CreateReminderRequest) => http.post<Reminder>("/api/reminders", body),
    update: (id: string, body: UpdateReminderRequest) => http.patch<Reminder>(`/api/reminders/${id}`, body),
    remove: (id: string) => http.delete(`/api/reminders/${id}`),
  };
}
