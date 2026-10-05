import * as Device from "expo-device";
import { isApiError } from "@/core/http/api-error";
import { logger } from "@/core/logging/logger";
import { secureStorage, storageKeys, type KeyValueStore } from "@/core/storage/secure-storage";
import type { Api } from "@/data/api";
import type { AuthResult } from "@/data/api/types";
import { loadNativeBiometrics, type NativeBiometrics } from "./native-biometrics";

/**
 * Login por biometria (R40) no modelo do react-native-biometrics:
 * 1. com a sessão aberta, o app cria um par de chaves no Android Keystore protegido pela
 *    digital e envia só a chave pública (POST /api/auth/biometric/credentials);
 * 2. no login, pede um desafio ao servidor, assina com a chave privada — o Android exige a
 *    digital para liberá-la — e envia a assinatura (POST /api/auth/biometric/login).
 * A chave privada nunca sai do aparelho.
 */

export const BIOMETRIC_KEY_ALIAS = "orcamento-facil-login";

export interface StoredBiometricCredential {
  credentialId: string;
  /** E-mail da conta, exibido no botão "Entrar com biometria". */
  account: string;
}

export type BiometricErrorCode = "UNAVAILABLE" | "NOT_ENROLLED" | "CANCELLED" | "INVALIDATED" | "FAILED";

export class BiometricError extends Error {
  readonly code: BiometricErrorCode;
  constructor(code: BiometricErrorCode, message: string) {
    super(message);
    this.name = "BiometricError";
    this.code = code;
  }
}

const UNAVAILABLE_MESSAGE =
  "A biometria usa o sensor e o Keystore do Android e funciona no app instalado (não no Expo Go).";

/** Dependências injetáveis (o app usa as reais; os testes, dublês). */
export interface BiometricDeps {
  api: Pick<Api, "biometric">;
  storage?: KeyValueStore;
  native?: NativeBiometrics | null;
  deviceName?: () => string;
}

function resolve(deps: BiometricDeps) {
  return {
    api: deps.api,
    storage: deps.storage ?? secureStorage,
    native: deps.native === undefined ? loadNativeBiometrics() : deps.native,
    deviceName: deps.deviceName ?? (() => Device.modelName ?? "Aparelho Android"),
  };
}

function requireNative(native: NativeBiometrics | null): NativeBiometrics {
  if (!native) throw new BiometricError("UNAVAILABLE", UNAVAILABLE_MESSAGE);
  return native;
}

export async function getStoredCredential(
  storage: KeyValueStore = secureStorage,
): Promise<StoredBiometricCredential | null> {
  const raw = await storage.getItem(storageKeys.biometricCredential);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBiometricCredential;
    return parsed.credentialId ? parsed : null;
  } catch {
    return null;
  }
}

export async function isBiometricAvailable(deps: BiometricDeps): Promise<boolean> {
  const { native } = resolve(deps);
  if (!native) return false;
  try {
    const info = await native.isSensorAvailable();
    return info.available;
  } catch {
    return false;
  }
}

/** Habilita a biometria neste aparelho para a conta logada. */
export async function enableBiometric(account: string, deps: BiometricDeps): Promise<StoredBiometricCredential> {
  const { api, storage, deviceName, ...rest } = resolve(deps);
  const native = requireNative(rest.native);
  const sensor = await native.isSensorAvailable().catch(() => ({ available: false }) as { available: boolean });
  if (!sensor.available) {
    throw new BiometricError(
      "UNAVAILABLE",
      "Este aparelho não tem digital cadastrada. Cadastre uma digital nas configurações do Android.",
    );
  }
  const { publicKey } = await native.createKeys(BIOMETRIC_KEY_ALIAS, "ec256");
  const credential = await api.biometric.enroll(publicKey, deviceName());
  const stored = { credentialId: credential.id, account };
  await storage.setItem(storageKeys.biometricCredential, JSON.stringify(stored));
  logger.info("auth.biometric_enabled", { keyType: credential.keyType });
  return stored;
}

/** Desabilita no servidor (se possível) e apaga a chave e a credencial locais. */
export async function disableBiometric(deps: BiometricDeps, revokeOnServer = true): Promise<void> {
  const { api, storage, native } = resolve(deps);
  const stored = await getStoredCredential(storage);
  if (stored && revokeOnServer) {
    await api.biometric
      .revoke(stored.credentialId)
      .catch((error) =>
        logger.warn("auth.biometric_revoke_failed", { code: isApiError(error) ? error.code : "UNKNOWN" }),
      );
  }
  await native?.deleteKeys(BIOMETRIC_KEY_ALIAS).catch(() => undefined);
  await storage.deleteItem(storageKeys.biometricCredential);
  logger.info("auth.biometric_disabled");
}

/** Entra com a digital: desafio → assinatura no Keystore → sessão. */
export async function signInWithBiometric(deps: BiometricDeps): Promise<AuthResult> {
  const { api, storage, ...rest } = resolve(deps);
  const native = requireNative(rest.native);
  const stored = await getStoredCredential(storage);
  if (!stored) {
    throw new BiometricError(
      "NOT_ENROLLED",
      "Entre com a senha e ative a biometria em Preferências para usar a digital.",
    );
  }
  try {
    const { challenge } = await api.biometric.challenge(stored.credentialId);
    const signed = await native.signWithOptions({
      keyAlias: BIOMETRIC_KEY_ALIAS,
      data: challenge,
      promptTitle: "Entrar no Orçamento Fácil",
      promptSubtitle: "Toque no sensor de digital",
      cancelButtonText: "Usar senha",
      disableDeviceFallback: true,
    });
    if (!signed.success || !signed.signature) {
      const cancelled = /cancel/i.test(`${signed.errorCode ?? ""} ${signed.error ?? ""}`);
      throw new BiometricError(
        cancelled ? "CANCELLED" : "FAILED",
        cancelled ? "Autenticação cancelada." : "Não foi possível confirmar sua digital.",
      );
    }
    const result = await api.biometric.login(stored.credentialId, challenge, signed.signature);
    logger.info("auth.biometric_login_succeeded");
    return result;
  } catch (error) {
    if (isApiError(error) && error.code === "BIOMETRIC_CREDENTIAL_INVALID") {
      // Desabilitada no servidor (ex.: senha redefinida): limpa e volta ao login com senha.
      await disableBiometric(deps, false);
      throw new BiometricError(
        "INVALIDATED",
        "A biometria foi desativada para esta conta. Entre com a senha e ative novamente.",
      );
    }
    throw error;
  }
}
