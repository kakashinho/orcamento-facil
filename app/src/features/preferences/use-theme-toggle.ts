import { useCallback } from "react";
import { logger } from "@/core/logging/logger";
import type { ThemePreference } from "@/data/api/types";
import { useUpdateProfile } from "@/data/queries/account";
import { useSessionStore } from "@/data/session/session-store";
import { useResolvedScheme, useThemePreference } from "./theme-preference";

/** Troca o tema (R42) na hora e salva no perfil do usuário, para valer em outros aparelhos. */
export function useThemeControls() {
  const preference = useThemePreference((s) => s.preference);
  const setLocal = useThemePreference((s) => s.setPreference);
  const scheme = useResolvedScheme();
  const signedIn = useSessionStore((s) => s.status === "signedIn");
  const update = useUpdateProfile();
  const { mutate } = update;

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setLocal(next);
      if (signedIn) {
        mutate(
          { theme: next },
          { onError: (error) => logger.warn("preferences.theme_sync_failed", { error: String(error) }) },
        );
      }
    },
    [mutate, setLocal, signedIn],
  );

  const toggle = useCallback(() => setPreference(scheme === "dark" ? "light" : "dark"), [scheme, setPreference]);

  return { preference, scheme, setPreference, toggle };
}
