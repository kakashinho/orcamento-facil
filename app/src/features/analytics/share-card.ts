import * as Sharing from "expo-sharing";
import type { RefObject } from "react";
import { TurboModuleRegistry, type View } from "react-native";
import { logger } from "@/core/logging/logger";
import { secureStorage } from "@/core/storage/secure-storage";

type ViewShotPackage = typeof import("react-native-view-shot");

/** Preferência local "Não perguntar de novo" do aviso de privacidade (D-80); não é dado financeiro. */
export const SHARE_WARNING_KEY = "of.preferences.shareWarningDismissed";

/**
 * Módulo de captura (react-native-view-shot), só quando existe no app instalado: ele não vem no
 * Expo Go, e carregar o pacote sem o módulo nativo derruba o app. Sem ele, o botão fica escondido.
 */
export function getViewShot(): ViewShotPackage | null {
  if (!TurboModuleRegistry.get("RNViewShot")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("react-native-view-shot") as ViewShotPackage;
}

export function canShareCards(): boolean {
  return getViewShot() !== null;
}

/** O usuário pediu para não ver mais o aviso? Falha de leitura = mostrar o aviso. */
export async function shareWarningDismissed(): Promise<boolean> {
  try {
    return (await secureStorage.getItem(SHARE_WARNING_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function dismissShareWarning(): Promise<void> {
  try {
    await secureStorage.setItem(SHARE_WARNING_KEY, "1");
  } catch (error) {
    logger.warn("analytics.share_preference_failed", { error: String(error) });
  }
}

/**
 * Compartilhar um cartão como imagem (R30): captura a área em PNG no cache e abre a folha de
 * compartilhamento do Android.
 */
export async function shareCardImage(target: RefObject<View | null>, title: string): Promise<void> {
  const viewShot = getViewShot();
  if (!viewShot) throw new Error("Compartilhar imagem precisa do app instalado.");
  const uri = await viewShot.captureRef(target, { format: "png", quality: 1, result: "tmpfile" });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Compartilhamento indisponível neste aparelho.");
  await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title });
  logger.info("analytics.card_shared", { title });
}
