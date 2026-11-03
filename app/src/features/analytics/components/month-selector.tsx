import { StyleSheet, View } from "react-native";
import { monthLabel, shiftMonth } from "@/domain/dates";
import { IconButton, Text } from "@/ui";

/** Mês anterior / próximo, sem passar de `max` (normalmente o mês atual). */
export function MonthSelector({
  month,
  onChange,
  max,
  testID,
}: {
  month: string;
  onChange: (month: string) => void;
  max?: string;
  testID?: string;
}) {
  const atMax = !!max && month >= max;
  return (
    <View style={styles.row} testID={testID}>
      <IconButton
        name="chevron_left"
        accessibilityLabel="Mês anterior"
        color="onSurface"
        onPress={() => onChange(shiftMonth(month, -1))}
      />
      <Text weight="medium" style={styles.label} accessibilityLiveRegion="polite">
        {monthLabel(month)}
      </Text>
      <IconButton
        name="chevron_right"
        accessibilityLabel="Próximo mês"
        color="onSurface"
        disabled={atMax}
        onPress={() => onChange(shiftMonth(month, 1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { flex: 1, textAlign: "center" },
});
