import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { Series, UpdateSeriesRequest } from "@/data/api/types";
import { useCategories, useUpdateSeries, useWalletSummary } from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatAmountInput, parseAmountInput } from "@/domain/money";
import { Banner, Button, DateField, Sheet, Text, TextField } from "@/ui";
import { useUndoableFeedback } from "../../feedback/use-undoable-feedback";
import { MaintenanceBanner } from "../../system/maintenance-banner";
import { AmountInput } from "../../transactions/components/amount-input";
import { WalletPicker } from "../../wallets/components/wallet-picker";
import { CategoryChips } from "../components/category-chips";

type Field = "amount" | "description" | "categoryId" | "walletId" | "endDate";

/**
 * Editar uma série ativa (R37, R62): na recorrência, valor, descrição, categoria, carteira e data final;
 * no parcelamento, descrição, categoria e carteira. Vale só para as próximas ocorrências.
 */
export function SeriesEditSheet({ open, series, onClose }: { open: boolean; series: Series; onClose: () => void }) {
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const wallets = useWalletSummary().data?.wallets ?? [];
  const categories = (useCategories().data ?? []).filter((c) => c.type === null || c.type === series.type);
  const update = useUpdateSeries();
  const recurring = series.kind === "recurring";

  const [amountText, setAmountText] = useState(formatAmountInput(series.amount));
  const [description, setDescription] = useState(series.description);
  const [categoryId, setCategoryId] = useState<string | null>(series.category?.id ?? null);
  const [walletId, setWalletId] = useState(series.wallet.id);
  const [endDate, setEndDate] = useState(series.endDate ?? "");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const currency = wallets.find((w) => w.id === walletId)?.currency ?? series.wallet.currency;

  const submit = () => {
    setFormError(null);
    const found: Partial<Record<Field, string>> = {};
    const amount = recurring ? parseAmountInput(amountText) : series.amount;
    if (amount === null || amount <= 0) found.amount = "Informe um valor maior que zero.";
    if (!description.trim()) found.description = "Informe a descrição.";
    if (recurring && endDate && endDate < series.startDate) {
      found.endDate = "A data final deve ser igual ou posterior à primeira ocorrência.";
    }
    setErrors(found);
    if (Object.keys(found).length || amount === null) return;

    const body: UpdateSeriesRequest = {
      ...(recurring && amount !== series.amount ? { amount } : {}),
      ...(description.trim() !== series.description ? { description: description.trim() } : {}),
      ...(categoryId !== (series.category?.id ?? null) ? { categoryId } : {}),
      ...(walletId !== series.wallet.id ? { walletId } : {}),
      ...(recurring && (endDate || null) !== series.endDate ? { endDate: endDate || null } : {}),
    };
    if (Object.keys(body).length === 0) return onClose();
    update.mutate(
      { id: series.id, body },
      {
        onSuccess: () => {
          onClose();
          undoable(recurring ? "Recorrência atualizada" : "Parcelamento atualizado");
        },
        onError: (error) => {
          const fields = fieldErrorsOf(error);
          const mapped: Partial<Record<Field, string>> = {};
          for (const key of ["amount", "description", "categoryId", "walletId", "endDate"] as const) {
            if (fields[key]) mapped[key] = fields[key];
          }
          if (Object.keys(mapped).length) setErrors(mapped);
          else setFormError(errorMessage(error));
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={recurring ? "Editar recorrência" : "Editar parcelamento"}
      testID="series-edit"
    >
      <View style={styles.form}>
        <MaintenanceBanner compact />
        <Banner icon="info" tone="primary">
          Vale para as próximas ocorrências. As já registradas não mudam.
        </Banner>
        {formError ? (
          <Banner icon="error" tone="error">
            {formError}
          </Banner>
        ) : null}
        {recurring ? (
          <AmountInput
            label="Valor de cada ocorrência"
            value={amountText}
            onChangeText={setAmountText}
            currency={currency}
            tone={series.type}
            error={errors.amount}
          />
        ) : null}
        <TextField
          label="Descrição"
          icon="notes"
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          error={errors.description}
        />
        <WalletPicker label="Carteira" wallets={wallets} value={walletId} onChange={setWalletId} />
        {errors.walletId ? (
          <Text variant="label" color="error">
            {errors.walletId}
          </Text>
        ) : null}
        <CategoryChips categories={categories} value={categoryId} onChange={setCategoryId} error={errors.categoryId} />
        {recurring ? (
          <DateField
            label="Data final (opcional)"
            value={endDate}
            onChange={setEndDate}
            clearable
            placeholder="Sem data final"
            error={errors.endDate}
          />
        ) : null}
        <View style={styles.actions}>
          <View style={styles.flex} />
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button
            icon="check"
            label="Salvar"
            onPress={submit}
            loading={update.isPending}
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
