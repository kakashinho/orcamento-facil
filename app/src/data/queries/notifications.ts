import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateReminderRequest, NotificationSettings, Overview, UpdateReminderRequest } from "../api/types";
import { api } from "../client";
import { queryKeys } from "./keys";

/** Intervalo da consulta do contador do sino com o app aberto (mesmo padrão do status de manutenção). */
export const UNREAD_POLL_MS = 60_000;

/** Caixa de notificações com rolagem infinita (R22, R47, R68, R78, R18, R34). */
export function useNotificationsInfinite(unread = false) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications(unread),
    queryFn: ({ pageParam }) => api.notifications.list({ unread, limit: 20, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/**
 * Contador do sino: consulta a cada minuto e ao voltar ao app (foco gerenciado pelo React Query).
 * Enquanto a primeira resposta não chega, usa o número que veio no resumo do Início (`overview`).
 */
export function useUnreadCount(enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.notifications.unreadCount().then((r) => r.count),
    placeholderData: () => queryClient.getQueryData<Overview>(queryKeys.overview())?.unreadNotifications,
    refetchInterval: UNREAD_POLL_MS,
    staleTime: 15_000,
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

// ---------- preferências de aviso e aparelhos (R18) ----------

export function useNotificationSettings() {
  return useQuery({ queryKey: queryKeys.notificationSettings, queryFn: () => api.notifications.settings() });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationSettings>) => api.notifications.updateSettings(body),
    // Resposta otimista: o interruptor já mudou na tela; a resposta confirma o estado salvo.
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationSettings });
      const previous = queryClient.getQueryData<NotificationSettings>(queryKeys.notificationSettings);
      if (previous) queryClient.setQueryData(queryKeys.notificationSettings, { ...previous, ...body });
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.notificationSettings, context.previous);
    },
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.notificationSettings, settings),
  });
}

// ---------- lembretes de contas (R34) ----------

export function useReminders() {
  return useQuery({ queryKey: queryKeys.reminders, queryFn: () => api.reminders.list().then((r) => r.data) });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReminderRequest) => api.reminders.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
  });
}

export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReminderRequest }) => api.reminders.update(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.reminders.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
  });
}
