import { createMemoryStorage, storageKeys } from "@/core/storage/secure-storage";
import { resolveScheme, useThemePreference } from "./theme-preference";

describe("tema (R42)", () => {
  it("segue o aparelho em 'system' e fixa claro/escuro", () => {
    expect(resolveScheme("system", "dark")).toBe("dark");
    expect(resolveScheme("system", null)).toBe("light");
    expect(resolveScheme("dark", "light")).toBe("dark");
    expect(resolveScheme("light", "dark")).toBe("light");
  });

  it("recupera a preferência salva no aparelho", async () => {
    await useThemePreference.getState().hydrate(createMemoryStorage({ [storageKeys.themePreference]: "dark" }));
    expect(useThemePreference.getState()).toMatchObject({ preference: "dark", hydrated: true });
  });

  it("ignora valor salvo inválido", async () => {
    await useThemePreference.getState().hydrate(createMemoryStorage({ [storageKeys.themePreference]: "azul" }));
    expect(useThemePreference.getState()).toMatchObject({ preference: "system", hydrated: true });
  });
});
