import { StyleSheet, View } from "react-native";
import type { Goal } from "@/data/api/types";
import { useGoals } from "@/data/queries/planning";
import { Chip, Text, TextField } from "@/ui";

/**
 * Escolha opcional de uma meta para a receita (R17). Só aparece quando há metas ativas; a
 * consulta só é feita quando o campo é montado (receita nova). Valor vazio = toda a receita.
 */
export function GoalDestinationField({
  goalId,
  onGoalChange,
  amountText,
  onAmountChange,
  error,
}: {
  goalId: string | null;
  onGoalChange: (goal: Goal | null) => void;
  amountText: string;
  onAmountChange: (text: string) => void;
  error?: string | null;
}) {
  const goals = useGoals("active").data ?? [];
  if (goals.length === 0) return null;
  return (
    <View style={styles.root} testID="goal-destination">
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        Destinar a uma meta (opcional)
      </Text>
      <View style={styles.chips}>
        {goals.map((goal) => (
          <Chip
            key={goal.id}
            icon="flag"
            label={goal.name}
            selected={goal.id === goalId}
            onPress={() => onGoalChange(goal.id === goalId ? null : goal)}
          />
        ))}
      </View>
      {goalId ? (
        <TextField
          label="Valor para a meta"
          icon="savings"
          value={amountText}
          onChangeText={onAmountChange}
          keyboardType="decimal-pad"
          placeholder="Toda a receita"
          helper="Deixe vazio para destinar toda a receita."
          error={error}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 4 },
  label: { paddingLeft: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 4 },
});
