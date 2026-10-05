import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { resolveColor, type Palette } from "../theme/colors";
import { useTheme } from "../theme/theme-provider";
import { fontFamilies } from "../theme/typography";
import glyphMap from "./glyph-map.json";
import type { IconName } from "./icon-names";

export type { IconName } from "./icon-names";

export interface IconProps {
  name: IconName;
  size?: number;
  /** Token da paleta ou cor literal. */
  color?: keyof Palette | (string & {});
  /** Variante preenchida (FILL=1), como `.msym.fill` no protótipo. */
  fill?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/** Ícone Material Symbols Rounded desenhado pela fonte reduzida em assets/fonts. */
export function Icon({ name, size = 24, color = "onSurfaceVariant", fill = false, style, testID }: IconProps) {
  const { colors } = useTheme();
  const codepoint = (glyphMap as Record<string, number>)[name];
  return (
    <Text
      testID={testID}
      accessible={false}
      importantForAccessibility="no"
      allowFontScaling={false}
      style={[
        styles.icon,
        {
          fontFamily: fill ? fontFamilies.iconsFilled : fontFamilies.icons,
          fontSize: size,
          lineHeight: size,
          width: size,
          height: size,
          color: resolveColor(colors, color),
        },
        style,
      ]}
    >
      {codepoint ? String.fromCodePoint(codepoint) : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  icon: { textAlign: "center", includeFontPadding: false, textAlignVertical: "center" },
});
