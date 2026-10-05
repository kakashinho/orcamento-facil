import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import type { Transaction } from "@/data/api/types";
import {
  useArchiveBefore,
  useRestoreAllArchived,
  useSetArchived,
  useTransactionsInfinite,
} from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatDate, todayIso } from "@/domain/dates";
import {
  Banner,
  Button,
  Card,
  DateField,
  Dialog,
  EmptyState,
  IconButton,
  Skeleton,
  Spinner,
  Text,
  useResponsiveLayout,
  useTheme,
} from "@/ui";
import { useFeedback } from "../feedback/feedback-provider";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { useAppSheets } from "../shell/app-sheets";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { TransactionRow } from "../transactions/components/transaction-row";
import { useCategoryIconResolver } from "../transactions/use-category-icon";

/**
 * Arquivo de transações (R52): arquivar as antigas em lote, ver o que está arquivado e restaurar
 * (uma a uma ou todas). Cada ação oferece "Desfazer" (R49). Arquivadas saem das listas e dos totais.
 */
export function ArchiveScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const maintenance = useMaintenance();
  const { showSnackbar } = useFeedback();
  const undoable = useUndoableFeedback();
  const { openTransactionDetails } = useAppSheets();
  const iconFor = useCategoryIconResolver();

  const list = useTransactionsInfinite({ archived: "true" });
  const archiveBefore = useArchiveBefore();
  const setArchived = useSetArchived();
  const restoreAll = useRestoreAllArchived();
  const [date, setDate] = useState(() => `${todayIso().slice(0, 4)}-01-01`);
  const [confirmAll, setConfirmAll] = useState(false);

  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  const blocked = maintenance.active;

  const archiveOld = () =>
    archiveBefore.mutate(date, {
      onSuccess: ({ archived }) => {
        if (archived === 0) showSnackbar("Nenhuma transação anterior a essa data.");
        else undoable(archived === 1 ? "1 transação arquivada" : `${archived} transações arquivadas`);
      },
      onError: (error) => showSnackbar(errorMessage(error)),
    });

  const restoreOne = (transaction: Transaction) =>
    setArchived.mutate(
      { id: transaction.id, archived: false },
      {
        onSuccess: () => undoable("Transação restaurada"),
        onError: (error) => showSnackbar(errorMessage(error)),
      },
    );

  const doRestoreAll = () =>
    restoreAll.mutate(undefined, {
      onSuccess: ({ restored }) => {
        setConfirmAll(false);
        showSnackbar(restored === 1 ? "1 transação restaurada" : `${restored} transações restauradas`);
      },
      onError: (error) => {
        setConfirmAll(false);
        showSnackbar(errorMessage(error));
      },
    });

  const header = (
    <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
      <View style={styles.titleRow}>
        <IconButton
          name="arrow_back"
          accessibilityLabel="Voltar"
          color="onSurface"
          onPress={() => router.navigate("/preferences")}
        />
        <Text variant="headline" accessibilityRole="header">
          Arquivo
        </Text>
      </View>

      <MaintenanceBanner compact />

      <Card style={styles.card}>
        <Text weight="medium">Arquivar transações antigas</Text>
        <Text variant="bodySmall" color="onSurfaceVariant">
          Saem das listas e dos totais, mas continuam guardadas aqui. Dá para restaurar e para desfazer.
        </Text>
        <DateField label="Arquivar antes de" value={date} onChange={(value) => value && setDate(value)} />
        <Button
          icon="inventory_2"
          label={`Arquivar anteriores a ${formatDate(date)}`}
          onPress={archiveOld}
          loading={archiveBefore.isPending}
          disabled={!date || blocked}
          fullWidth
          testID="archive-before-button"
        />
      </Card>

      <View style={styles.sectionRow}>
        <Text weight="medium">Arquivadas</Text>
        {items.length > 0 ? (
          <Button
            variant="text"
            icon="unarchive"
            label="Restaurar todas"
            onPress={() => setConfirmAll(true)}
            disabled={blocked}
          />
        ) : null}
      </View>
      {list.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(list.error)}
        </Banner>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        testID="archive-list"
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.itemRow, { paddingHorizontal: layout.gutter }]}>
            <View style={styles.flex}>
              <TransactionRow transaction={item} icon={iconFor(item.category)} onPress={openTransactionDetails} />
            </View>
            <Button
              variant="text"
              icon="unarchive"
              label="Restaurar"
              onPress={() => restoreOne(item)}
              disabled={blocked || setArchived.isPending}
              accessibilityLabel={`Restaurar ${item.description}`}
            />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.isPending ? (
            <View style={{ paddingHorizontal: layout.gutter, gap: 12 }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={styles.skeleton} />
              ))}
            </View>
          ) : list.isError ? null : (
            <EmptyState
              icon="inventory_2"
              title="Nada arquivado"
              description="Quando você arquivar transações, elas aparecem aqui para consulta e restauração."
            />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <Spinner /> : null}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        onEndReachedThreshold={0.5}
        contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}
        style={styles.flex}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            colors={[colors.primary]}
          />
        }
      />

      <Dialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title="Restaurar todas?"
        icon="unarchive"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setConfirmAll(false)} />
            <Button label="Restaurar" loading={restoreAll.isPending} onPress={doRestoreAll} />
          </>
        }
      >
        Todas as transações arquivadas voltam às listas e aos totais.
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingBottom: 112, alignSelf: "center", width: "100%" },
  header: { gap: 12, paddingTop: 8, paddingBottom: 8 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  card: { gap: 12, padding: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemRow: { flexDirection: "row", alignItems: "center" },
  skeleton: { height: 56, borderRadius: 16 },
});
