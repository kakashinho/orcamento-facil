import * as Device from "expo-device";
import { isApiError } from "@/core/http/api-error";
import { logger } from "@/core/logging/logger";
import { secureStorage } from "@/core/storage/secure-storage";
import { api } from "@/data/client";
import {
  ensureChannel,
  getDeviceToken,
  getPermission,
  requestPermission,
  type PushPermission,
} from "./native-notifications";

/**
 * Chaves no armazenamento cifrado (SecureStore): o id do aparelho no servidor — o token do FCM não é
 * guardado nem registrado em log — e a marca de que o pedido explicativo já foi mostrado.
 */
export const pushStorageKeys = {
  deviceId: "of.notifications.deviceId",
  permissionOffered: "of.notifications.permissionOffered",
} as const;

/** Chave do estado da permissão no cache (relida ao voltar ao app, depois das configurações do sistema). */
export const pushPermissionKey = ["push-permission"] as const;

/** O descadastro no "Sair" não pode segurar a saída por muito tempo. */
const UNREGISTER_TIMEOUT_MS = 5_000;

const codeOf = (error: unknown) => (isApiError(error) ? error.code : "UNKNOWN");

function deviceName(): string | undefined {
  const name = Device.modelName?.trim();
  return name ? name.slice(0, 80) : undefined;
}

/**
 * Registra o aparelho para receber push (R18), só com a permissão já concedida: cria o canal, obtém o
 * token do FCM (ou usa o novo, na troca de token), chama `POST /api/notifications/devices` e guarda o
 * id devolvido. Falhas não interrompem o app (o push é um extra da caixa de avisos). Devolve o id.
 */
export async function registerPushDevice(token?: string): Promise<string | null> {
  try {
    if ((await getPermission()) !== "granted") return null;
    await ensureChannel();
    const fcmToken = token ?? (await getDeviceToken());
    if (!fcmToken) return null;
    const { id } = await api.notifications.registerDevice(fcmToken, deviceName());
    await secureStorage.setItem(pushStorageKeys.deviceId, id);
    logger.info("push.device_registered");
    return id;
  } catch (error) {
    logger.warn("push.register_failed", { code: codeOf(error) });
    return null;
  }
}

/**
 * No "Sair" (antes de revogar a sessão): `DELETE /api/notifications/devices/:id` e apaga o id local.
 * Sem rede ou com erro, a saída continua (o servidor revoga o token quando o FCM o recusar).
 */
export async function unregisterPushDevice(): Promise<void> {
  const id = await secureStorage.getItem(pushStorageKeys.deviceId).catch(() => null);
  if (!id) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      api.notifications.unregisterDevice(id),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, UNREGISTER_TIMEOUT_MS);
      }),
    ]);
    logger.info("push.device_unregistered");
  } catch (error) {
    logger.warn("push.unregister_failed", { code: codeOf(error) });
  } finally {
    clearTimeout(timer);
    await secureStorage.deleteItem(pushStorageKeys.deviceId).catch(() => undefined);
  }
}

/** O pedido explicativo aparece uma única vez, e só se a permissão ainda puder ser pedida. */
export async function shouldOfferPermission(): Promise<boolean> {
  if ((await getPermission()) !== "askable") return false;
  return !(await secureStorage.getItem(pushStorageKeys.permissionOffered).catch(() => null));
}

export async function markPermissionOffered(): Promise<void> {
  await secureStorage.setItem(pushStorageKeys.permissionOffered, "1").catch(() => undefined);
}

/** "Permitir": mostra o pedido do sistema e, se concedido, registra o aparelho. */
export async function enablePush(): Promise<PushPermission> {
  await markPermissionOffered();
  const permission = await requestPermission().catch(() => "unavailable" as const);
  if (permission === "granted") await registerPushDevice();
  return permission;
}
