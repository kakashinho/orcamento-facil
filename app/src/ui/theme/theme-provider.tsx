import { createContext, useContext, useMemo, type ReactNode } from "react";
import { palettes, type ColorScheme, type Palette } from "./colors";

export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  dark: boolean;
}

const ThemeContext = createContext<Theme>({ scheme: "light", colors: palettes.light, dark: false });

/** Fornece a paleta do esquema ativo (claro/escuro) para os componentes (R42). */
export function ThemeProvider({ scheme, children }: { scheme: ColorScheme; children: ReactNode }) {
  const value = useMemo<Theme>(() => ({ scheme, colors: palettes[scheme], dark: scheme === "dark" }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
