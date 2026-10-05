import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import type { Wallet, WalletType } from "@/data/api/types";
import { useCreateWallet, useDeleteWallet, useUpdateWallet } from "@/data/queries/finance";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { WALLET_TYPES } from "@/domain/catalog";
import { formatAmountInput, parseAmountInput } from "@/domain/money";
import { Banner, Button, Card, Chip, Dialog, Sheet, Switch, Text, TextField } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { CurrencyPicker, useCurrencyName } from "./components/currency-picker";
import { WalletAvatar } from "./components/wallet-picker";

/** Saldo inicial aceita negativo (ex.: cartão de crédito): "-150,00". */
export function parseSignedAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const negative = trimmed.startsWith("-") || trimmed.startsWith("−");
  const value = parseAmountInput(negative ? trimmed.slice(1) : trimmed);
  return value === null ? null : negative ? -value : value;
}

/** Criar (R53) ou editar uma carteira, com moeda própria (R56). Remontada (key) a cada abertura. */
export function WalletFormSheet({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: Wallet | null;
  onClose: () => void;
}) {
  const user = useCurrentUser();
  const { showSnackbar } = useFeedback();
  const maintenance = useMaintenance();
  const currencyName = useCurrencyName();
  const create = useCreateWallet();
  const update = useUpdateWallet();
  const remove = useDeleteWallet();

  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<WalletType>(editing?.type ?? "checking");
  const [currency, setCurrency] = useState(editing?.currency ?? user?.primaryCurrency ?? "BRL");
  const [initial, setInitial] = useState(editing ? formatAmountInput(editing.initialBalance) : "");
  const [isDefault, setIsDefault] = useState(editing?.isDefault ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fail = (error: unknown) => {
    const fields = fieldErrorsOf(error);
    if (Object.keys(fields).length) setErrors(fields);
    else setFormError(errorMessage(error));
  };

  const submit = () => {
    setFormError(null);
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Informe o nome da carteira.";
    const initialBalance = parseSignedAmount(initial);
    if (initialBalance === null) next.initialBalance = "Informe um valor válido, com até duas casas decimais.";
    setErrors(next);
    if (Object.keys(next).length) return;

    if (editing) {
      const body = {
        ...(name.trim() !== editing.name ? { name: name.trim() } : {}),
        ...(type !== editing.type ? { type } : {}),
        ...(currency !== editing.currency ? { currency } : {}),
        ...(initialBalance !== editing.initialBalance ? { initialBalance: initialBalance ?? 0 } : {}),
        ...(isDefault && !editing.isDefault ? { isDefault: true as const } : {}),
      };
      if (Object.keys(body).length === 0) return onClose();
      update.mutate(
        { id: editing.id, body },
        {
          onSuccess: () => {
            onClose();
            showSnackbar("Carteira atualizada");
          },
          onError: fail,
        },
      );
      return;
    }
    create.mutate(
      { name: name.trim(), type, currency, initialBalance: initialBalance ?? 0, isDefault },
      {
        onSuccess: () => {
          onClose();
          showSnackbar("Carteira criada");
        },
        onError: fail,
      },
    );
  };

  const doDelete = () => {
    if (!editing) return;
    remove.mutate(editing.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
        showSnackbar("Carteira excluída");
      },
      onError: (error) => {
        setConfirmDelete(false);
        fail(error);
      },
    });
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={editing ? "Editar carteira" : "Nova carteira"} testID="wallet-form">
        <View style={styles.form}>
          <MaintenanceBanner compact />
          {formError ? (
            <Banner icon="error" tone="error">
              {formError}
            </Banner>
          ) : null}
          <TextField
            label="Nome da carteira"
            icon="badge"
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Conta corrente"
            maxLength={60}
            error={errors.name}
          />
          <View>
            <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
              Tipo
            </Text>
            <View style={styles.chips}>
              {WALLET_TYPES.map((option) => (
                <Chip
                  key={option.type}
                  label={option.label}
                  icon={option.icon}
                  selected={type === option.type}
                  onPress={() => setType(option.type)}
                />
              ))}
            </View>
          </View>
          <CurrencyPicker label="Moeda" value={currency} onChange={setCurrency} />
          {errors.currency ? (
            <Text variant="label" color="error">
              {errors.currency}
            </Text>
          ) : null}
          <TextField
            label={`Saldo inicial (${currency})`}
            icon="payments"
            value={initial}
            onChangeText={setInitial}
            keyboardType="numbers-and-punctuation"
            placeholder="0,00"
            helper="Use valor negativo para dívidas, como fatura de cartão."
            error={errors.initialBalance}
          />
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text>Carteira padrão</Text>
              <Text variant="label" color="onSurfaceVariant">
                Usada quando você não escolhe outra ao registrar
              </Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              disabled={editing?.isDefault}
              accessibilityLabel="Carteira padrão"
            />
          </View>

          <Card style={styles.preview}>
            <WalletAvatar wallet={{ type }} size={44} />
            <View style={styles.flex}>
              <Text weight="medium">{name.trim() || "Prévia da carteira"}</Text>
              <Text variant="label" color="onSurfaceVariant">
                {currencyName(currency)}
              </Text>
            </View>
          </Card>

          <View style={styles.actions}>
            {editing && !editing.isDefault ? (
              <Button
                variant="dangerOutlined"
                icon="delete"
                accessibilityLabel="Excluir carteira"
                disabled={maintenance.active}
                onPress={() => setConfirmDelete(true)}
              />
            ) : null}
            <View style={styles.flex} />
            <Button variant="text" label="Cancelar" onPress={onClose} />
            <Button
              icon="check"
              label={editing ? "Salvar" : "Criar carteira"}
              onPress={submit}
              loading={create.isPending || update.isPending}
              disabled={!name.trim() || maintenance.active}
            />
          </View>
        </View>
      </Sheet>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir carteira?"
        icon="delete"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setConfirmDelete(false)} />
            <Button variant="danger" label="Excluir" loading={remove.isPending} onPress={doDelete} />
          </>
        }
      >
        Só é possível excluir carteiras sem transações ou transferências.
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  label: { paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  flex: { flex: 1 },
  preview: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
});
