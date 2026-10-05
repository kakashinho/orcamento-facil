import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf } from "@/core/http/api-error";
import { useDebouncedValue } from "@/core/hooks/use-debounced-value";
import { logger } from "@/core/logging/logger";
import type { Category, Transaction, TransactionType } from "@/data/api/types";
import {
  useCategories,
  useCategorySuggestion,
  useCreateTransaction,
  useParseTransactionText,
  useTags,
  useUpdateTransaction,
  useWalletSummary,
} from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { categoryIcon } from "@/domain/catalog";
import { todayIso } from "@/domain/dates";
import { formatAmountInput, formatMoney } from "@/domain/money";
import { Banner, Button, Chip, DateField, SegmentedControl, Sheet, Text, TextField } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { WalletPicker } from "../wallets/components/wallet-picker";
import { AmountInput } from "./components/amount-input";
import { NewCategoryDialog } from "./components/new-category-dialog";
import { TagsInput } from "./components/tags-input";
import {
  categoryAccepts,
  initialFormValues,
  mapServerFieldErrors,
  toCreateRequest,
  toUpdateRequest,
  validateTransactionForm,
  type TransactionFormErrors,
  type TransactionFormValues,
} from "./transaction-form";
import { ListeningPanel } from "./voice/listening-panel";
import { useVoiceCapture } from "./voice/use-voice-capture";

const NO_CATEGORIES: Category[] = [];

/**
 * Registrar (R06) ou editar (R11) uma transação: valor, data, descrição, receita/despesa,
 * carteira, categoria (R07/R08) com sugestão pela descrição (R44), tags (R43) e voz (R65).
 * O provedor remonta a folha (nova `key`) a cada abertura, então o estado nasce dos props.
 */
