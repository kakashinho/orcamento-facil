import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { Transaction } from "@/data/api/types";
import { useDeleteTransaction, useDuplicateTransaction, useSetArchived } from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatDate } from "@/domain/dates";
import { formatSignedMoney } from "@/domain/money";
import { Banner, Button, Dialog, Icon, radii, Sheet, Text, useTheme, type IconName } from "@/ui";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { MaintenanceBanner } from "../system/maintenance-banner";

/** Detalhes da transação com editar (R11), duplicar (R48), arquivar (R52) e excluir (R12). */
export function TransactionDetailsSheet({
  transaction,
  onClose,
  onEdit,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onEdit: (transaction: Transaction) => void;
}) {
  const { colors } = useTheme();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const remove = useDeleteTransaction();
  const duplicate = useDuplicateTransaction();
  const archive = useSetArchived();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mantém o conteúdo durante a animação de saída (atualizado na renderização, sem efeito).
  const [shown, setShown] = useState<Transaction | null>(transaction);
  if (transaction && transaction !== shown) {
    setShown(transaction);
    setError(null);
  }

  const tx = transaction ?? shown;
  if (!tx) return null;

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

  return (
    <>
      <Sheet open={!!transaction} onClose={onClose} title="Detalhes da transação" testID="transaction-details">
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="bodySmall" weight="medium" color={income ? "primary" : "error"}>
              {income ? "Receita" : "Despesa"}
            </Text>
            <Text mono variant="headline" style={styles.amount} color={income ? "primary" : "onSurface"}>
              {formatSignedMoney(tx.amount, tx.currency, income ? "in" : "out")}
            </Text>
            {tx.archived ? (
              <View style={[styles.archived, { backgroundColor: colors.surfaceVariant }]}>
                <Icon name="inventory_2" size={14} />
                <Text variant="label" color="onSurfaceVariant">
                  Arquivada
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.list, { borderColor: colors.outlineVariant }]}>
            <DetailRow icon="notes" label="Descrição" value={tx.description} />
            <DetailRow icon="event" label="Data" value={formatDate(tx.date, "long")} />
            <DetailRow
              icon="account_balance_wallet"
              label="Carteira"
              value={`${tx.wallet.name} · ${tx.wallet.currency}`}
            />
            <DetailRow
              icon="sell"
              label="Categoria"
              value={tx.category?.name ?? "Sem categoria"}
              last={tx.tags.length === 0}
            />
            {tx.tags.length > 0 ? (
              <View style={styles.row}>
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
          </View>

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
    </>
  );
}

function DetailRow({ icon, label, value, last }: { icon: IconName; label: string; value: string; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: colors.outlineVariant }]}>
      <Icon name={icon} size={20} />
      <View style={styles.rowBody}>
        <Text variant="caption" color="onSurfaceVariant">
          {label}
        </Text>
        <Text numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingTop: 12 },
  header: { alignItems: "center", paddingVertical: 8 },
  amount: { fontSize: 32, lineHeight: 40, marginTop: 4 },
  archived: {
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
});
