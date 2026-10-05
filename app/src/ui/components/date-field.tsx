import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "../icons/icon";
import { radii } from "../theme/metrics";
import { useTheme } from "../theme/theme-provider";
import { IconButton } from "./icon-button";
import { Text } from "./text";

/** "2026-10-04" → Date local ao meio-dia (evita troca de dia pelo fuso). */
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12);
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function display(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export interface DateFieldProps {
  label: string;
  /** Data AAAA-MM-DD ou vazio. */
  value: string;
  onChange: (value: string) => void;
  /** Permite limpar o campo (filtros opcionais). */
  clearable?: boolean;
  placeholder?: string;
  error?: string | null;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Campo de data que abre o seletor nativo do Android. Valor no formato da API (AAAA-MM-DD). */
export function DateField({
  label,
  value,
  onChange,
  clearable,
  placeholder = "Selecionar",
  error,
  compact,
  style,
}: DateFieldProps) {
  const { colors } = useTheme();
  const open = () => {
    DateTimePickerAndroid.open({
      value: value ? toDate(value) : new Date(),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(toIso(date));
      },
    });
  };
  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? display(value) : placeholder}`}
        onPress={open}
        style={[
          styles.field,
          compact ? styles.compact : styles.regular,
          { borderColor: error ? colors.error : colors.outline, backgroundColor: colors.surface },
        ]}
      >
        {!compact ? <Icon name="event" size={20} /> : null}
        <View style={styles.body}>
          <Text variant="caption" weight="medium" color={error ? "error" : "onSurfaceVariant"}>
            {label}
          </Text>
          <Text color={value ? "onSurface" : "onSurfaceVariant"}>{value ? display(value) : placeholder}</Text>
        </View>
        {clearable && value ? (
          <IconButton name="close" size={32} onPress={() => onChange("")} accessibilityLabel={`Limpar ${label}`} />
        ) : (
          <Icon name="calendar_month" size={18} />
        )}
      </Pressable>
      {error ? (
        <Text variant="label" color="error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12 },
  regular: { minHeight: 56, borderRadius: radii.xxl },
  compact: { minHeight: 52, borderRadius: radii.lg },
  body: { flex: 1 },
  error: { marginTop: 4, paddingHorizontal: 4 },
});
