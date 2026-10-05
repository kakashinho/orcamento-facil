import { useColorScheme } from "react-native";
import { create } from "zustand";
import { logger } from "@/core/logging/logger";
import { secureStorage, storageKeys, type KeyValueStore } from "@/core/storage/secure-storage";
import type { ThemePreference } from "@/data/api/types";
import type { ColorScheme } from "@/ui";

/**
 * Tema do app (R42): "system" segue o aparelho, "light"/"dark" fixam o esquema.
 * Fica salvo no aparelho (vale já na tela de login) e no perfil do usuário na API.
 */
interface ThemePreferenceState {
  preference: ThemePreference;
  hydrated: boolean;
  setPreference: (preference: ThemePreference) => void;
  hydrate: (storage?: KeyValueStore) => Promise<void>;
}

const VALID: ThemePreference[] = ["system", "light", "dark"];

export const useThemePreference = create<ThemePreferenceState>((set) => ({
  preference: "system",
  hydrated: false,
  setPreference: (preference) => {
    set({ preference });
    secureStorage
      .setItem(storageKeys.themePreference, preference)
      .catch((error) => logger.warn("preferences.theme_persist_failed", { error: String(error) }));
  },
  hydrate: async (storage = secureStorage) => {
    try {
      const saved = await storage.getItem(storageKeys.themePreference);
      if (saved && VALID.includes(saved as ThemePreference)) set({ preference: saved as ThemePreference });
    } finally {
      set({ hydrated: true });
    }
  },
}));

export function resolveScheme(preference: ThemePreference, system: ColorScheme | null | undefined): ColorScheme {
  if (preference === "system") return system === "dark" ? "dark" : "light";
  return preference;
}

/** Esquema efetivo (claro/escuro) considerando a preferência e o aparelho. */
export function useResolvedScheme(): ColorScheme {
  const preference = useThemePreference((s) => s.preference);
  const system = useColorScheme();
  return resolveScheme(preference, system === "dark" || system === "light" ? system : null);
}
