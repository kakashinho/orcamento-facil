import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Reminder } from "@/data/api/types";
import { useSeriesList } from "@/data/queries/finance";
import { useReminders } from "@/data/queries/notifications";
import { useMaintenance } from "@/data/system/maintenance-store";
import { SectionScroll } from "../components/section-scroll";
import { canRemind } from "./account-labels";
import { ReminderFormSheet } from "./reminder-form-sheet";
import { RemindersSection } from "./reminders-section";
import { SeriesSection } from "./series-section";

/**
 * Planejamento › Contas: recorrências e parcelamentos ativos (R37, R62) e os lembretes de contas (R34),
 * que podem nascer de uma despesa recorrente.
 */
export function AccountsSection() {
  const queryClient = useQueryClient();
  const maintenance = useMaintenance();
  const activeSeries = useSeriesList("active").data ?? [];
  const reminders = useReminders().data ?? [];
  const [form, setForm] = useState<{ open: boolean; editing: Reminder | null; key: number }>({
    open: false,
    editing: null,
    key: 0,
  });

  const reminded = new Set(reminders.map((reminder) => reminder.seriesId));
  const recurringExpenses = activeSeries.filter((series) => canRemind(series) && !reminded.has(series.id));
  const openForm = (editing: Reminder | null) => setForm((f) => ({ open: true, editing, key: f.key + 1 }));

  return (
    <SectionScroll
      testID="accounts-section"
      onRefresh={() =>
        Promise.all(["series", "reminders"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
      }
      fab={{
        icon: "add",
        label: "Novo lembrete",
        onPress: () => openForm(null),
        disabled: maintenance.active,
        testID: "fab-new-reminder",
      }}
    >
      <SeriesSection />
      <RemindersSection onEdit={openForm} />
      <ReminderFormSheet
        key={`reminder-${form.key}`}
        open={form.open}
        editing={form.editing}
        recurringExpenses={recurringExpenses}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
    </SectionScroll>
  );
}
