import type { TextStyle } from "react-native";

/** Fontes embarcadas pelo plugin expo-font (o nome é o do arquivo). Roboto é a fonte do sistema Android. */
export const fontFamilies = {
  sans: undefined as string | undefined,
  mono: "RobotoMono-Regular",
  monoMedium: "RobotoMono-Medium",
  icons: "MaterialSymbolsRounded",
  iconsFilled: "MaterialSymbolsRoundedFilled",
};

/** Escala tipográfica do protótipo (tamanhos do Tailwind usados em cada tela). */
export const typeScale = {
  display: { fontSize: 28, lineHeight: 34 },
  headline: { fontSize: 24, lineHeight: 32 },
  titleLarge: { fontSize: 20, lineHeight: 28 },
  titleMedium: { fontSize: 18, lineHeight: 26 },
  title: { fontSize: 16, lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 20 },
  bodySmall: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, lineHeight: 16 },
  caption: { fontSize: 11, lineHeight: 15 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof typeScale;

export const fontWeights = {
  regular: "400",
  medium: "500",
  bold: "700",
} as const satisfies Record<string, TextStyle["fontWeight"]>;

export type FontWeight = keyof typeof fontWeights;
