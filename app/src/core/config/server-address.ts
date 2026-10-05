import { create } from "zustand";
import { logger } from "../logging/logger";
import { secureStorage, storageKeys, type KeyValueStore } from "../storage/secure-storage";
import { env, normalizeApiUrl } from "./env";

/**
 * Endereço do servidor escolhido pelo usuário na tela de login (útil em demonstrações: o IP do
 * computador muda de rede para rede). Sem escolha, vale a URL embutida no build (`env.apiUrl`).
 */
const URL_PATTERN = /^https?:\/\/[^\s/:?#]+(:\d{1,5})?(\/\S*)?$/i;

export function parseServerAddress(input: string): { url: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Informe o endereço do servidor." };
  const url = normalizeApiUrl(trimmed);
  return URL_PATTERN.test(url) ? { url } : { error: "Endereço inválido. Ex.: 192.168.0.250 ou 192.168.0.250:3000." };
}

interface ServerAddressState {
  override: string | null;
  hydrated: boolean;
  set: (url: string) => void;
  reset: () => void;
  hydrate: (storage?: KeyValueStore) => Promise<void>;
}

export const useServerAddress = create<ServerAddressState>((set) => ({
  override: null,
  hydrated: false,
  set: (url) => {
    set({ override: url });
    secureStorage
      .setItem(storageKeys.serverAddress, url)
      .catch((error) => logger.warn("server.address_persist_failed", { error: String(error) }));
  },
  reset: () => {
    set({ override: null });
    secureStorage
      .deleteItem(storageKeys.serverAddress)
      .catch((error) => logger.warn("server.address_persist_failed", { error: String(error) }));
  },
  hydrate: async (storage = secureStorage) => {
    try {
      const saved = await storage.getItem(storageKeys.serverAddress);
      if (saved) set({ override: saved });
    } catch (error) {
      logger.warn("server.address_load_failed", { error: String(error) });
    } finally {
      set({ hydrated: true });
    }
  },
}));

/** URL da API em uso agora: a escolhida pelo usuário ou a do build. */
export function currentApiUrl(): string {
  return useServerAddress.getState().override ?? env.apiUrl;
}

/** Versão reativa para telas. */
export function useApiUrl(): string {
  return useServerAddress((s) => s.override ?? env.apiUrl);
}
