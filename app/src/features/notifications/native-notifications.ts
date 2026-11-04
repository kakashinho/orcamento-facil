import { isRunningInExpoGo, requireOptionalNativeModule } from "expo";

type NotificationsPackage = typeof import("expo-notifications");
export type NativeNotifications = Pick<
  NotificationsPackage,
  | "AndroidImportance"
  | "getPermissionsAsync"
  | "requestPermissionsAsync"
  | "getDevicePushTokenAsync"
  | "setNotificationHandler"
  | "setNotificationChannelAsync"
  | "addNotificationResponseReceivedListener"
  | "addNotificationReceivedListener"
  | "addPushTokenListener"
  | "getLastNotificationResponseAsync"
> &
  Partial<Pick<NotificationsPackage, "clearLastNotificationResponseAsync">>;

type NotificationResponse = Awaited<ReturnType<NotificationsPackage["getLastNotificationResponseAsync"]>>;

/** Canal Android dos avisos: o mesmo do plugin (app.config.ts) e do `channel_id` enviado pelo servidor. */
export const NOTIFICATION_CHANNEL_ID = "avisos";

/**
 * Estado da permissão de notificações (Android 13+): concedida, pode ser pedida, bloqueada (só nas
 * configurações do sistema) ou indisponível (Expo Go ou app sem o módulo nativo).
 */
export type PushPermission = "granted" | "askable" | "blocked" | "unavailable";

/** Toque numa notificação: identificador (para não tratar duas vezes) e os dados enviados pelo servidor. */
export interface PushResponse {
  id: string;
  data: Record<string, unknown>;
}

let cached: NativeNotifications | null | undefined;

/**
 * Módulo nativo de notificações (R18), carregado só quando o push funciona. No Expo Go o push remoto
 * não existe no Android desde o SDK 53 (o pacote lança erro ao pedir o token), e um app gerado sem o
 * módulo não o traz: nos dois casos o recurso fica indisponível e as Preferências avisam.
 */
export function loadNativeNotifications(): NativeNotifications | null {
  if (isRunningInExpoGo()) return null;
  if (cached === undefined) {
    cached = requireOptionalNativeModule("ExpoPushTokenManager")
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports
        (require("expo-notifications") as NotificationsPackage)
      : null;
  }
  return cached;
}

export function isPushAvailable(): boolean {
  return loadNativeNotifications() !== null;
}

function permissionOf(result: { granted: boolean; status: string; canAskAgain: boolean }): PushPermission {
  if (result.granted || result.status === "granted") return "granted";
  return result.canAskAgain ? "askable" : "blocked";
}

export async function getPermission(): Promise<PushPermission> {
  const native = loadNativeNotifications();
  if (!native) return "unavailable";
  return permissionOf(await native.getPermissionsAsync());
}

/** Cria (ou atualiza) o canal "Avisos" com importância alta: no Android 13+ ele precisa existir antes do pedido. */
export async function ensureChannel(): Promise<void> {
  const native = loadNativeNotifications();
  if (!native) return;
  await native.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
    name: "Avisos",
    description: "Alertas de orçamento, saldo e metas e lembretes do Orçamento Fácil",
    importance: native.AndroidImportance.HIGH,
    lightColor: "#1560D4",
  });
}

/** Mostra o pedido do sistema (POST_NOTIFICATIONS no Android 13+). */
export async function requestPermission(): Promise<PushPermission> {
  const native = loadNativeNotifications();
  if (!native) return "unavailable";
  await ensureChannel();
  return permissionOf(await native.requestPermissionsAsync());
}

/** Token nativo do Firebase Cloud Messaging (não o token do serviço de push da Expo — ADR-S2-008). */
export async function getDeviceToken(): Promise<string | null> {
  const native = loadNativeNotifications();
  if (!native) return null;
  const token = await native.getDevicePushTokenAsync();
  return typeof token.data === "string" && token.data ? token.data : null;
}

/** Com o app aberto, o aviso aparece como banner e na lista do sistema. */
export function showNotificationsInForeground(): void {
  loadNativeNotifications()?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** O FCM trocou o token do aparelho: o novo precisa ser registrado no servidor. */
export function onTokenChange(listener: (token: string) => void): () => void {
  const native = loadNativeNotifications();
  if (!native) return () => undefined;
  const subscription = native.addPushTokenListener((token) => {
    if (typeof token.data === "string" && token.data) listener(token.data);
  });
  return () => subscription.remove();
}

/** Chegou um aviso com o app aberto. */
export function onNotificationReceived(listener: () => void): () => void {
  const native = loadNativeNotifications();
  if (!native) return () => undefined;
  const subscription = native.addNotificationReceivedListener(() => listener());
  return () => subscription.remove();
}

function responseOf(response: NonNullable<NotificationResponse>): PushResponse {
  const request = response.notification.request;
  // Mensagem direta do FCM: os campos `data` chegam em `content.data`; o gatilho guarda o original.
  const trigger = request.trigger as { remoteMessage?: { data?: Record<string, string> } } | null;
  const data = request.content.data ?? trigger?.remoteMessage?.data ?? {};
  return { id: request.identifier, data: data as Record<string, unknown> };
}

/** Toque numa notificação com o app aberto ou em segundo plano. */
export function onNotificationResponse(listener: (response: PushResponse) => void): () => void {
  const native = loadNativeNotifications();
  if (!native) return () => undefined;
  const subscription = native.addNotificationResponseReceivedListener((response) => listener(responseOf(response)));
  return () => subscription.remove();
}

/** Toque que abriu o app fechado; depois de lido, é apagado para não abrir de novo no próximo login. */
export async function takeLastNotificationResponse(): Promise<PushResponse | null> {
  const native = loadNativeNotifications();
  if (!native) return null;
  const response = await native.getLastNotificationResponseAsync();
  if (!response) return null;
  await native.clearLastNotificationResponseAsync?.().catch(() => undefined);
  return responseOf(response);
}
