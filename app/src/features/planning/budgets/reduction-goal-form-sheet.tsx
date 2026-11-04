import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf, isApiError } from "@/core/http/api-error";
import { useCategories } from "@/data/queries/finance";
import { useCreateReductionGoal } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { parseReductionPercent, REDUCTION_MAX, REDUCTION_MIN, REDUCTION_PRESETS } from "@/domain/budgets";
import { formatMoney } from "@/domain/money";
import { Banner, Button, SegmentedControl, Sheet, Text, TextField } from "@/ui";
import { useFeedback } from "../../feedback/feedback-provider";
import { MaintenanceBanner } from "../../system/maintenance-banner";
import { CategoryChips, spendingCategories } from "../components/category-chips";

type Choice = "5" | "10" | "20" | "custom";

/** Mensagens amigáveis para as recusas previstas da meta de redução (R67). */
export const REDUCTION_ERRORS: Record<string, string> = {
  NO_BASELINE:
    "Ainda não há gastos nesta categoria nos últimos 3 meses para servir de base. Escolha outra categoria ou tente mais tarde.",
  REDUCTION_GOAL_EXISTS: "Esta categoria já tem uma meta de redução ativa. Encerre a atual para criar outra.",
};

/**
 * Nova meta de redução (R67): categoria de despesa e percentual (5%, 10%, 20% ou outro de 1 a 90).
 * A base (média dos 3 meses anteriores) é calculada e congelada pelo servidor.
 */
export function ReductionGoalFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const categories = spendingCategories(useCategories().data ?? []);
  const create = useCreateReductionGoal();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice>("10");
  const [customText, setCustomText] = useState("");
  const [errors, setErrors] = useState<{ category?: string; percent?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    const percent = choice === "custom" ? parseReductionPercent(customText) : Number(choice);
    const found: typeof errors = {};
    if (!categoryId) found.category = "Escolha a categoria.";
    if (percent === null) found.percent = `Informe um percentual inteiro de ${REDUCTION_MIN} a ${REDUCTION_MAX}.`;
    setErrors(found);
    if (Object.keys(found).length || !categoryId || percent === null) return;

    create.mutate(
      { categoryId, percent },
      {
        onSuccess: (goal) => {
          onClose();
          showSnackbar(
            `Meta criada: base de ${formatMoney(goal.baseline, goal.currency)}, alvo de ${formatMoney(goal.target, goal.currency)} por mês`,
          );
        },
        onError: (error) => {
          const friendly = isApiError(error) ? REDUCTION_ERRORS[error.code] : undefined;
          const fields = fieldErrorsOf(error);
          if (friendly || fields.categoryId) setErrors({ category: friendly ?? fields.categoryId });
          else if (fields.percent) setErrors({ percent: fields.percent });
          else setFormError(errorMessage(error));
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nova meta de redução" testID="reduction-form">
      <View style={styles.form}>
        <MaintenanceBanner compact />
        {formError ? (
          <Banner icon="error" tone="error">
            {formError}
          </Banner>
        ) : null}
        <Text variant="bodySmall" color="onSurfaceVariant">
          A base é a média do que você gastou na categoria nos 3 meses anteriores. O alvo vale para cada mês.
        </Text>
        <CategoryChips
          categories={categories}
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            setErrors((current) => ({ ...current, category: undefined }));
          }}
          error={errors.category}
        />
        <View style={styles.field}>
          <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
            Reduzir em
          </Text>
          <SegmentedControl
            accessibilityLabel="Percentual de redução"
            value={choice}
            onChange={setChoice}
            options={[
              ...REDUCTION_PRESETS.map((value) => ({ value: String(value) as Choice, label: `${value}%` })),
              { value: "custom" as const, label: "Outro" },
            ]}
          />
        </View>
        {choice === "custom" ? (
          <TextField
            label="Percentual (1 a 90)"
            icon="percent"
            value={customText}
            onChangeText={setCustomText}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="15"
            error={errors.percent}
          />
        ) : errors.percent ? (
          <Text variant="label" color="error" style={styles.label}>
            {errors.percent}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <View style={styles.flex} />
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button
            icon="check"
            label="Criar meta"
            onPress={submit}
            loading={create.isPending}
            disabled={maintenance.active}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  field: { gap: 8 },
  label: { paddingHorizontal: 4 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
