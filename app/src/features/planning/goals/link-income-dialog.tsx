import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { ContributionResult, GoalDetail, Transaction } from "@/data/api/types";
import { useTransactionsInfinite } from "@/data/queries/finance";
import { useContribute } from "@/data/queries/planning";
import { formatDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import { Banner, Button, Dialog, Icon, radii, Spinner, Text, TextField, useTheme } from "@/ui";
import { goalAmountOf, validateGoalAmount } from "../../transactions/transaction-form";

const EMPTY_FILTERS = { type: "income" } as const;

/**
 * Vincular uma receita já registrada à meta, a partir do detalhe da meta (R17): lista as receitas
 * recentes que ainda não estão nela e pede o valor (vazio = todo o disponível). Erros de regra
 * (422/409) aparecem no campo de valor. Montado só quando aberto: a lista é consultada nessa hora (R86).
 */
export function LinkIncomeDialog({
  goal,
  onClose,
  onDone,
}: {
  goal: GoalDetail;
  onClose: () => void;
  onDone: (result: ContributionResult) => void;
}) {
  const { colors } = useTheme();
  const incomes = useTransactionsInfinite(EMPTY_FILTERS);
  const contribute = useContribute();
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [amountText, setAmountText] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkedIds = new Set(goal.contributions.map((contribution) => contribution.transaction.id));
  const available = (incomes.data?.pages ?? []).flatMap((page) => page.data).filter((t) => !linkedIds.has(t.id));

  const submit = () => {
    if (!selected) return;
    setError(null);
    const invalid = validateGoalAmount(amountText, selected.amount);
    setAmountError(invalid);
    if (invalid) return;
    contribute.mutate(
      { goalId: goal.id, transactionId: selected.id, amount: goalAmountOf(amountText) },
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
      title="Vincular receita"
      icon="savings"
      testID="link-income-dialog"
      actions={
        <>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Vincular" loading={contribute.isPending} disabled={!selected} onPress={submit} />
        </>
      }
    >
      <View style={styles.body}>
        {incomes.isPending ? (
          <Spinner />
        ) : incomes.isError ? (
          <Text color="onSurfaceVariant">Não foi possível carregar as receitas.</Text>
        ) : available.length === 0 ? (
          <Text color="onSurfaceVariant">
            Nenhuma receita disponível para vincular. Registre uma receita em Transações.
          </Text>
        ) : (
          <>
            <Text variant="bodySmall" color="onSurfaceVariant">
              Escolha uma receita recente para destinar a “{goal.name}”.
            </Text>
            <ScrollView style={styles.list} nestedScrollEnabled testID="link-income-list">
              {available.map((income) => {
                const isSelected = income.id === selected?.id;
                return (
                  <Pressable
                    key={income.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${income.description}, ${formatMoney(income.amount, income.currency)}, ${formatDate(income.date)}`}
                    onPress={() => {
                      setSelected(income);
                      setAmountError(null);
                    }}
                    style={[
                      styles.row,
                      { borderColor: isSelected ? colors.primary : colors.outlineVariant },
                      isSelected && { backgroundColor: colors.secondaryContainer },
                    ]}
                  >
                    <Icon name={isSelected ? "check_circle" : "payments"} size={20} />
                    <View style={styles.flex}>
                      <Text weight="medium" numberOfLines={1}>
                        {income.description}
                      </Text>
                      <Text variant="label" color="onSurfaceVariant">
                        {formatDate(income.date)} · {income.wallet.name}
                      </Text>
                    </View>
                    <Text mono variant="bodySmall">
                      {formatMoney(income.amount, income.currency)}
                    </Text>
                  </Pressable>
                );
              })}
              {incomes.hasNextPage ? (
                <Button
                  variant="text"
                  label="Carregar mais"
                  loading={incomes.isFetchingNextPage}
                  onPress={() => incomes.fetchNextPage()}
                />
              ) : null}
            </ScrollView>
            {selected ? (
              <TextField
                label="Valor para a meta"
                icon="savings"
                value={amountText}
                onChangeText={(text) => {
                  setAmountError(null);
                  setAmountText(text);
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={submit}
                placeholder="Todo o disponível"
                helper="Deixe vazio para destinar todo o valor disponível da receita."
                error={amountError}
              />
            ) : null}
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
  list: { maxHeight: 240 },
  flex: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    minHeight: 52,
  },
});
