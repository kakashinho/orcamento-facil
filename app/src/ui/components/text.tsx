import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { resolveColor, type Palette } from "../theme/colors";
import { useTheme } from "../theme/theme-provider";
import { fontFamilies, fontWeights, typeScale, type FontWeight, type TypeVariant } from "../theme/typography";

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: keyof Palette | (string & {});
  weight?: FontWeight;
  /** Números financeiros em Roboto Mono, como no protótipo. */
  mono?: boolean;
  align?: "left" | "center" | "right";
}

/** Texto com a escala tipográfica do app. Acompanha a fonte do sistema até 1,3× (R82). */
export function Text({
  variant = "body",
  color = "onSurface",
  weight = "regular",
  mono = false,
  align,
  style,
  maxFontSizeMultiplier = 1.3,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  const family = mono ? (weight === "regular" ? fontFamilies.mono : fontFamilies.monoMedium) : fontFamilies.sans;
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        typeScale[variant],
        {
          color: resolveColor(colors, color),
          fontWeight: mono ? undefined : fontWeights[weight],
          fontFamily: family,
          textAlign: align,
        },
        mono && { fontVariant: ["tabular-nums"] },
        style,
      ]}
      {...rest}
    />
  );
}
