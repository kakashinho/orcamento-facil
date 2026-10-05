import { Pressable, StyleSheet, View } from "react-native";
import { Icon } from "../icons/icon";
import { withAlpha } from "../theme/colors";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { Text } from "./text";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Botões segmentados do Material 3 (seleção única), como no protótipo. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.group, { borderColor: colors.outline }]}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const fg = selected ? colors.onSecondaryContainer : colors.onSurfaceVariant;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            android_ripple={{ color: withAlpha(fg, 0.12) }}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.secondaryContainer },
              index > 0 && { borderLeftWidth: 1, borderLeftColor: colors.outline },
            ]}
          >
            {selected ? <Icon name="check" size={15} color={fg} /> : null}
            <Text variant="bodySmall" weight="medium" color={fg} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: "row", borderWidth: 1, borderRadius: radii.full, overflow: "hidden", alignSelf: "stretch" },
  segment: {
    flex: 1,
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 8,
  },
});
