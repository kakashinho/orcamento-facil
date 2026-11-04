import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { ContributionResult, Transaction, TransactionContribution } from "@/data/api/types";
import { useDeleteTransaction, useDuplicateTransaction, useSetArchived } from "@/data/queries/finance";
import { useRemoveContribution } from "@/data/queries/planning";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatDate } from "@/domain/dates";
import { formatSignedMoney } from "@/domain/money";
import { seriesLabel } from "@/domain/series";
import { Banner, Button, Dialog, Icon, radii, Sheet, Text, useTheme, type IconName } from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { AttachmentsOverlays, AttachmentsSection } from "./attachments/attachments-section";
import { useAttachmentActions } from "./attachments/use-attachment-actions";
import { ContributionDialog } from "./goals/contribution-dialog";
import { GoalLinksSection } from "./goals/goal-links-section";
import { MarkRecurringDialog } from "./mark-recurring-dialog";

/**
 * Detalhes da transação com editar (R11), duplicar (R48), arquivar (R52) e excluir (R12); a série
 * ("Parcela 3/10", "Repete todo mês") e "Marcar como recorrente" (R37, R62); as metas da receita
 * (R17, R68); e os anexos: fotos, documentos e comprovantes (R24, R25, R76).
 */
export function TransactionDetailsSheet({
  transaction,
  onClose,
  onEdit,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
}) {
  // Mantém o conteúdo durante a animação de saída (atualizado na renderização, sem efeito).
  const [shown, setShown] = useState<Transaction | null>(transaction);
  // Cada transação aberta ganha um conteúdo novo (erros e diálogos não passam de uma para outra).
  const [version, setVersion] = useState(0);
  if (transaction && transaction !== shown) {
    setShown(transaction);
    setVersion((v) => v + 1);
  }

  const tx = transaction ?? shown;
  if (!tx) return null;
  return <DetailsContent key={version} tx={tx} open={!!transaction} onClose={onClose} onEdit={onEdit} />;
}

