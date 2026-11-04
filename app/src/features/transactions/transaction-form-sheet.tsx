import * as Speech from "expo-speech";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage, fieldErrorsOf, isApiError } from "@/core/http/api-error";
import { useDebouncedValue } from "@/core/hooks/use-debounced-value";
import { logger } from "@/core/logging/logger";
import type { Category, Goal, Transaction, TransactionType } from "@/data/api/types";
import {
  useCategories,
  useCategorySuggestion,
  useCreateInstallments,
  useCreateRecurring,
  useCreateTransaction,
  useParseTransactionText,
  useTags,
  useUpdateTransaction,
  useWalletSummary,
} from "@/data/queries/finance";
import { useContribute } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { categoryIcon } from "@/domain/catalog";
import { todayIso } from "@/domain/dates";
import { formatAmountInput, formatMoney, parseAmountInput } from "@/domain/money";
import { seriesErrorMessage } from "@/domain/series";
import { Banner, Button, Chip, DateField, SegmentedControl, Sheet, Text, TextField } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { WalletPicker } from "../wallets/components/wallet-picker";
import { AmountInput } from "./components/amount-input";
import { GoalDestinationField } from "./components/goal-destination-field";
import { InstallmentsField } from "./components/installments-field";
import { NewCategoryDialog } from "./components/new-category-dialog";
import { RepeatField } from "./components/repeat-field";
import { TagsInput } from "./components/tags-input";
import {
  categoryAccepts,
  goalAmountOf,
  INITIAL_SCHEDULE,
  initialFormValues,
  mapScheduleFieldErrors,
  mapServerFieldErrors,
  NOTES_MAX,
  scheduleMode,
  toCreateRequest,
  toInstallmentsRequest,
  toRecurringRequest,
  toUpdateRequest,
  validateGoalAmount,
  validateSchedule,
  validateTransactionForm,
  type RepeatChoice,
  type ScheduleErrors,
  type ScheduleValues,
  type TransactionFormErrors,
  type TransactionFormValues,
} from "./transaction-form";
import { ListeningPanel } from "./voice/listening-panel";
import { useVoiceCapture } from "./voice/use-voice-capture";

const NO_CATEGORIES: Category[] = [];

