import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { BudgetPeriod, BudgetStatus } from "@/data/api/types";
import { useCreateBudget, useDeleteBudget, useUpdateBudget } from "@/data/queries/planning";
import { useCategories } from "@/data/queries/finance";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatAmountInput, parseAmountInput } from "@/domain/money";
import { Banner, Button, Dialog, SegmentedControl, Sheet, Text } from "@/ui";
import { useFeedback } from "../../feedback/feedback-provider";
import { MaintenanceBanner } from "../../system/maintenance-banner";
import { AmountInput } from "../../transactions/components/amount-input";
import { CategoryChips, spendingCategories } from "../components/category-chips";

type Errors = Partial<Record<"category" | "amount" | "period", string>>;

/** Erros por campo do servidor (`categoryId`, `amount`, `period`) para os campos do formulário. */
function mapErrors(fields: Record<string, string>): Errors {
  const result: Errors = {};
  if (fields.categoryId) result.category = fields.categoryId;
  if (fields.amount) result.amount = fields.amount;
  if (fields.period) result.period = fields.period;
  return result;
}

/**
 * Criar, alterar ou encerrar um orçamento mensal (R21) ou limite diário (R74). A categoria aceita
 * só despesa ou ambos; na edição muda apenas o valor, que vale a partir do mês atual.
 */
export function BudgetFormSheet({
  open,
  editing,
  defaultPeriod = "monthly",
  onClose,
}: {
  open: boolean;
  editing: BudgetStatus | null;
  defaultPeriod?: BudgetPeriod;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const currency = editing?.currency ?? user?.primaryCurrency ?? "BRL";
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const categories = spendingCategories(useCategories().data ?? []);
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();

  const [categoryId, setCategoryId] = useState<string | null>(editing?.category.id ?? null);
  const [period, setPeriod] = useState<BudgetPeriod>(editing?.period ?? defaultPeriod);
  const [amountText, setAmountText] = useState(editing ? formatAmountInput(editing.limit) : "");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const fail = (error: unknown) => {
    const fields = mapErrors(fieldErrorsOf(error));
    if (Object.keys(fields).length) setErrors(fields);
    else setFormError(errorMessage(error));
  };

  const submit = () => {
    setFormError(null);
    const amount = parseAmountInput(amountText);
    const found: Errors = {};
    if (!categoryId) found.category = "Escolha a categoria.";
    if (amount === null || amount <= 0) found.amount = "Informe um valor maior que zero, com até duas casas decimais.";
    setErrors(found);
    if (Object.keys(found).length || amount === null || !categoryId) return;

    if (editing) {
      if (amount === editing.limit) return onClose();
      update.mutate(
        { id: editing.budgetId, amount },
        {
          onSuccess: () => {
            onClose();
            showSnackbar("Orçamento atualizado a partir deste mês");
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(
      { categoryId, period, amount },
      {
        onSuccess: () => {
          onClose();
          showSnackbar(period === "monthly" ? "Orçamento criado" : "Limite diário criado");
        },
        onError: fail,
      },
    );
  };

  const end = () => {
    if (!editing) return;
    remove.mutate(editing.budgetId, {
      onSuccess: () => {
        setConfirmEnd(false);
        onClose();
        showSnackbar("Orçamento encerrado");
      },
      onError: (error) => {
        setConfirmEnd(false);
        fail(error);
      },
    });
  };

  const title = editing
    ? editing.period === "monthly"
      ? "Editar orçamento"
      : "Editar limite diário"
    : "Novo orçamento";

  return (
    <>
      <Sheet open={open} onClose={onClose} title={title} testID="budget-form">
        <View style={styles.form}>
          <MaintenanceBanner compact />
          {formError ? (
            <Banner icon="error" tone="error">
              {formError}
            </Banner>
          ) : null}

          {editing ? (
            <Banner icon="info" tone="primary">
              {`${editing.category.name} · ${editing.period === "monthly" ? "Mensal" : "Diário"}. Vale a partir deste mês; os meses anteriores mantêm o limite antigo.`}
            </Banner>
          ) : (
            <>
              <CategoryChips
                categories={categories}
                value={categoryId}
                onChange={setCategoryId}
                error={errors.category}
              />
              <View style={styles.field}>
                <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
                  Período
                </Text>
                <SegmentedControl
                  accessibilityLabel="Período do orçamento"
                  value={period}
                  onChange={setPeriod}
                  options={[
                    { value: "monthly", label: "Mensal" },
                    { value: "daily", label: "Diário" },
                  ]}
                />
                {errors.period ? (
                  <Text variant="label" color="error" style={styles.label}>
                    {errors.period}
                  </Text>
                ) : null}
              </View>
            </>
          )}

          <AmountInput
            label={period === "monthly" ? "Limite do mês" : "Limite do dia"}
            value={amountText}
            onChangeText={setAmountText}
            currency={currency}
            tone="neutral"
            error={errors.amount}
          />

          <View style={styles.actions}>
            {editing ? (
              <Button
                variant="dangerOutlined"
                label="Encerrar orçamento"
                disabled={maintenance.active}
                onPress={() => setConfirmEnd(true)}
              />
            ) : null}
            <View style={styles.flex} />
            <Button variant="text" label="Cancelar" onPress={onClose} />
            <Button
              icon="check"
              label={editing ? "Salvar" : "Criar"}
              onPress={submit}
              loading={create.isPending || update.isPending}
              disabled={!amountText || maintenance.active}
            />
          </View>
        </View>
      </Sheet>
      <Dialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="Encerrar orçamento?"
        testID="end-budget-dialog"
        icon="event"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setConfirmEnd(false)} />
            <Button variant="danger" label="Encerrar" loading={remove.isPending} onPress={end} />
          </>
        }
      >
        O limite deixa de valer a partir deste mês. Os meses anteriores continuam no histórico.
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  field: { gap: 8 },
  label: { paddingHorizontal: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  flex: { flex: 1 },
});
