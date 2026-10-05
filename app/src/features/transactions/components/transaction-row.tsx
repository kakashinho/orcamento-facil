import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Transaction } from "@/data/api/types";
import { formatDate } from "@/domain/dates";
import { formatSignedMoney } from "@/domain/money";
import { Icon, radii, Text, useTheme, withAlpha, type IconName } from "@/ui";

/** Altura fixa da linha: permite `getItemLayout` na FlatList (rolagem eficiente — R09/R83). */
export const TRANSACTION_ROW_HEIGHT = 68;

/** Linha da lista de transações, como `TxRow` no protótipo. */
export const TransactionRow = memo(function TransactionRow({
  transaction,
  icon,
  onPress,
}: {
  transaction: Transaction;
  icon: IconName;
  onPress: (transaction: Transaction) => void;
}) {
  const { colors } = useTheme();
  const income = transaction.type === "income";
  const amount = formatSignedMoney(transaction.amount, transaction.currency, income ? "in" : "out");
  const subtitle = `${transaction.category?.name ?? "Sem categoria"} · ${transaction.wallet.name}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.description}, ${income ? "receita" : "despesa"} de ${amount}, ${formatDate(transaction.date, "long")}`}
      onPress={() => onPress(transaction)}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={styles.row}
    >
      <View style={[styles.icon, { backgroundColor: colors.surfaceVariant }]}>
        <Icon name={icon} size={22} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.flexShrink}>
            {transaction.description}
          </Text>
          {transaction.archived ? <Icon name="inventory_2" size={14} /> : null}
        </View>
        <Text variant="label" color="onSurfaceVariant" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text mono color={income ? "primary" : "onSurface"} numberOfLines={1}>
          {amount}
        </Text>
        <Text variant="caption" color="onSurfaceVariant">
          {formatDate(transaction.date, "dayMonth")}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: TRANSACTION_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    overflow: "hidden",
  },
  icon: { width: 44, height: 44, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  flexShrink: { flexShrink: 1 },
  trailing: { alignItems: "flex-end", maxWidth: "45%" },
});
