import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { ContributionResult, Transaction, TransactionContribution } from "@/data/api/types";
import { useContribute, useGoals } from "@/data/queries/planning";
import { Banner, Button, Chip, Dialog, Spinner, Text, TextField } from "@/ui";
import { goalAmountOf, validateGoalAmount } from "../transaction-form";

/**
 * Destinar uma receita já registrada a uma meta (R17), toda ou parte. Erros de regra (422/409:
 * valor acima do disponível, vínculo repetido) aparecem no campo de valor. Montado só quando
 * aberto: a lista de metas só é consultada nessa hora (R86).
 */
export function ContributionDialog({
  transaction,
  linked,
  onClose,
  onDone,
}: {
  transaction: Transaction;
  /** Metas já vinculadas (ficam fora da lista). */
  linked: TransactionContribution[];
  onClose: () => void;
  onDone: (result: ContributionResult) => void;
}) {
  const goals = useGoals("active");
  const contribute = useContribute();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = new Set(linked.map((link) => link.goal.id));
  const available = (goals.data ?? []).filter((goal) => !linkedIds.has(goal.id));

  const submit = () => {
    if (!goalId) return;
    setError(null);
    const invalid = validateGoalAmount(amountText, transaction.amount);
    setAmountError(invalid);
    if (invalid) return;
    contribute.mutate(
      { goalId, transactionId: transaction.id, amount: goalAmountOf(amountText) },
      {
        onSuccess: onDone,
        onError: (e) => {
          const fields = fieldErrorsOf(e);
          const field = fields.amount ?? fields.transactionId;
          if (field) setAmountError(field);
          else setError(errorMessage(e));
        },
      },
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Destinar a uma meta"
      icon="flag"
      testID="contribution-dialog"
      actions={
        <>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Destinar" loading={contribute.isPending} disabled={!goalId} onPress={submit} />
        </>
      }
    >
      <View style={styles.body}>
        {goals.isPending ? (
          <Spinner />
        ) : goals.isError ? (
          <Text color="onSurfaceVariant">Não foi possível carregar as metas.</Text>
        ) : available.length === 0 ? (
          <Text color="onSurfaceVariant">Nenhuma meta ativa disponível. Crie uma meta em Planejamento.</Text>
        ) : (
          <>
            <View style={styles.chips}>
              {available.map((goal) => (
                <Chip
                  key={goal.id}
                  icon="flag"
                  label={goal.name}
                  selected={goal.id === goalId}
                  onPress={() => setGoalId(goal.id)}
                />
              ))}
            </View>
            <TextField
              label="Valor para a meta"
              icon="savings"
              value={amountText}
              onChangeText={(text) => {
                setAmountError(null);
                setAmountText(text);
              }}
              keyboardType="decimal-pad"
              placeholder="Todo o disponível"
              helper="Deixe vazio para destinar todo o valor disponível da receita."
              error={amountError}
            />
          </>
        )}
        {error ? (
          <Banner icon="error" tone="error">
            {error}
          </Banner>
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
