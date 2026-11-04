import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { ReductionGoal } from "@/data/api/types";
import { useDeleteReductionGoal, useReductionGoals } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { budgetFraction, REDUCTION_STATE_LABEL } from "@/domain/budgets";
import { formatMoney } from "@/domain/money";
import { Button, Dialog, Divider, IconButton, ProgressBar, resolveColor, Text, useTheme } from "@/ui";
import { SectionCard } from "../../analytics/components/section-card";
import { useFeedback } from "../../feedback/feedback-provider";
import { StateBadge } from "../components/state-badge";
import { ReductionGoalFormSheet } from "./reduction-goal-form-sheet";

/**
 * Metas de redução de gastos (R67) do mês escolhido: "Reduzir Alimentação em 10%", base (média dos 3
 * meses anteriores), alvo, gasto e estado; criar e encerrar com confirmação.
 */
export function ReductionGoals({ month }: { month: string }) {
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const goals = useReductionGoals(month);
  const remove = useDeleteReductionGoal();
  const [form, setForm] = useState({ open: false, key: 0 });
  const [ending, setEnding] = useState<ReductionGoal | null>(null);

  const end = () => {
    if (!ending) return;
    remove.mutate(ending.id, {
      onSuccess: () => {
        setEnding(null);
        showSnackbar("Meta de redução encerrada");
      },
      onError: (error) => {
        setEnding(null);
        showSnackbar(errorMessage(error));
      },
    });
  };

  const list = goals.data ?? [];
  return (
    <>
      <SectionCard
        title="Metas de redução"
        testID="reduction-goals"
        loading={goals.isPending}
        error={goals.error}
        onRetry={() => void goals.refetch()}
        action={
          <Button
            variant="text"
            icon="add"
            label="Nova"
            accessibilityLabel="Nova meta de redução"
            disabled={maintenance.active}
            onPress={() => setForm((f) => ({ open: true, key: f.key + 1 }))}
          />
        }
      >
        {list.length === 0 ? (
          <Text variant="bodySmall" color="onSurfaceVariant">
            Nenhuma meta de redução. Escolha uma categoria e um percentual para gastar menos que a média dos últimos 3
            meses.
          </Text>
        ) : (
          list.map((goal, index) => (
            <View key={goal.id}>
              {index > 0 ? <Divider style={styles.divider} /> : null}
              <ReductionGoalRow goal={goal} onEnd={goal.endMonth === null ? () => setEnding(goal) : undefined} />
            </View>
          ))
        )}
      </SectionCard>
      <ReductionGoalFormSheet
        key={`reduction-${form.key}`}
        open={form.open}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
      <Dialog
        open={!!ending}
        onClose={() => setEnding(null)}
        title="Encerrar meta de redução?"
        testID="end-reduction-dialog"
        icon="trending_down"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setEnding(null)} />
            <Button variant="danger" label="Encerrar" loading={remove.isPending} onPress={end} />
          </>
        }
      >
        {ending ? `A meta de ${ending.category.name} deixa de ser acompanhada a partir deste mês.` : ""}
      </Dialog>
    </>
  );
}

function ReductionGoalRow({ goal, onEnd }: { goal: ReductionGoal; onEnd?: () => void }) {
  const { colors } = useTheme();
  const color = resolveColor(colors, goal.state === "exceeded" ? "error" : "primary");
  const money = (value: number) => formatMoney(value, goal.currency);
  return (
    <View style={styles.row} testID={`reduction-${goal.id}`}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text weight="medium">{`Reduzir ${goal.category.name} em ${goal.percent}%`}</Text>
          <Text variant="label" color="onSurfaceVariant">
            {`Base: média de ${money(goal.baseline)} · alvo de ${money(goal.target)} por mês`}
          </Text>
        </View>
        {onEnd ? (
          <IconButton
            name="close"
            accessibilityLabel={`Encerrar meta de redução de ${goal.category.name}`}
            onPress={onEnd}
          />
        ) : null}
      </View>
      <ProgressBar value={budgetFraction(goal.spent, goal.target)} color={color} />
      <View style={styles.footer}>
        <Text variant="label" color="onSurfaceVariant">
          {goal.spent === null ? "Gasto indisponível (câmbio)" : `Gasto no mês: ${money(goal.spent)}`}
        </Text>
        <StateBadge label={REDUCTION_STATE_LABEL[goal.state]} color={color} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  divider: { marginVertical: 12 },
  flex: { flex: 1 },
});
