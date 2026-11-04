import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { Frequency, Reminder, Series, UpdateReminderRequest } from "@/data/api/types";
import { useCreateReminder, useDeleteReminder, useUpdateReminder } from "@/data/queries/notifications";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatAmountInput, formatMoney, parseAmountInput } from "@/domain/money";
import { FREQUENCY_LABEL } from "@/domain/series";
import { Banner, Button, Chip, DateField, Dialog, SegmentedControl, Sheet, Text, TextField } from "@/ui";
import { useFeedback } from "../../feedback/feedback-provider";
import { MaintenanceBanner } from "../../system/maintenance-banner";

type Source = "manual" | "series";
type Field = "title" | "nextDueDate" | "frequency" | "amount" | "seriesId";
const FIELDS: Field[] = ["title", "nextDueDate", "frequency", "amount", "seriesId"];
const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];

/**
 * Criar, editar ou excluir um lembrete de conta (R34). Na criação, o lembrete pode nascer de uma
 * despesa recorrente ativa: título, valor e vencimento vêm dela (o servidor completa).
 */
export function ReminderFormSheet({
  open,
  editing,
  recurringExpenses,
  onClose,
}: {
  open: boolean;
  editing: Reminder | null;
  /** Despesas recorrentes ativas ainda sem lembrete. */
  recurringExpenses: Series[];
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const currency = editing?.currency ?? user?.primaryCurrency ?? "BRL";
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();

  const [source, setSource] = useState<Source>("manual");
  const [seriesId, setSeriesId] = useState<string | null>(null);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [dueDate, setDueDate] = useState(editing?.nextDueDate ?? "");
  const [frequency, setFrequency] = useState<Frequency>(editing?.frequency ?? "monthly");
  const [amountText, setAmountText] = useState(
    editing?.amount !== null && editing?.amount !== undefined ? formatAmountInput(editing.amount) : "",
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fail = (error: unknown) => {
    const fields = fieldErrorsOf(error);
    const mapped: Partial<Record<Field, string>> = {};
    for (const field of FIELDS) if (fields[field]) mapped[field] = fields[field];
    if (Object.keys(mapped).length) setErrors(mapped);
    else setFormError(errorMessage(error));
  };
  const done = (message: string) => {
    onClose();
    showSnackbar(message);
  };

  const submit = () => {
    setFormError(null);
    if (!editing && source === "series") {
      if (!seriesId) return setErrors({ seriesId: "Escolha a despesa recorrente." });
      setErrors({});
      create.mutate(
        { seriesId },
        { onSuccess: (reminder) => done(`Lembrete criado: ${reminder.title}`), onError: fail },
      );
      return;
    }
    const found: Partial<Record<Field, string>> = {};
    const amount = amountText.trim() ? parseAmountInput(amountText) : null;
    if (!title.trim()) found.title = "Informe o título do lembrete.";
    if (!dueDate) found.nextDueDate = "Escolha o próximo vencimento.";
    if (amountText.trim() && (amount === null || amount <= 0)) found.amount = "Informe um valor válido ou deixe vazio.";
    setErrors(found);
    if (Object.keys(found).length) return;

    if (editing) {
      const body: UpdateReminderRequest = {
        ...(title.trim() !== editing.title ? { title: title.trim() } : {}),
        ...(dueDate !== editing.nextDueDate ? { nextDueDate: dueDate } : {}),
        ...(frequency !== editing.frequency ? { frequency } : {}),
        ...(amount !== editing.amount ? { amount } : {}),
      };
      if (Object.keys(body).length === 0) return onClose();
      update.mutate({ id: editing.id, body }, { onSuccess: () => done("Lembrete atualizado"), onError: fail });
      return;
    }
    create.mutate(
      { title: title.trim(), nextDueDate: dueDate, frequency, ...(amount !== null ? { amount } : {}) },
      { onSuccess: () => done("Lembrete criado"), onError: fail },
    );
  };

  const doDelete = () => {
    if (!editing) return;
    remove.mutate(editing.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        done("Lembrete excluído");
      },
      onError: (error) => {
        setConfirmDelete(false);
        fail(error);
      },
    });
  };

  const fromSeries = !editing && source === "series";
  return (
    <>
      <Sheet open={open} onClose={onClose} title={editing ? "Editar lembrete" : "Novo lembrete"} testID="reminder-form">
        <View style={styles.form}>
          <MaintenanceBanner compact />
          {formError ? (
            <Banner icon="error" tone="error">
              {formError}
            </Banner>
          ) : null}
          {!editing && recurringExpenses.length > 0 ? (
            <SegmentedControl
              accessibilityLabel="Origem do lembrete"
              value={source}
              onChange={setSource}
              options={[
                { value: "manual", label: "Manual" },
                { value: "series", label: "De uma recorrência" },
              ]}
            />
          ) : null}

          {fromSeries ? (
            <View>
              <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
                Despesa recorrente
              </Text>
              <View style={styles.chips}>
                {recurringExpenses.map((item) => (
                  <Chip
                    key={item.id}
                    icon="event_repeat"
                    label={`${item.description} · ${formatMoney(item.amount, item.wallet.currency)}`}
                    selected={seriesId === item.id}
                    onPress={() => setSeriesId(item.id)}
                  />
                ))}
              </View>
              {errors.seriesId ? (
                <Text variant="label" color="error" style={styles.label}>
                  {errors.seriesId}
                </Text>
              ) : (
                <Text variant="label" color="onSurfaceVariant" style={styles.label}>
                  Título, valor e vencimento vêm da recorrência.
                </Text>
              )}
            </View>
          ) : (
            <>
              <TextField
                label="Título"
                icon="receipt"
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Conta de luz"
                maxLength={80}
                error={errors.title}
              />
              <DateField label="Próximo vencimento" value={dueDate} onChange={setDueDate} error={errors.nextDueDate} />
              <View style={styles.field}>
                <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
                  Frequência
                </Text>
                <SegmentedControl
                  accessibilityLabel="Frequência do lembrete"
                  value={frequency}
                  onChange={setFrequency}
                  options={FREQUENCIES.map((value) => ({ value, label: FREQUENCY_LABEL[value] }))}
                />
              </View>
              <TextField
                label={`Valor (opcional, ${currency})`}
                icon="payments"
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0,00"
                helper="Só para consulta: o lembrete não registra a despesa."
                error={errors.amount}
              />
            </>
          )}

          <View style={styles.actions}>
            {editing ? (
              <Button
                variant="dangerOutlined"
                icon="delete"
                accessibilityLabel="Excluir lembrete"
                disabled={maintenance.active}
                onPress={() => setConfirmDelete(true)}
              />
            ) : null}
            <View style={styles.flex} />
            <Button variant="text" label="Cancelar" onPress={onClose} />
            <Button
              icon="check"
              label={editing ? "Salvar" : "Criar lembrete"}
              onPress={submit}
              loading={create.isPending || update.isPending}
              disabled={maintenance.active}
            />
          </View>
        </View>
      </Sheet>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir lembrete?"
        testID="delete-reminder-dialog"
        icon="delete"
        actions={
          <>
            <Button variant="text" label="Voltar" onPress={() => setConfirmDelete(false)} />
            <Button variant="danger" label="Excluir" loading={remove.isPending} onPress={doDelete} />
          </>
        }
      >
        Você deixa de receber o aviso deste vencimento.
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  field: { gap: 8 },
  label: { paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
});
