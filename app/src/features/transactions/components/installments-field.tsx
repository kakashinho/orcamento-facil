import { StyleSheet, View } from "react-native";
import {
  formatInstallmentsPreview,
  MAX_INSTALLMENTS,
  MIN_INSTALLMENTS,
  parseInstallmentsInput,
  previewInstallments,
  SERIES_HELP,
} from "@/domain/series";
import { Switch, Text, TextField } from "@/ui";

/**
 * Parcelar uma despesa (R62): o valor digitado é o total, dividido em parcelas mensais; a prévia
 * usa a mesma regra do servidor (a sobra da divisão fica na 1ª parcela).
 */
export function InstallmentsField({
  enabled,
  onToggle,
  countText,
  onCountChange,
  total,
  currency,
  error,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  countText: string;
  onCountChange: (text: string) => void;
  /** Valor total digitado (null se ainda inválido). */
  total: number | null;
  currency: string;
  error?: string | null;
}) {
  const count = parseInstallmentsInput(countText);
  const preview = total !== null && count !== null ? previewInstallments(total, count) : null;
  return (
    <View style={styles.root} testID="installments-field">
      <View style={styles.toggle}>
        <View style={styles.flex}>
          <Text weight="medium">Parcelar</Text>
          <Text variant="label" color="onSurfaceVariant">
            O valor digitado é o total da compra.
          </Text>
        </View>
        <Switch value={enabled} onValueChange={onToggle} accessibilityLabel="Parcelar" />
      </View>
      {enabled ? (
        <>
          <TextField
            label="Número de parcelas"
            icon="credit_card"
            value={countText}
            onChangeText={(text) => onCountChange(text.replace(/\D/g, ""))}
            keyboardType="number-pad"
            maxLength={2}
            helper={`De ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas mensais`}
            error={error}
          />
          {preview ? (
            <Text variant="bodySmall" weight="medium" testID="installments-preview" style={styles.text}>
              {formatInstallmentsPreview(preview, currency)}
            </Text>
          ) : null}
          <Text variant="label" color="onSurfaceVariant" style={styles.text}>
            {SERIES_HELP}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 4 },
  flex: { flex: 1 },
  text: { paddingLeft: 4 },
});
