import { StyleSheet, View } from "react-native";
import type { Frequency } from "@/data/api/types";
import { FREQUENCY_LABEL, SERIES_HELP } from "@/domain/series";
import { DateField, SegmentedControl, Text } from "@/ui";

/**
 * Frequência e data final opcional de uma recorrência (R37). Com `allowNone`, a primeira opção é
 * "Não" (formulário de nova transação); sem ela, só as frequências ("Marcar como recorrente").
 */
export function RepeatField<T extends Frequency | "none">({
  value,
  onChange,
  endDate,
  onEndDateChange,
  endDateError,
  allowNone = false,
}: {
  value: T;
  onChange: (value: T) => void;
  endDate: string;
  onEndDateChange: (date: string) => void;
  endDateError?: string | null;
  allowNone?: boolean;
}) {
  const frequencies = (Object.keys(FREQUENCY_LABEL) as Frequency[]).map((frequency) => ({
    value: frequency as T,
    label: FREQUENCY_LABEL[frequency],
  }));
  const options = allowNone ? [{ value: "none" as T, label: "Não" }, ...frequencies] : frequencies;
  return (
    <View style={styles.root} testID="repeat-field">
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        Repetir
      </Text>
      <SegmentedControl accessibilityLabel="Repetir" value={value} onChange={onChange} options={options} />
      {value !== "none" ? (
        <>
          <DateField
            label="Data final (opcional)"
            value={endDate}
            onChange={onEndDateChange}
            clearable
            placeholder="Sem data final"
            error={endDateError}
          />
          <Text variant="label" color="onSurfaceVariant" style={styles.label}>
            {SERIES_HELP}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  label: { paddingLeft: 4 },
});
