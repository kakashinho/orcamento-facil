import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf, isApiError } from "@/core/http/api-error";
import type { Frequency, Transaction } from "@/data/api/types";
import { useMarkRecurring } from "@/data/queries/finance";
import { repeatLabel, seriesErrorMessage, validateEndDate } from "@/domain/series";
import { Banner, Button, Dialog } from "@/ui";
import { RepeatField } from "./components/repeat-field";

/**
 * "Marcar como recorrente" (R37): a transação avulsa vira a 1ª ocorrência de uma recorrência,
 * com frequência e data final opcional. Os erros de regra do servidor (409/422) aparecem aqui.
 * Fica fora da folha de detalhes (o Android não mostra um Modal dentro de outro).
 */
export function MarkRecurringDialog({
  transaction,
  open,
  onClose,
  onDone,
}: {
  transaction: Transaction;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const mark = useMarkRecurring();
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [endDate, setEndDate] = useState("");
  const [endDateError, setEndDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const invalid = validateEndDate(endDate, transaction.date);
    setEndDateError(invalid);
    if (invalid) return;
    mark.mutate(
      { transactionId: transaction.id, frequency, endDate: endDate || undefined },
      {
        onSuccess: () => onDone(`Transação marcada como recorrente: ${repeatLabel(frequency).toLowerCase()}`),
        onError: (e) => {
          const field = fieldErrorsOf(e).endDate;
          if (field) setEndDateError(field);
          else setError((isApiError(e) && seriesErrorMessage(e.code)) || errorMessage(e));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Marcar como recorrente"
      icon="event_repeat"
      testID="mark-recurring"
      actions={
        <>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button label="Confirmar" loading={mark.isPending} onPress={submit} />
        </>
      }
    >
      <View style={styles.body}>
        <RepeatField
          value={frequency}
          onChange={setFrequency}
          endDate={endDate}
          onEndDateChange={(date) => {
            setEndDateError(null);
            setEndDate(date);
          }}
          endDateError={endDateError}
        />
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
});
