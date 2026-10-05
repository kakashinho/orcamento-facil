/**
 * Paleta Material Design 3 (R80) — mesmos tokens do protótipo (NavegVelOrAmentoFCil/src/index.css).
 * Cada cor tem a versão clara e a escura (R42).
 */
export interface Palette {
  background: string;
  onBackground: string;
  surface: string;
  surfaceVariant: string;
  onSurface: string;
  onSurfaceVariant: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorContainer: string;
  onErrorContainer: string;
  outline: string;
  outlineVariant: string;
  /** Snackbar (superfície inversa). */
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  scrim: string;
  /** Ícones sobre a cor da carteira. */
  onAccent: string;
}

export type ColorScheme = "light" | "dark";

export const palettes: Record<ColorScheme, Palette> = {
  light: {
    background: "#ffffff",
    onBackground: "#191c20",
    surface: "#ffffff",
    surfaceVariant: "#dfe3eb",
    onSurface: "#191c20",
    onSurfaceVariant: "#42474e",
    primary: "#1560d4",
    onPrimary: "#ffffff",
    primaryContainer: "#d6e3ff",
    onPrimaryContainer: "#001b3d",
    secondaryContainer: "#dae2f9",
    onSecondaryContainer: "#131c2b",
    tertiary: "#35618e",
    tertiaryContainer: "#d1e4ff",
    onTertiaryContainer: "#001d36",
    error: "#ba1a1a",
    onError: "#ffffff",
    errorContainer: "#ffdad6",
    onErrorContainer: "#93000a",
    outline: "#72777f",
    outlineVariant: "#c2c7cf",
    inverseSurface: "#322f2a",
    inverseOnSurface: "#f2efe6",
    inversePrimary: "#d6e3ff",
    scrim: "rgba(0,0,0,0.4)",
    onAccent: "#ffffff",
  },
  dark: {
    background: "#101318",
    onBackground: "#e0e2e8",
    surface: "#191c20",
    surfaceVariant: "#2b3038",
    onSurface: "#e0e2e8",
    onSurfaceVariant: "#c2c7cf",
    primary: "#a9c7ff",
    onPrimary: "#00305f",
    primaryContainer: "#004689",
    onPrimaryContainer: "#d6e3ff",
    secondaryContainer: "#3b4858",
    onSecondaryContainer: "#dae2f9",
    tertiary: "#a0cafd",
    tertiaryContainer: "#1c4975",
    onTertiaryContainer: "#d1e4ff",
    error: "#ffb4ab",
    onError: "#690005",
    errorContainer: "#93000a",
    onErrorContainer: "#ffdad6",
    outline: "#8c9199",
    outlineVariant: "#42474e",
    inverseSurface: "#e6e2d8",
    inverseOnSurface: "#1c1b17",
    inversePrimary: "#1560d4",
    scrim: "rgba(0,0,0,0.55)",
    onAccent: "#ffffff",
  },
};

/** Aplica transparência a uma cor #rrggbb (equivale ao `/40` do Tailwind). */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${value}${a}`;
}

/** Resolve um token da paleta ("primary") ou devolve a cor literal ("#fff"). */
export function resolveColor(colors: Palette, color: string): string {
  return color in colors ? colors[color as keyof Palette] : color;
}
