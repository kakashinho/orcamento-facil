import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { Goal, UpdateGoalRequest } from "@/data/api/types";
import { useCategories } from "@/data/queries/finance";
import { useCreateGoal, useUpdateGoal } from "@/data/queries/planning";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { todayIso } from "@/domain/dates";
import { deadlineError } from "@/domain/goals";
import { formatAmountInput, parseAmountInput } from "@/domain/money";
import { Banner, Button, DateField, Sheet, TextField } from "@/ui";
import { useFeedback } from "../../feedback/feedback-provider";
import { MaintenanceBanner } from "../../system/maintenance-banner";
import { AmountInput } from "../../transactions/components/amount-input";
import { CategoryChips, spendingCategories } from "../components/category-chips";

type Errors = Partial<Record<"name" | "targetAmount" | "deadline" | "categoryId", string>>;
const FIELDS = ["name", "targetAmount", "deadline", "categoryId"] as const;

/**
 * Criar ou editar uma meta de economia (R15): nome, valor alvo, data limite (a partir de hoje) e a
 * categoria associada (de despesa ou de ambos os tipos — D-40). Remontada (key) a cada abertura.
 */
export function GoalFormSheet({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Goal | null;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const currency = editing?.currency ?? user?.primaryCurrency ?? "BRL";
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const categories = spendingCategories(useCategories().data ?? []);
  const create = useCreateGoal();
  const update = useUpdateGoal();

  const [name, setName] = useState(editing?.name ?? "");
  const [amountText, setAmountText] = useState(editing ? formatAmountInput(editing.targetAmount) : "");
  const [deadline, setDeadline] = useState(editing?.deadline ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category.id ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const fail = (error: unknown) => {
    const fields = fieldErrorsOf(error);
    const mapped: Errors = {};
    for (const field of FIELDS) if (fields[field]) mapped[field] = fields[field];
    if (Object.keys(mapped).length) setErrors(mapped);
    else setFormError(errorMessage(error));
  };

  const submit = () => {
    setFormError(null);
    const targetAmount = parseAmountInput(amountText);
    const found: Errors = {};
    if (!name.trim()) found.name = "Dê um nome para a meta.";
    if (targetAmount === null || targetAmount <= 0) found.targetAmount = "Informe um valor alvo maior que zero.";
    // Na edição, um prazo já vencido e não alterado continua aceito (o servidor só valida o que muda).
    const deadlineProblem = editing && deadline === editing.deadline ? null : deadlineError(deadline, todayIso());
    if (deadlineProblem) found.deadline = deadlineProblem;
    if (!categoryId) found.categoryId = "Escolha a categoria da meta.";
    setErrors(found);
    if (Object.keys(found).length || targetAmount === null || !categoryId) return;

    if (editing) {
      const body: UpdateGoalRequest = {
        ...(name.trim() !== editing.name ? { name: name.trim() } : {}),
        ...(targetAmount !== editing.targetAmount ? { targetAmount } : {}),
        ...(deadline !== editing.deadline ? { deadline } : {}),
        ...(categoryId !== editing.category.id ? { categoryId } : {}),
      };
      if (Object.keys(body).length === 0) return onClose();
      update.mutate(
        { id: editing.id, body },
        {
          onSuccess: () => {
            onClose();
            showSnackbar("Meta atualizada");
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(
      { name: name.trim(), targetAmount, deadline, categoryId },
      {
        onSuccess: () => {
          onClose();
          showSnackbar("Meta criada");
        },
        onError: fail,
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Editar meta" : "Nova meta"} testID="goal-form">
      <View style={styles.form}>
        <MaintenanceBanner compact />
        {formError ? (
          <Banner icon="error" tone="error">
            {formError}
          </Banner>
        ) : null}
        <TextField
          label="Nome da meta"
          icon="flag"
          value={name}
          onChangeText={setName}
          placeholder="Ex.: Viagem de férias"
          maxLength={80}
          error={errors.name}
        />
        <AmountInput
          label="Valor alvo"
          value={amountText}
          onChangeText={setAmountText}
          currency={currency}
          tone="income"
          error={errors.targetAmount}
        />
        <DateField label="Data limite" value={deadline} onChange={setDeadline} error={errors.deadline} />
        <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} error={errors.categoryId} />
        <View style={styles.actions}>
          <View style={styles.flex} />
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button
            icon="check"
            label={editing ? "Salvar" : "Criar meta"}
            onPress={submit}
            loading={create.isPending || update.isPending}
            disabled={maintenance.active}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
