import * as Biometrics from "@sbaiahmed1/react-native-biometrics";
import { ApiError } from "@/core/http/api-error";
import { createMemoryStorage, storageKeys } from "@/core/storage/secure-storage";
import { authResult } from "@/test-utils/fixtures";
import {
  BIOMETRIC_KEY_ALIAS,
  BiometricError,
  disableBiometric,
  enableBiometric,
  getStoredCredential,
  isBiometricAvailable,
  signInWithBiometric,
} from "./biometric-auth";

const native = Biometrics as jest.Mocked<typeof Biometrics>;

function fakeApi() {
  return {
    biometric: {
      enroll: jest.fn(async () => ({
        id: "cred-1",
        deviceName: "Pixel",
        keyType: "ec" as const,
        createdAt: "",
        lastUsedAt: null,
      })),
      list: jest.fn(),
      revoke: jest.fn(async () => undefined),
      challenge: jest.fn(async () => ({ credentialId: "cred-1", challenge: "desafio-123", expiresAt: "" })),
      login: jest.fn(async () => authResult),
    },
  };
}

describe("biometria (R40)", () => {
  it("ativa: cria a chave EC no Keystore e cadastra só a chave pública", async () => {
    const api = fakeApi();
    const storage = createMemoryStorage();
    const stored = await enableBiometric("joao@ex.com", { api: api as never, storage, deviceName: () => "Pixel" });
    expect(native.createKeys).toHaveBeenCalledWith(BIOMETRIC_KEY_ALIAS, "ec256");
    expect(api.biometric.enroll).toHaveBeenCalledWith("MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtest", "Pixel");
    expect(stored).toEqual({ credentialId: "cred-1", account: "joao@ex.com" });
    await expect(getStoredCredential(storage)).resolves.toEqual(stored);
  });

  it("não ativa sem digital cadastrada no aparelho", async () => {
    native.isSensorAvailable.mockResolvedValueOnce({ available: false, isDeviceSecure: false });
    await expect(
      enableBiometric("a@b.com", { api: fakeApi() as never, storage: createMemoryStorage() }),
    ).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });

  it("entra: assina o desafio do servidor com a digital", async () => {
    const api = fakeApi();
    const storage = createMemoryStorage({
      [storageKeys.biometricCredential]: JSON.stringify({ credentialId: "cred-1", account: "a@b.com" }),
    });
    await expect(signInWithBiometric({ api: api as never, storage })).resolves.toBe(authResult);
    expect(native.signWithOptions).toHaveBeenCalledWith(
      expect.objectContaining({ keyAlias: BIOMETRIC_KEY_ALIAS, data: "desafio-123", disableDeviceFallback: true }),
    );
    expect(api.biometric.login).toHaveBeenCalledWith("cred-1", "desafio-123", "c2lnbmF0dXJl");
  });

  it("orienta a ativar quando ainda não há credencial", async () => {
    await expect(
      signInWithBiometric({ api: fakeApi() as never, storage: createMemoryStorage() }),
    ).rejects.toMatchObject({
      code: "NOT_ENROLLED",
    });
  });

  it("identifica o cancelamento do usuário", async () => {
    native.signWithOptions.mockResolvedValueOnce({ success: false, error: "User cancelled", errorCode: "USER_CANCEL" });
    const storage = createMemoryStorage({
      [storageKeys.biometricCredential]: JSON.stringify({ credentialId: "cred-1", account: "a@b.com" }),
    });
    const error = await signInWithBiometric({ api: fakeApi() as never, storage }).catch((e) => e);
    expect(error).toBeInstanceOf(BiometricError);
    expect(error.code).toBe("CANCELLED");
  });

  it("limpa a credencial desativada no servidor (ex.: senha redefinida)", async () => {
    const api = fakeApi();
    api.biometric.challenge.mockRejectedValueOnce(
      new ApiError(401, "BIOMETRIC_CREDENTIAL_INVALID", "Credencial inválida."),
    );
    const storage = createMemoryStorage({
      [storageKeys.biometricCredential]: JSON.stringify({ credentialId: "cred-1", account: "a@b.com" }),
    });
    await expect(signInWithBiometric({ api: api as never, storage })).rejects.toMatchObject({ code: "INVALIDATED" });
    expect(native.deleteKeys).toHaveBeenCalledWith(BIOMETRIC_KEY_ALIAS);
    await expect(getStoredCredential(storage)).resolves.toBeNull();
  });

  it("desativa no servidor e apaga a chave local", async () => {
    const api = fakeApi();
    const storage = createMemoryStorage({
      [storageKeys.biometricCredential]: JSON.stringify({ credentialId: "cred-1", account: "a@b.com" }),
    });
    await disableBiometric({ api: api as never, storage });
    expect(api.biometric.revoke).toHaveBeenCalledWith("cred-1");
    await expect(getStoredCredential(storage)).resolves.toBeNull();
  });

  it("avisa que a biometria precisa do app instalado quando o módulo nativo não existe (Expo Go)", async () => {
    const deps = { api: fakeApi() as never, storage: createMemoryStorage(), native: null };
    await expect(isBiometricAvailable(deps)).resolves.toBe(false);
    await expect(enableBiometric("a@b.com", deps)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(signInWithBiometric(deps)).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
