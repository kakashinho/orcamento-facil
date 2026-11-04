import { StyleSheet, View } from "react-native";
import type { Series } from "@/data/api/types";
import { Button, Icon, Text } from "@/ui";
import { ItemAvatar } from "../components/state-badge";
import { seriesAmountLabel, seriesKindLabel, seriesScheduleLabel } from "./account-labels";

/**
 * Uma recorrência (R37) ou parcelamento (R62): descrição, carteira e categoria, valor, rótulo
 * ("Repete todo mês", "Parcela 3/10"), próxima data e as ações da série ativa.
 */
export function SeriesRow({
  series,
  onEdit,
  onCancel,
  onRemind,
  reminded = false,
  disabled = false,
}: {
  series: Series;
  onEdit: () => void;
  onCancel: () => void;
  /** Só para despesas recorrentes ativas sem lembrete. */
  onRemind?: () => void;
  reminded?: boolean;
  disabled?: boolean;
}) {
  const active = series.status === "active";
  const place = [series.wallet.name, series.category?.name].filter(Boolean).join(" · ");
  return (
    <View style={styles.row} testID={`series-${series.id}`}>
      <View style={styles.top}>
        <ItemAvatar>
          <Icon
            name={series.kind === "installment" ? "credit_card" : "event_repeat"}
            size={20}
            color="onSecondaryContainer"
          />
        </ItemAvatar>
        <View style={styles.body}>
          <Text weight="medium" numberOfLines={1}>
            {series.description}
          </Text>
          <Text variant="label" color="onSurfaceVariant" numberOfLines={1}>
            {place}
          </Text>
        </View>
        <View style={styles.amount}>
          <Text variant="bodySmall" mono weight="medium" color={series.type === "income" ? "primary" : "onSurface"}>
            {seriesAmountLabel(series)}
          </Text>
          <Text variant="label" color="onSurfaceVariant">
            {seriesKindLabel(series)}
          </Text>
        </View>
      </View>
      <Text variant="label" color="onSurfaceVariant" testID="series-schedule">
        {seriesScheduleLabel(series)}
        {reminded ? " · com lembrete" : ""}
      </Text>
      {active ? (
        <View style={styles.actions}>
          {onRemind ? (
            <Button
              variant="text"
              icon="notifications_active"
              label="Criar lembrete"
              accessibilityLabel={`Criar lembrete para ${series.description}`}
              disabled={disabled}
              onPress={onRemind}
            />
          ) : null}
          <View style={styles.flex} />
          <Button
            variant="text"
            label="Editar"
            accessibilityLabel={`Editar ${series.description}`}
            disabled={disabled}
            onPress={onEdit}
          />
          <Button
            variant="text"
            label="Cancelar"
            accessibilityLabel={`Cancelar ${series.description}`}
            disabled={disabled}
            onPress={onCancel}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  body: { flex: 1, minWidth: 0 },
  amount: { alignItems: "flex-end" },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginLeft: -12 },
  flex: { flex: 1 },
});