/**
 * Registrar (R06) ou editar (R11) uma transação: valor, data, descrição, receita/despesa,
 * carteira, categoria (R07/R08) com sugestão pela descrição (R44), tags (R43) e voz (R65).
 * Na criação: repetir (R37), parcelar a despesa (R62) e destinar a receita a uma meta (R17, R68).
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
  const { celebrate, showSnackbar } = useFeedback();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const wallets = useWalletSummary().data?.wallets ?? [];
  const defaultWalletId = wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? null;
  const allCategories = useCategories().data ?? NO_CATEGORIES;
  const knownTags = (useTags().data ?? []).map((t) => t.name);
  const create = useCreateTransaction();
  const createRecurring = useCreateRecurring();
  const createInstallments = useCreateInstallments();
  const contribute = useContribute();
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
  // Só na criação: a voz (R65) abre o formulário com "Repetir" e "Parcelar" desligados.
  const [schedule, setSchedule] = useState<ScheduleValues>(INITIAL_SCHEDULE);
  const [scheduleErrors, setScheduleErrors] = useState<ScheduleErrors>({});
  const [goal, setGoal] = useState<{ goal: Goal | null; amountText: string }>({ goal: null, amountText: "" });
  const [goalError, setGoalError] = useState<string | null>(null);

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

  // Repetir e Parcelar são exclusivos (R37, R62).
  const changeRepeat = (repeat: RepeatChoice) =>
    setSchedule((s) => ({ ...s, repeat, installmentsOn: repeat === "none" ? s.installmentsOn : false }));
  const toggleInstallments = (on: boolean) =>
    setSchedule((s) => ({ ...s, installmentsOn: on, repeat: on ? "none" : s.repeat }));

  const handleError = (error: unknown) => {
    const serverFields = fieldErrorsOf(error);
    const fields = mapServerFieldErrors(serverFields);
    const scheduleFields = mapScheduleFieldErrors(serverFields);
    if (Object.keys(fields).length || Object.keys(scheduleFields).length) {
      setErrors(fields);
      setScheduleErrors(scheduleFields);
    } else setFormError((isApiError(error) && seriesErrorMessage(error.code)) || errorMessage(error));
  };

  /**
   * Depois de gravar: destina a receita à meta escolhida (R17) e celebra a conquista (R68). Se o
   * vínculo falhar, a receita continua registrada e o aviso explica.
   */
  const finish = (transactionId: string | null, message: string) => {
    const target = values.type === "income" ? goal.goal : null;
    if (!target) {
      onClose();
      celebrate(message);
      return;
    }
    if (!transactionId) {
      // Recorrência com a 1ª data no futuro: ainda não há receita para vincular.
      onClose();
      celebrate(message);
      showSnackbar("Receita registrada. Destine à meta nos detalhes quando ela entrar no saldo.");
      return;
    }
    contribute.mutate(
      { goalId: target.id, transactionId, amount: goalAmountOf(goal.amountText) },
      {
        onSuccess: (result) => {
          onClose();
          if (result.achievedNow) celebrate(`Meta “${result.goal.name}” atingida`, "Parabéns pela conquista!");
          else {
            celebrate(message);
            showSnackbar(`Receita destinada à meta “${result.goal.name}”`);
          }
        },
        onError: (error) => {
          logger.warn("goals.contribution_after_create_failed", { code: isApiError(error) ? error.code : null });
          onClose();
          celebrate(message);
          showSnackbar("Receita registrada, mas não foi possível destinar à meta");
        },
      },
    );
  };

  const submit = () => {
    setFormError(null);
    const current = { ...values, walletId };
    const found = validateTransactionForm(current);
    setErrors(found);
    const foundSchedule = editing ? {} : validateSchedule(current, schedule);
    setScheduleErrors(foundSchedule);
    const foundGoal =
      !editing && current.type === "income" && goal.goal
        ? validateGoalAmount(goal.amountText, parseAmountInput(current.amountText))
        : null;
    setGoalError(foundGoal);
    if (Object.keys(found).length || Object.keys(foundSchedule).length || foundGoal) return;
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
    const mode = scheduleMode(current.type, schedule);
    if (mode === "recurring") {
      createRecurring.mutate(toRecurringRequest(current, allCategories, schedule), {
        onSuccess: (result) => finish(result.transactions[0]?.id ?? null, "Recorrência registrada"),
        onError: handleError,
      });
      return;
    }
    if (mode === "installments") {
      createInstallments.mutate(toInstallmentsRequest(current, allCategories, schedule), {
        onSuccess: () => finish(null, "Parcelamento registrado"),
        onError: handleError,
      });
      return;
    }
    create.mutate(toCreateRequest(current, allCategories), {
      onSuccess: (transaction) => finish(transaction.id, "Transação registrada"),
      onError: handleError,
    });
  };

  const saving =
    create.isPending ||
    update.isPending ||
    createRecurring.isPending ||
    createInstallments.isPending ||
    contribute.isPending;
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

            <TextField
              label="Observações"
              icon="sticky_note_2"
              value={values.notes}
              onChangeText={(text) => set("notes", text)}
              placeholder="Ex.: dividido com a Ana"
              multiline
              maxLength={NOTES_MAX}
              error={errors.notes}
            />

            {!editing ? (
              <RepeatField
                allowNone
                value={schedule.repeat}
                onChange={changeRepeat}
                endDate={schedule.endDate}
                onEndDateChange={(endDate) => setSchedule((s) => ({ ...s, endDate }))}
                endDateError={scheduleErrors.endDate}
              />
            ) : null}

            {!editing && values.type === "expense" ? (
              <InstallmentsField
                enabled={schedule.installmentsOn}
                onToggle={toggleInstallments}
                countText={schedule.installmentsText}
                onCountChange={(installmentsText) => setSchedule((s) => ({ ...s, installmentsText }))}
                total={parseAmountInput(values.amountText)}
                currency={currency}
                error={scheduleErrors.installments}
              />
            ) : null}

            {!editing && values.type === "income" ? (
              <GoalDestinationField
                goalId={goal.goal?.id ?? null}
                onGoalChange={(selected) => {
                  setGoalError(null);
                  setGoal((g) => ({ ...g, goal: selected }));
                }}
                amountText={goal.amountText}
                onAmountChange={(amountText) => setGoal((g) => ({ ...g, amountText }))}
                error={goalError}
              />
            ) : null}

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
