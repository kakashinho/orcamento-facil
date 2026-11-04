import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { Goal, GoalDetail } from "@/data/api/types";
import { useCancelGoal, useGoal, useRemoveContribution } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatDate, todayIso } from "@/domain/dates";
import {
  deadlineLabel,
  GOAL_STATUS_LABEL,
  goalPercentLabel,
  goalRemainingLabel,
  progressFraction,
} from "@/domain/goals";
import { formatMoney } from "@/domain/money";
import { Banner, Button, Dialog, Divider, IconButton, ProgressBar, Sheet, Skeleton, Text } from "@/ui";
import { useFeedback } from "../../feedback/feedback-provider";

type Contribution = GoalDetail["contributions"][number];

/**
 * Detalhe da meta (R16, R17): progresso, prazo e as receitas destinadas a ela (data, descrição e o
 * valor que conta). Ações: editar, cancelar a meta e remover um vínculo, sempre com confirmação.
 */
export function GoalDetailsSheet({
  open,
  goalId,
  onClose,
  onEdit,
}: {
  open: boolean;
  goalId: string | null;
  onClose: () => void;
  onEdit: (goal: Goal) => void;
}) {
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const goal = useGoal(goalId);
  const cancel = useCancelGoal();
  const removeContribution = useRemoveContribution();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [unlinking, setUnlinking] = useState<Contribution | null>(null);
  const data = goal.data;

  const doCancel = () => {
    if (!data) return;
    cancel.mutate(data.id, {
      onSuccess: () => {
        setConfirmCancel(false);
        onClose();
        showSnackbar("Meta cancelada. As receitas continuam nas carteiras.");
      },
      onError: (error) => {
        setConfirmCancel(false);
        showSnackbar(errorMessage(error));
      },
    });
  };

  const doUnlink = () => {
    if (!data || !unlinking) return;
    removeContribution.mutate(
      { goalId: data.id, contributionId: unlinking.id },
      {
        onSuccess: () => {
          setUnlinking(null);
          showSnackbar("Receita desvinculada da meta");
        },
        onError: (error) => {
          setUnlinking(null);
          showSnackbar(errorMessage(error));
        },
      },
    );
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={data?.name ?? "Meta"} testID="goal-details">
        <View style={styles.content}>
          {goal.isPending ? (
            <Skeleton style={styles.skeleton} />
          ) : goal.isError || !data ? (
            <Banner icon="cloud_off" tone="error">
              {errorMessage(goal.error)}
            </Banner>
          ) : (
            <>
              <Summary goal={data} />
              <Text weight="medium" accessibilityRole="header">
                Receitas vinculadas
              </Text>
              {data.contributions.length === 0 ? (
                <Text variant="bodySmall" color="onSurfaceVariant">
                  Nenhuma receita destinada a esta meta ainda. Ao registrar uma receita, escolha “Destinar a uma meta”.
                </Text>
              ) : (
                <View testID="goal-contributions">
                  {data.contributions.map((contribution, index) => (
                    <View key={contribution.id}>
                      {index > 0 ? <Divider /> : null}
                      <ContributionRow
                        contribution={contribution}
                        onRemove={
                          data.status === "cancelled" || maintenance.active
                            ? undefined
                            : () => setUnlinking(contribution)
                        }
                      />
                    </View>
                  ))}
                </View>
              )}
              {data.status !== "cancelled" ? (
                <View style={styles.actions}>
                  <Button
                    variant="dangerOutlined"
                    label="Cancelar meta"
                    disabled={maintenance.active}
                    onPress={() => setConfirmCancel(true)}
                  />
                  <View style={styles.flex} />
                  <Button
                    variant="tonal"
                    icon="edit"
                    label="Editar"
                    disabled={maintenance.active}
                    onPress={() => onEdit(data)}
                  />
                </View>
              ) : null}
            </>
          )}
        </View>
      </Sheet>
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancelar meta?"
        testID="cancel-goal-dialog"
        icon="flag"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setConfirmCancel(false)} />
            <Button variant="danger" label="Cancelar meta" loading={cancel.isPending} onPress={doCancel} />
          </>
        }
      >
        A meta deixa de ser acompanhada. As receitas vinculadas continuam registradas nas carteiras.
      </Dialog>
      <Dialog
        open={!!unlinking}
        onClose={() => setUnlinking(null)}
        title="Desvincular receita?"
        testID="unlink-dialog"
        icon="cancel"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setUnlinking(null)} />
            <Button variant="danger" label="Desvincular" loading={removeContribution.isPending} onPress={doUnlink} />
          </>
        }
      >
        {unlinking
          ? `"${unlinking.transaction.description}" deixa de contar para a meta. A receita não é excluída.`
          : ""}
      </Dialog>
    </>
  );
}

function Summary({ goal }: { goal: GoalDetail }) {
  const money = (value: number) => formatMoney(value, goal.currency);
  const details = [
    goal.status === "active" ? deadlineLabel(goal.deadline, todayIso()) : GOAL_STATUS_LABEL[goal.status],
    `Prazo: ${formatDate(goal.deadline)}`,
    goal.category.name,
  ];
  return (
    <View style={styles.summary} testID="goal-summary">
      <Text variant="titleMedium" mono weight="medium">
        {goal.saved === null ? "—" : money(goal.saved)}{" "}
        <Text variant="body" color="onSurfaceVariant">
          de {money(goal.targetAmount)}
        </Text>
      </Text>
      <ProgressBar value={progressFraction(goal.saved, goal.targetAmount)} height={10} />
      <Text variant="bodySmall" color="onSurfaceVariant">
        {[goalPercentLabel(goal.percent), goalRemainingLabel(goal)].filter(Boolean).join(" · ")}
      </Text>
      <Text variant="label" color="onSurfaceVariant">
        {details.join(" · ")}
      </Text>
    </View>
  );
}

function ContributionRow({ contribution, onRemove }: { contribution: Contribution; onRemove?: () => void }) {
  const { transaction } = contribution;
  const counted = formatMoney(contribution.counted, transaction.currency);
  const partial = contribution.counted !== contribution.amount;
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text variant="bodySmall" weight="medium" numberOfLines={1}>
          {transaction.description}
        </Text>
        <Text variant="label" color="onSurfaceVariant">
          {formatDate(transaction.date)}
          {partial ? ` · ${formatMoney(contribution.amount, transaction.currency)} destinados` : ""}
        </Text>
      </View>
      <Text variant="bodySmall" mono weight="medium" color="primary">
        {counted}
      </Text>
      {onRemove ? (
        <IconButton
          name="close"
          size={32}
          accessibilityLabel={`Desvincular ${transaction.description}`}
          onPress={onRemove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingTop: 12 },
  summary: { gap: 8 },
  skeleton: { height: 160 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8 },
  flex: { flex: 1, minWidth: 0 },
});