function DetailsContent({
  tx,
  open,
  onClose,
  onEdit,
}: {
  tx: Transaction;
  open: boolean;
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
}) {
  const { colors } = useTheme();
  const { celebrate, showSnackbar } = useFeedback();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const remove = useDeleteTransaction();
  const duplicate = useDuplicateTransaction();
  const archive = useSetArchived();
  const unlink = useRemoveContribution();
  const attachments = useAttachmentActions(tx.id, open);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [contributing, setContributing] = useState<TransactionContribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const income = tx.type === "income";
  const busy = remove.isPending || duplicate.isPending || archive.isPending;
  const blocked = maintenance.active;

  const fail = (e: unknown) => setError(errorMessage(e));

  const doDuplicate = () =>
    duplicate.mutate(tx.id, {
      onSuccess: () => {
        onClose();
        undoable("Transação duplicada");
      },
      onError: fail,
    });

  const doArchive = () =>
    archive.mutate(
      { id: tx.id, archived: !tx.archived },
      {
        onSuccess: () => {
          onClose();
          undoable(tx.archived ? "Transação restaurada" : "Transação arquivada");
        },
        onError: fail,
      },
    );

  const doDelete = () =>
    remove.mutate(tx.id, {
      onSuccess: () => {
        setConfirmDelete(false);
        onClose();
        undoable("Transação excluída");
      },
      onError: (e) => {
        setConfirmDelete(false);
        fail(e);
      },
    });

  const marked = (message: string) => {
    setMarkOpen(false);
    onClose();
    showSnackbar(message);
  };

  /** Vínculo criado: celebra só quando este vínculo completou a meta (R68). */
  const contributed = (result: ContributionResult) => {
    setContributing(null);
    if (result.achievedNow) celebrate(`Meta “${result.goal.name}” atingida`);
    else showSnackbar(`Receita destinada à meta “${result.goal.name}”`);
  };

  const doUnlink = (link: TransactionContribution) =>
    unlink.mutate(
      { goalId: link.goal.id, contributionId: link.id },
      {
        onSuccess: () => showSnackbar(`Receita removida da meta “${link.goal.name}”`),
        onError: fail,
      },
    );

  const hasExtraRows = tx.tags.length > 0 || !!tx.notes;

  return (
    <>
      <Sheet open={open} onClose={onClose} title="Detalhes da transação" testID="transaction-details">
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="bodySmall" weight="medium" color={income ? "primary" : "error"}>
              {income ? "Receita" : "Despesa"}
            </Text>
            <Text mono variant="headline" style={styles.amount} color={income ? "primary" : "onSurface"}>
              {formatSignedMoney(tx.amount, tx.currency, income ? "in" : "out")}
            </Text>
            <View style={styles.badges}>
              {tx.archived ? (
                <View style={[styles.badge, { backgroundColor: colors.surfaceVariant }]}>
                  <Icon name="inventory_2" size={14} />
                  <Text variant="label" color="onSurfaceVariant">
                    Arquivada
                  </Text>
                </View>
              ) : null}
              {attachments.hasReceipt ? (
                <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]} testID="receipt-badge">
                  <Icon name="receipt" size={14} color="onPrimaryContainer" />
                  <Text variant="label" color="onPrimaryContainer">
                    Comprovante anexado
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.list, { borderColor: colors.outlineVariant }]}>
            <DetailRow icon="notes" label="Descrição" value={tx.description} />
            <DetailRow icon="event" label="Data" value={formatDate(tx.date, "long")} />
            {tx.series ? (
              <DetailRow
                icon={tx.series.kind === "installment" ? "credit_card" : "repeat"}
                label={tx.series.kind === "installment" ? "Parcelamento" : "Recorrência"}
                value={seriesLabel(tx.series)}
                testID="details-series"
              />
            ) : null}
            <DetailRow
              icon="account_balance_wallet"
              label="Carteira"
              value={`${tx.wallet.name} · ${tx.wallet.currency}`}
            />
            <DetailRow
              icon="sell"
              label="Categoria"
              value={tx.category?.name ?? "Sem categoria"}
              last={!hasExtraRows}
            />
            {tx.tags.length > 0 ? (
              <View
                style={[styles.row, !!tx.notes && { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant }]}
              >
                <Icon name="tag" size={20} />
                <View style={styles.tags}>
                  {tx.tags.map((tag) => (
                    <View key={tag.id} style={[styles.tag, { backgroundColor: colors.surfaceVariant }]}>
                      <Text variant="label" color="onSurfaceVariant">
                        #{tag.name}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {tx.notes ? (
              <DetailRow
                icon="sticky_note_2"
                label="Observações"
                value={tx.notes}
                lines={8}
                last
                testID="details-notes"
              />
            ) : null}
          </View>

          {income ? (
            <GoalLinksSection
              transactionId={tx.id}
              currency={tx.currency}
              enabled={open}
              disabled={blocked || unlink.isPending}
              removingId={unlink.isPending ? (unlink.variables?.contributionId ?? null) : null}
              onAdd={setContributing}
              onRemove={doUnlink}
            />
          ) : null}

          <AttachmentsSection actions={attachments} disabled={blocked} />

          <MaintenanceBanner compact />
          {error ? (
            <Banner icon="error" tone="error">
              {error}
            </Banner>
          ) : null}

          <View style={styles.grid}>
            <Button
              variant="tonal"
              icon="edit"
              label="Editar"
              style={styles.cell}
              disabled={busy || blocked}
              onPress={() => onEdit(tx)}
            />
            <Button
              variant="tonal"
              icon="content_copy"
              label="Duplicar"
              style={styles.cell}
              loading={duplicate.isPending}
              disabled={busy || blocked}
              onPress={doDuplicate}
            />
            <Button
              variant="outlined"
              icon={tx.archived ? "unarchive" : "inventory_2"}
              label={tx.archived ? "Restaurar" : "Arquivar"}
              style={styles.cell}
              loading={archive.isPending}
              disabled={busy || blocked}
              onPress={doArchive}
            />
            <Button
              variant="dangerOutlined"
              icon="delete"
              label="Excluir"
              style={styles.cell}
              disabled={busy || blocked}
              onPress={() => setConfirmDelete(true)}
            />
            {!tx.series ? (
              <Button
                variant="outlined"
                icon="event_repeat"
                label="Marcar como recorrente"
                style={styles.full}
                disabled={busy || blocked}
                onPress={() => setMarkOpen(true)}
              />
            ) : null}
          </View>
        </View>
      </Sheet>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir transação?"
        icon="delete"
        testID="confirm-delete"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setConfirmDelete(false)} />
            <Button variant="danger" label="Excluir" loading={remove.isPending} onPress={doDelete} />
          </>
        }
      >
        Esta ação pode ser desfeita logo após a exclusão. Deseja continuar?
      </Dialog>
      {!tx.series ? (
        <MarkRecurringDialog transaction={tx} open={markOpen} onClose={() => setMarkOpen(false)} onDone={marked} />
      ) : null}
      {contributing ? (
        <ContributionDialog
          transaction={tx}
          linked={contributing}
          onClose={() => setContributing(null)}
          onDone={contributed}
        />
      ) : null}
      <AttachmentsOverlays actions={attachments} />
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  last,
  lines = 2,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
  lines?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant }]}
    >
      <Icon name={icon} size={20} />
      <View style={styles.rowBody}>
        <Text variant="caption" color="onSurfaceVariant">
          {label}
        </Text>
        <Text numberOfLines={lines}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 12 },
  header: { alignItems: "center", paddingVertical: 8 },
  amount: { fontSize: 32, lineHeight: 40, marginTop: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 8,
  },
  list: { borderWidth: 1, borderRadius: radii.lg },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowBody: { flex: 1, minWidth: 0 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 },
  tag: { borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { flexBasis: "48%", flexGrow: 1 },
  full: { flexBasis: "100%" },
});
