import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useDebouncedValue } from "@/core/hooks/use-debounced-value";
import { useConversion } from "@/data/queries/finance";
import { COMMON_CURRENCIES, formatMoney, parseAmountInput } from "@/domain/money";
import { Button, Chip, Dialog, fontFamilies, radii, Text, useTheme } from "@/ui";

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Conversor de moedas com cotação atualizada da ExchangeRate-API, consultada pelo servidor (R29). */
export function ConverterDialog({
  open,
  onClose,
  defaultFrom = "BRL",
}: {
  open: boolean;
  onClose: () => void;
  defaultFrom?: string;
}) {
  const { colors } = useTheme();
  const [amountText, setAmountText] = useState("100");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultFrom === "USD" ? "BRL" : "USD");
  const amount = useDebouncedValue(parseAmountInput(amountText) ?? 0, 400);
  const conversion = useConversion(from, to, amount);
  const data = conversion.data;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Conversor de moedas"
      icon="currency_exchange"
      testID="converter"
      actions={<Button label="Fechar" onPress={onClose} />}
    >
      <View style={styles.body}>
        <View style={[styles.input, { borderColor: colors.outline }]}>
          <Text variant="caption" color="onSurfaceVariant">
            Valor
          </Text>
          <TextInput
            accessibilityLabel="Valor a converter"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            style={[styles.amount, { color: colors.onSurface, fontFamily: fontFamilies.mono }]}
          />
        </View>
        <View style={styles.columns}>
          {(["from", "to"] as const).map((side) => (
            <View key={side} style={styles.column}>
              <Text variant="caption" color="onSurfaceVariant">
                {side === "from" ? "De" : "Para"}
              </Text>
              <View style={styles.chips}>
                {COMMON_CURRENCIES.map((code) => (
                  <Chip
                    key={code}
                    label={code}
                    selected={(side === "from" ? from : to) === code}
                    accessibilityLabel={`${side === "from" ? "De" : "Para"} ${code}`}
                    onPress={() => (side === "from" ? setFrom(code) : setTo(code))}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
        <View style={[styles.result, { backgroundColor: colors.primaryContainer }]}>
          <Text variant="label" color="onPrimaryContainer" align="center">
            {formatMoney(amount, from)} equivale a
          </Text>
          <Text mono variant="titleLarge" color="onPrimaryContainer" align="center" testID="converter-result">
            {from === to
              ? formatMoney(amount, to)
              : data
                ? formatMoney(data.result, to)
                : conversion.isError
                  ? "—"
                  : "…"}
          </Text>
        </View>
        <Text variant="caption" color="onSurfaceVariant" align="center">
          {from === to
            ? "Escolha moedas diferentes."
            : data
              ? `ExchangeRate-API · 1 ${from} = ${data.rate.toFixed(4).replace(".", ",")} ${to} · ${formatUpdatedAt(data.updatedAt)}${data.stale ? " (cache)" : ""}`
              : conversion.isError
                ? "Cotação indisponível no momento."
                : "Consultando cotação…"}
        </Text>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  input: { borderWidth: 1, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 8 },
  amount: { fontSize: 20, paddingVertical: 0 },
  columns: { flexDirection: "row", gap: 8 },
  column: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  result: { borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 12 },
});
