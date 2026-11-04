import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import type { Goal, GoalStatus } from "@/data/api/types";
import { useGoals } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { Banner, Button, EmptyState, Grid, SegmentedControl, Skeleton, useResponsiveLayout } from "@/ui";
import { SectionScroll } from "../components/section-scroll";
import { GoalCard } from "./goal-card";
import { GoalDetailsSheet } from "./goal-details-sheet";
import { GoalFormSheet } from "./goal-form-sheet";

const EMPTY: Record<GoalStatus, { title: string; description: string }> = {
  active: {
    title: "Nenhuma meta em andamento",
    description: "Crie uma meta, como uma viagem ou uma reserva, e destine receitas a ela.",
  },
  achieved: { title: "Nenhuma meta atingida", description: "As metas completas aparecem aqui." },
  cancelled: { title: "Nenhuma meta cancelada", description: "As metas canceladas aparecem aqui." },
};

/**
 * Planejamento › Metas: metas de economia (R15) com progresso (R16), filtro Ativas · Atingidas ·
 * Canceladas e o detalhe com as receitas vinculadas (R17).
 */
export function GoalsSection({ openGoalId = null }: { openGoalId?: string | null }) {
  const queryClient = useQueryClient();
  const layout = useResponsiveLayout();
  const maintenance = useMaintenance();
  const [status, setStatus] = useState<GoalStatus>("active");
  const goals = useGoals(status);
  const [form, setForm] = useState<{ open: boolean; editing: Goal | null; key: number }>({
    open: false,
    editing: null,
    key: 0,
  });
  // O id fica guardado ao fechar: a folha mostra a meta até o fim da animação de saída.
  const [details, setDetails] = useState<{ id: string | null; open: boolean }>({ id: null, open: false });
  // Pedido de um aviso: abre o detalhe da meta (qualquer status) uma única vez por id.
  const [openedFromRoute, setOpenedFromRoute] = useState<string | null>(null);
  if (openGoalId && openGoalId !== openedFromRoute) {
    setOpenedFromRoute(openGoalId);
    setDetails({ id: openGoalId, open: true });
  }
  useScreenMetric("planning.goals", !!goals.data);

  const openForm = (editing: Goal | null) => {
    setDetails((d) => ({ ...d, open: false }));
    setForm((f) => ({ open: true, editing, key: f.key + 1 }));
  };
  const list = goals.data ?? [];

  return (
    <SectionScroll
      testID="goals-section"
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ["goals"] })}
      fab={{
        icon: "add",
        label: "Nova meta",
        onPress: () => openForm(null),
        disabled: maintenance.active,
        testID: "fab-new-goal",
      }}
    >
      <SegmentedControl
        accessibilityLabel="Filtrar metas"
        value={status}
        onChange={setStatus}
        options={[
          { value: "active", label: "Ativas" },
          { value: "achieved", label: "Atingidas" },
          { value: "cancelled", label: "Canceladas" },
        ]}
      />
      {goals.isPending ? (
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <Skeleton key={i} style={styles.skeleton} />
          ))}
        </View>
      ) : goals.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(goals.error)}
        </Banner>
      ) : list.length === 0 ? (
        <EmptyState
          icon="flag"
          title={EMPTY[status].title}
          description={EMPTY[status].description}
          action={
            status === "active" ? (
              <Button icon="add" label="Criar meta" disabled={maintenance.active} onPress={() => openForm(null)} />
            ) : undefined
          }
        />
      ) : (
        <Grid columns={layout.columns}>
          {list.map((goal) => (
            <GoalCard key={goal.id} goal={goal} onPress={() => setDetails({ id: goal.id, open: true })} />
          ))}
        </Grid>
      )}

      <GoalFormSheet
        key={`goal-${form.key}`}
        open={form.open}
        editing={form.editing}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
      <GoalDetailsSheet
        open={details.open}
        goalId={details.id}
        onClose={() => setDetails((d) => ({ ...d, open: false }))}
        onEdit={(goal) => openForm(goal)}
      />
    </SectionScroll>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  skeleton: { height: 140 },
});
