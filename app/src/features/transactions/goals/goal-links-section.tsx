import { StyleSheet, View } from "react-native";
import type { TransactionContribution } from "@/data/api/types";
import { useTransactionContributions } from "@/data/queries/planning";
import { formatMoney } from "@/domain/money";
import { Button, Icon, IconButton, radii, Skeleton, Text, useTheme } from "@/ui";

/** Metas para as quais a receita foi destinada (R17), com "Destinar a uma meta" e remover o vínculo. */
export function GoalLinksSection({
  transactionId,
  currency,
  enabled,
  disabled,
  removingId,
  onAdd,
  onRemove,
}: {
  transactionId: string;
  currency: string;
  /** Consulta só com os detalhes abertos (R86). */
  enabled: boolean;
  disabled: boolean;
  removingId: string | null;
  onAdd: (linked: TransactionContribution[]) => void;
  onRemove: (link: TransactionContribution) => void;
}) {
  const { colors } = useTheme();
  const links = useTransactionContributions(transactionId, enabled);
  const list = links.data ?? [];
  return (
    <View style={styles.root} testID="details-goals">
      <View style={styles.header}>
        <Text weight="medium" accessibilityRole="header" style={styles.flex}>
          Metas
        </Text>
        <Button
          variant="text"
          icon="flag"
          label="Destinar a uma meta"
          disabled={disabled || links.isPending}
          onPress={() => onAdd(list)}
        />
      </View>
      {links.isPending && enabled ? (
        <Skeleton style={styles.skeleton} />
      ) : links.isError ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Não foi possível carregar as metas desta receita.
        </Text>
      ) : list.length === 0 ? (
        <Text variant="bodySmall" color="onSurfaceVariant">
          Esta receita ainda não foi destinada a nenhuma meta.
        </Text>
      ) : (
        <View style={[styles.list, { borderColor: colors.outlineVariant }]}>
          {list.map((link, index) => (
            <View
              key={link.id}
              style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.outlineVariant }]}
            >
              <Icon name="flag" size={20} />
              <Text style={styles.flex} numberOfLines={1}>
                {link.goal.name}
              </Text>
              <Text mono variant="bodySmall">
                {formatMoney(link.amount, currency)}
              </Text>
              <IconButton
                name="close"
                size={32}
                accessibilityLabel={`Remover da meta ${link.goal.name}`}
                disabled={disabled || removingId === link.id}
                onPress={() => onRemove(link)}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  skeleton: { height: 48 },
  list: { borderWidth: 1, borderRadius: radii.lg },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 8, minHeight: 52 },
});
