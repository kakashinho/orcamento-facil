import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import type { BudgetPeriod, BudgetStatus } from "@/data/api/types";
import { useBudgetStatus } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { currentMonth } from "@/domain/dates";
import { Button, Divider, EmptyState, Text } from "@/ui";
import { MonthSelector } from "../../analytics/components/month-selector";
import { SectionCard } from "../../analytics/components/section-card";
import { SectionScroll } from "../components/section-scroll";
import { BudgetChart } from "./budget-chart";
import { BudgetFormSheet } from "./budget-form-sheet";
import { BudgetHistorySheet } from "./budget-history-sheet";
import { BudgetRow } from "./budget-row";
import { ReductionGoals } from "./reduction-goals";

type FormState = { open: boolean; editing: BudgetStatus | null; period: BudgetPeriod; key: number };

/**
 * Planejamento › Orçamentos: mês escolhido com os orçamentos mensais (R21) e o gráfico orçado × gasto
 * (R45), os limites de hoje (R74), o histórico (R23) e as metas de redução (R67). Uma requisição para o
 * status (R83).
 */
export function BudgetsSection() {
  const queryClient = useQueryClient();
  const maintenance = useMaintenance();
  const thisMonth = currentMonth();
  const [month, setMonth] = useState(thisMonth);
  const status = useBudgetStatus(month);
  const [form, setForm] = useState<FormState>({ open: false, editing: null, period: "monthly", key: 0 });
  const [history, setHistory] = useState({ open: false, key: 0 });
  useScreenMetric("planning.budgets", !!status.data);

  const openForm = (editing: BudgetStatus | null, period: BudgetPeriod = "monthly") =>
    setForm((f) => ({ open: true, editing, period, key: f.key + 1 }));
  const monthly = status.data?.monthly ?? [];
  const daily = status.data?.daily ?? [];
  const isCurrent = month === thisMonth;

  return (
    <SectionScroll
      testID="budgets-section"
      onRefresh={() =>
        Promise.all(["budgets", "reduction-goals"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      }
      fab={{
        icon: "add",
        label: "Novo orçamento",
        onPress: () => openForm(null),
        disabled: maintenance.active,
        testID: "fab-new-budget",
      }}
    >
      <MonthSelector month={month} onChange={setMonth} max={thisMonth} testID="budgets-month" />

      {status.data && monthly.length > 0 ? <BudgetChart items={monthly} /> : null}

      <SectionCard
        title="Orçamentos do mês"
        testID="monthly-budgets"
        loading={status.isPending}
        error={status.error}
        onRetry={() => void status.refetch()}
        action={
          <Button
            variant="text"
            icon="history"
            label="Histórico"
            onPress={() => setHistory((h) => ({ open: true, key: h.key + 1 }))}
          />
        }
      >
        {monthly.length === 0 ? (
          <EmptyState
            icon="savings"
            title="Nenhum orçamento mensal"
            description="Defina quanto quer gastar por categoria e acompanhe o mês."
            action={
              isCurrent ? (
                <Button
                  icon="add"
                  label="Criar orçamento"
                  disabled={maintenance.active}
                  onPress={() => openForm(null)}
                />
              ) : undefined
            }
          />
        ) : (
          monthly.map((item, index) => (
            <View key={item.budgetId}>
              {index > 0 ? <Divider /> : null}
              <BudgetRow item={item} onPress={isCurrent ? () => openForm(item) : undefined} />
            </View>
          ))
        )}
      </SectionCard>

      {isCurrent && status.data ? (
        <SectionCard
          title="Limites de hoje"
          testID="daily-budgets"
          action={
            <Button
              variant="text"
              icon="add"
              label="Limite diário"
              accessibilityLabel="Novo limite diário"
              disabled={maintenance.active}
              onPress={() => openForm(null, "daily")}
            />
          }
        >
          {daily.length === 0 ? (
            <Text variant="bodySmall" color="onSurfaceVariant">
              Nenhum limite diário. Use para categorias do dia a dia, como alimentação.
            </Text>
          ) : (
            daily.map((item, index) => (
              <View key={item.budgetId}>
                {index > 0 ? <Divider /> : null}
                <BudgetRow item={item} onPress={() => openForm(item)} />
              </View>
            ))
          )}
        </SectionCard>
      ) : null}

      <ReductionGoals month={month} />

      <BudgetFormSheet
        key={`budget-${form.key}`}
        open={form.open}
        editing={form.editing}
        defaultPeriod={form.period}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
      <BudgetHistorySheet
        key={`history-${history.key}`}
        open={history.open}
        month={month}
        onClose={() => setHistory((h) => ({ ...h, open: false }))}
      />
    </SectionScroll>
  );
}