export function TransactionFormSheet({
  open,
  editing,
  startWithVoice = false,
  onClose,
}: {
  open: boolean;
  editing: Transaction | null;
  /** Começa a ouvir assim que a folha abre (atalho de voz da tela inicial, R65). */
  startWithVoice?: boolean;
  onClose: () => void;
}) {
  const { celebrate } = useFeedback();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const wallets = useWalletSummary().data?.wallets ?? [];
  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? null;
  const allCategories = useCategories().data ?? NO_CATEGORIES;
  const knownTags = (useTags().data ?? []).map((t) => t.name);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const parse = useParseTransactionText();

  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialFormValues(editing, { walletId: defaultWalletId, today: todayIso() }),
  );
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [categoryDialogKey, setCategoryDialogKey] = useState(0);
  const [voiceReview, setVoiceReview] = useState<string | null>(null);

  // Se as carteiras chegarem depois da abertura, vale a padrão.
  const walletId = values.walletId ?? defaultWalletId;

  const set = <K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const changeType = (type: TransactionType) => {
    setValues((v) => {
      const selected = allCategories.find((c) => c.id === v.categoryId);
      return { ...v, type, categoryId: categoryAccepts(selected, type) ? v.categoryId : null };
    });
  };

  const categories = useMemo(
    () => allCategories.filter((c) => categoryAccepts(c, values.type)),
    [allCategories, values.type],
  );

  const debouncedDescription = useDebouncedValue(values.description, 400);
  const suggestion = useCategorySuggestion(debouncedDescription, values.type, open && !values.categoryId).data;

  const wallet = wallets.find((w) => w.id === walletId);
  const currency = wallet?.currency ?? "BRL";

  const applyVoiceText = (text: string) => {
    parse.mutate(text, {
      onSuccess: ({ draft, suggestions }) => {
        setValues((v) => ({
          ...v,
          type: draft.type,
          amountText: draft.amount !== null ? formatAmountInput(draft.amount) : v.amountText,
          description: draft.description || v.description,
          date: draft.date,
          categoryId: suggestions[0]?.categoryId ?? v.categoryId,
        }));
        setVoiceReview(text);
        const kind = draft.type === "income" ? "Receita" : "Despesa";
        const value = draft.amount !== null ? ` de ${formatMoney(draft.amount, currency)}` : "";
        Speech.speak(`${kind}${value} reconhecida. Revise antes de salvar.`, { language: "pt-BR" });
        logger.info("voice.draft_applied", { type: draft.type, hasAmount: draft.amount !== null });
      },
      onError: (error) => setFormError(errorMessage(error, "Não foi possível interpretar a frase.")),
    });
  };
  const voice = useVoiceCapture(applyVoiceText);
  const startVoice = voice.start;
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!open || !startWithVoice || editing || autoStarted.current) return;
    autoStarted.current = true;
    void startVoice();
  }, [open, startWithVoice, editing, startVoice]);

  const handleError = (error: unknown) => {
    const fields = mapServerFieldErrors(fieldErrorsOf(error));
    if (Object.keys(fields).length) setErrors(fields);
    else setFormError(errorMessage(error));
  };

  const submit = () => {
    setFormError(null);
    const current = { ...values, walletId };
    const found = validateTransactionForm(current);
    setErrors(found);
    if (Object.keys(found).length) return;
    if (editing) {
      const body = toUpdateRequest(editing, current, allCategories);
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      update.mutate(
        { id: editing.id, body },
        {
          onSuccess: () => {
            onClose();
            undoable("Transação atualizada");
          },
          onError: handleError,
        },
      );
      return;
    }
    create.mutate(toCreateRequest(current, allCategories), {
      onSuccess: () => {
        onClose();
        celebrate("Transação registrada");
      },
      onError: handleError,
    });
  };

  const saving = create.isPending || update.isPending;
  const canSave = !!values.amountText && !!values.categoryId && !maintenance.active;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={editing ? "Editar transação" : "Nova transação"}
        testID="transaction-form"
      >
        {voice.state === "listening" ? (
          <ListeningPanel transcript={voice.transcript} onStop={voice.stop} onCancel={voice.cancel} />
        ) : (
          <View style={styles.form}>
            <MaintenanceBanner compact />
            {!editing ? (
              <Button
                variant="tonal"
                icon="mic"
                label="Registrar por voz"
                onPress={voice.start}
                disabled={parse.isPending}
              />
            ) : null}
            {voice.error ? (
              <Banner icon="mic" tone="tertiary">
                {voice.error}
              </Banner>
            ) : null}
            {voiceReview ? (
              <Banner icon="reviews" tone="tertiary" testID="voice-review">
                <Text variant="bodySmall" color="onTertiaryContainer">
                  Reconhecemos por voz:{" "}
                  <Text variant="bodySmall" weight="bold" color="onTertiaryContainer">
                    “{voiceReview}”
                  </Text>
                  . Revise antes de salvar.
                </Text>
              </Banner>
            ) : null}
            {formError ? (
              <Banner icon="error" tone="error">
                {formError}
              </Banner>
            ) : null}

            <SegmentedControl
              accessibilityLabel="Tipo da transação"
              value={values.type}
              onChange={changeType}
              options={[
                { value: "expense", label: "Despesa" },
                { value: "income", label: "Receita" },
              ]}
            />

            <AmountInput
              label="Valor"
              value={values.amountText}
              onChangeText={(text) => set("amountText", text)}
              currency={currency}
              tone={values.type}
              error={errors.amount}
            />

            <TextField
              label="Descrição"
              icon="notes"
              value={values.description}
              onChangeText={(text) => set("description", text)}
              placeholder="Ex.: Supermercado, Uber…"
              maxLength={200}
              error={errors.description}
            />

            {suggestion && !values.categoryId ? (
              <View style={styles.suggestion}>
                <Chip
                  icon="auto_awesome"
                  label={`Sugestão: ${suggestion.name}`}
                  onPress={() => set("categoryId", suggestion.categoryId)}
                  testID="category-suggestion"
                />
              </View>
            ) : null}

            <WalletPicker label="Carteira" wallets={wallets} value={walletId} onChange={(id) => set("walletId", id)} />
            {errors.wallet ? (
              <Text variant="label" color="error">
                {errors.wallet}
              </Text>
            ) : null}

            <View>
              <View style={styles.categoryHeader}>
                <Text variant="caption" weight="medium" color="onSurfaceVariant">
                  Categoria
                </Text>
                <Button
                  variant="text"
                  icon="add"
                  label="Nova"
                  onPress={() => {
                    setCategoryDialogKey((k) => k + 1);
                    setNewCategoryOpen(true);
                  }}
                />
              </View>
              <View style={styles.chips}>
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    icon={categoryIcon(category)}
                    selected={values.categoryId === category.id}
                    onPress={() => set("categoryId", category.id)}
                  />
                ))}
              </View>
              {errors.category ? (
                <Text variant="label" color="error">
                  {errors.category}
                </Text>
              ) : null}
            </View>

            <DateField label="Data" value={values.date} onChange={(date) => set("date", date)} error={errors.date} />

            <TagsInput
              value={values.tags}
              onChange={(tags) => set("tags", tags)}
              known={knownTags}
              error={errors.tags}
            />

            <View style={styles.actions}>
              <View style={styles.spacer} />
              <Button variant="text" label="Cancelar" onPress={onClose} />
              <Button
                label="Salvar"
                icon="check"
                onPress={submit}
                loading={saving || parse.isPending}
                disabled={!canSave}
              />
            </View>
          </View>
        )}
      </Sheet>
      <NewCategoryDialog
        key={categoryDialogKey}
        open={newCategoryOpen}
        defaultType={values.type}
        onClose={() => setNewCategoryOpen(false)}
        onCreated={(category) => {
          setNewCategoryOpen(false);
          setValues((v) => ({ ...v, categoryId: category.id }));
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, paddingTop: 12 },
  suggestion: { alignItems: "flex-start", marginTop: -4 },
  categoryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  spacer: { flex: 1 },
});
