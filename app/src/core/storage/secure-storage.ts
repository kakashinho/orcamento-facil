import * as SecureStore from "expo-secure-store";

/** Armazenamento chave-valor assíncrono (permite trocar a implementação nos testes). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

/**
 * Armazenamento cifrado pelo Android Keystore (expo-secure-store) — R03: o refresh token
 * nunca fica em texto puro no aparelho. Dados financeiros não são persistidos no aparelho.
 */
export const secureStorage: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
};

/** Implementação em memória, usada nos testes. */
export function createMemoryStorage(
  initial: Record<string, string> = {},
): KeyValueStore & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    deleteItem: async (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries(data),
  };
}

/** Chaves usadas pelo app. */
export const storageKeys = {
  refreshToken: "of.session.refreshToken",
  biometricCredential: "of.biometric.credential",
  themePreference: "of.preferences.theme",
  serverAddress: "of.settings.serverAddress",
} as const;
