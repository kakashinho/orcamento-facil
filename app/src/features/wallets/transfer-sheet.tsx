import { randomUUID } from "expo-crypto";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import { useDebouncedValue } from "@/core/hooks/use-debounced-value";
import { useConversion, useCreateTransfer, useWalletSummary } from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatMoney, parseAmountInput } from "@/domain/money";
import { Banner, Button, Icon, radii, Sheet, Text, TextField, useTheme } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { AmountInput } from "../transactions/components/amount-input";
import { WalletPicker } from "./components/wallet-picker";

/**
 * Transferência entre carteiras (R54): debita uma e credita a outra sem virar receita ou
 * despesa. Entre moedas diferentes, mostra a conversão pela cotação atual (R29).
 */
export function TransferSheet({
  open,
  fromWalletId,
  onClose,
}: {
  open: boolean;
  fromWalletId?: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { celebrate } = useFeedback();
  const maintenance = useMaintenance();
  const wallets = useWalletSummary().data?.wallets ?? [];
  const create = useCreateTransfer();
  const [chosenSource, setSourceId] = useState<string | null>(fromWalletId ?? null);
  const [chosenTarget, setTargetId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  // Uma chave por abertura (a folha é remontada a cada abertura): repetir o envio não duplica.
  const [idempotencyKey] = useState(() => randomUUID());

  // Padrões calculados na renderização: origem informada/padrão; destino = outra carteira.
  const sourceId = chosenSource ?? wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? null;
  const targetId = chosenTarget ?? wallets.find((w) => w.id !== sourceId)?.id ?? null;

  const source = wallets.find((w) => w.id === sourceId);
  const target = wallets.find((w) => w.id === targetId);
  const amount = parseAmountInput(amountText) ?? 0;
  const debouncedAmount = useDebouncedValue(amount, 400);
  const differentCurrency = !!source && !!target && source.currency !== target.currency;
  const conversion = useConversion(
    differentCurrency ? source.currency : "",
    differentCurrency ? target.currency : "",
    debouncedAmount,
  );

  const submit = () => {
    setError(null);
    if (!sourceId || !targetId) {
      setError("Escolha as carteiras de origem e de destino.");
      return;
    }
    if (amount <= 0) {
      setAmountError("Informe um valor maior que zero.");
      return;
    }
    setAmountError(null);
    create.mutate(
      {
        body: {
          sourceWalletId: sourceId,
          targetWalletId: targetId,
          amount,
          ...(description.trim() ? { description: description.trim() } : {}),
        },
        idempotencyKey,
      },
      {
        onSuccess: () => {
          onClose();
          celebrate("Transferência realizada");
        },
        onError: (e) => {
          const fields = fieldErrorsOf(e);
          if (fields.amount) setAmountError(fields.amount);
          else setError(fields.targetWalletId ?? errorMessage(e));
        },
      },
    );
  };

  return (
    <Sheet open={open} onClose={onClose} title="Transferir entre carteiras" testID="transfer-form">
      <View style={styles.form}>
        <MaintenanceBanner compact />
        {wallets.length < 2 ? (
          <Banner icon="info" tone="info">
            Crie pelo menos duas carteiras para transferir valores entre elas.
          </Banner>
        ) : null}
        {error ? (
          <Banner icon="error" tone="error">
            {error}
          </Banner>
        ) : null}
        <WalletPicker label="De" wallets={wallets} value={sourceId} onChange={setSourceId} exclude={targetId} />
        <View style={styles.arrow}>
          <View style={[styles.arrowCircle, { backgroundColor: colors.secondaryContainer }]}>
            <Icon name="south" size={20} color="onSecondaryContainer" />
          </View>
        </View>
        <WalletPicker label="Para" wallets={wallets} value={targetId} onChange={setTargetId} exclude={sourceId} />

        <AmountInput
          label="Valor a transferir"
          value={amountText}
          onChangeText={setAmountText}
          currency={source?.currency ?? "BRL"}
          tone="neutral"
          error={amountError}
        />

        {differentCurrency && amount > 0 ? (
          <Banner icon="currency_exchange" tone="tertiary" testID="transfer-conversion">
            {conversion.data ? (
              <Text variant="bodySmall" color="onTertiaryContainer">
                Conversão: {formatMoney(conversion.data.amount, conversion.data.from)} →{" "}
                <Text variant="bodySmall" weight="bold" color="onTertiaryContainer">
                  {formatMoney(conversion.data.result, conversion.data.to)}
                </Text>{" "}
                (cotação atual{conversion.data.stale ? ", do cache" : ""})
              </Text>
            ) : (
              <Text variant="bodySmall" color="onTertiaryContainer">
                {conversion.isError
                  ? "Cotação indisponível agora; o servidor converte ao transferir."
                  : "Consultando a cotação…"}
              </Text>
            )}
          </Banner>
        ) : null}

        <TextField
          label="Observação (opcional)"
          icon="edit_note"
          value={description}
          onChangeText={setDescription}
          placeholder="Ex.: Reserva mensal"
          maxLength={200}
        />
        <Banner icon="info" tone="info">
          Transferências internas não contam como receitas ou despesas.
        </Banner>

        <View style={styles.actions}>
          <Button variant="text" label="Cancelar" onPress={onClose} />
          <Button
            icon="swap_horiz"
            label="Transferir"
            onPress={submit}
            loading={create.isPending}
            disabled={!amountText || !sourceId || !targetId || maintenance.active}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  arrow: { alignItems: "center", marginVertical: -8 },
  arrowCircle: { width: 36, height: 36, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingTop: 4 },
});
