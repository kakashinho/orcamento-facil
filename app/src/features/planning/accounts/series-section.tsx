import { useState } from "react";
import { View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { Series } from "@/data/api/types";
import { useCancelSeries, useSeriesList } from "@/data/queries/finance";
import { useCreateReminder, useReminders } from "@/data/queries/notifications";
import { useMaintenance } from "@/data/system/maintenance-store";
import { Button, Dialog, Divider, SegmentedControl, Text } from "@/ui";
import { SectionCard } from "../../analytics/components/section-card";
import { useFeedback } from "../../feedback/feedback-provider";
import { useUndoableFeedback } from "../../feedback/use-undoable-feedback";
import { canRemind } from "./account-labels";
import { SeriesEditSheet } from "./series-edit-sheet";
import { SeriesRow } from "./series-row";

type Filter = "active" | "ended";

/**
 * Recorrências (R37) e parcelamentos (R62): filtro Ativas · Encerradas, editar, cancelar com
 * "Desfazer" (R49) e "Criar lembrete" para as despesas recorrentes (R34).
 */
export function SeriesSection() {
  const { showSnackbar } = useFeedback();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const [filter, setFilter] = useState<Filter>("active");
  const series = useSeriesList(filter === "active" ? "active" : "all");
  const reminders = useReminders();
  const cancel = useCancelSeries();
  const createReminder = useCreateReminder();
  const [editing, setEditing] = useState<{ series: Series | null; open: boolean; key: number }>({
    series: null,
    open: false,
    key: 0,
  });
  const [cancelling, setCancelling] = useState<Series | null>(null);

  const list = (series.data ?? []).filter((item) => (filter === "active") === (item.status === "active"));
  const remindedIds = new Set((reminders.data ?? []).map((reminder) => reminder.seriesId).filter(Boolean));

  const doCancel = () => {
    if (!cancelling) return;
    const kind = cancelling.kind;
    cancel.mutate(cancelling.id, {
      onSuccess: () => {
        setCancelling(null);
        undoable(kind === "recurring" ? "Recorrência cancelada" : "Parcelamento cancelado");
      },
      onError: (error) => {
        setCancelling(null);
        showSnackbar(errorMessage(error));
      },
    });
  };

  const remind = (item: Series) =>
    createReminder.mutate(
      { seriesId: item.id },
      {
        onSuccess: (reminder) => showSnackbar(`Lembrete criado: ${reminder.title}`),
        onError: (error) => showSnackbar(errorMessage(error)),
      },
    );

  return (
    <>
      <SectionCard
        title="Recorrências e parcelamentos"
        testID="series-section"
        loading={series.isPending}
        error={series.error}
        onRetry={() => void series.refetch()}
      >
        <SegmentedControl
          accessibilityLabel="Filtrar recorrências e parcelamentos"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Ativas" },
            { value: "ended", label: "Encerradas" },
          ]}
        />
        {list.length === 0 ? (
          <Text variant="bodySmall" color="onSurfaceVariant">
            {filter === "active"
              ? 'Nenhuma recorrência ou parcelamento ativo. Ao registrar uma transação, use "Repetir" ou "Parcelar".'
              : "Nenhuma recorrência ou parcelamento encerrado."}
          </Text>
        ) : (
          <View>
            {list.map((item, index) => (
              <View key={item.id}>
                {index > 0 ? <Divider /> : null}
                <SeriesRow
                  series={item}
                  disabled={maintenance.active}
                  reminded={remindedIds.has(item.id)}
                  onEdit={() => setEditing((e) => ({ series: item, open: true, key: e.key + 1 }))}
                  onCancel={() => setCancelling(item)}
                  onRemind={canRemind(item) && !remindedIds.has(item.id) ? () => remind(item) : undefined}
                />
              </View>
            ))}
          </View>
        )}
      </SectionCard>
      {editing.series ? (
        <SeriesEditSheet
          key={`series-${editing.key}`}
          open={editing.open}
          series={editing.series}
          onClose={() => setEditing((e) => ({ ...e, open: false }))}
        />
      ) : null}
      <Dialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title={cancelling?.kind === "installment" ? "Cancelar parcelamento?" : "Cancelar recorrência?"}
        icon="event_repeat"
        testID="cancel-series-dialog"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setCancelling(null)} />
            <Button variant="danger" label="Cancelar série" loading={cancel.isPending} onPress={doCancel} />
          </>
        }
      >
        As próximas ocorrências não serão geradas. As já registradas continuam.
      </Dialog>
    </>
  );
}
