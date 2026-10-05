import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import type { Transfer, WalletWithConversion } from "@/data/api/types";
import { useDeleteTransfer, useTransfers, useWalletSummary } from "@/data/queries/finance";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatDate } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import {
  Banner,
  Button,
  Card,
  ContentContainer,
  Dialog,
  Divider,
  Grid,
  Icon,
  IconButton,
  radii,
  SectionHeader,
  Skeleton,
  Text,
  useResponsiveLayout,
  useTheme,
  withAlpha,
} from "@/ui";
import { useUndoableFeedback } from "../feedback/use-undoable-feedback";
import { useAppSheets } from "../shell/app-sheets";
import { useCurrencyName } from "./components/currency-picker";
import { WalletAvatar } from "./components/wallet-picker";
import { ConverterDialog } from "./converter-dialog";

/** Carteiras (R53) com saldo de cada uma (R55), valor na moeda principal (R28/R29) e transferências (R54). */
export function WalletsScreen() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const { openTransfer, openWalletForm } = useAppSheets();
  const summary = useWalletSummary();
  const transfers = useTransfers();
  const [converterOpen, setConverterOpen] = useState(false);
  const primary = summary.data?.primaryCurrency ?? "BRL";
  useScreenMetric("wallets", !!summary.data);

  const cards = (summary.data?.wallets ?? []).map((wallet) => (
    <WalletCard
      key={wallet.id}
      wallet={wallet}
      primary={primary}
      onTransfer={() => openTransfer(wallet.id)}
      onEdit={() => openWalletForm(wallet)}
    />
  ));

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={summary.isRefetching}
          onRefresh={() => {
            void summary.refetch();
            void transfers.refetch();
          }}
          colors={[colors.primary]}
        />
      }
    >
      <ContentContainer style={styles.content}>
        <View style={styles.titleRow}>
          <Text variant="headline" accessibilityRole="header">
            Carteiras
          </Text>
          <Button variant="tonal" icon="currency_exchange" label="Converter" onPress={() => setConverterOpen(true)} />
        </View>

        {summary.data?.totalBalance !== undefined && summary.data.totalBalance !== null ? (
          <Text color="onSurfaceVariant">
            Total em {primary}:{" "}
            <Text mono weight="medium">
              {formatMoney(summary.data.totalBalance, primary)}
            </Text>
          </Text>
        ) : null}

        {summary.isError ? (
          <Banner icon="cloud_off" tone="error">
            {errorMessage(summary.error)}
          </Banner>
        ) : null}

        {summary.isPending ? (
          <View style={styles.gap}>
            {[0, 1].map((i) => (
              <Skeleton key={i} style={styles.skeleton} />
            ))}
          </View>
        ) : (
          <Grid columns={layout.columns}>{cards}</Grid>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Criar nova carteira"
          onPress={() => openWalletForm()}
          android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
          style={[styles.newWallet, { borderColor: colors.outlineVariant }]}
        >
          <Icon name="add" size={22} />
          <Text weight="medium" color="onSurfaceVariant">
            Criar nova carteira
          </Text>
        </Pressable>

        <SectionHeader title="Transferências recentes" style={styles.section} />
        {transfers.data?.data.length ? (
          <Card>
            {transfers.data.data.map((transfer, index) => (
              <View key={transfer.id}>
                {index > 0 ? <Divider /> : null}
                <TransferRow transfer={transfer} />
              </View>
            ))}
          </Card>
        ) : (
          <Text color="onSurfaceVariant">{transfers.isPending ? "Carregando…" : "Nenhuma transferência ainda."}</Text>
        )}
      </ContentContainer>

      <ConverterDialog open={converterOpen} onClose={() => setConverterOpen(false)} defaultFrom={primary} />
    </ScrollView>
  );
}

function WalletCard({
  wallet,
  primary,
  onTransfer,
  onEdit,
}: {
  wallet: WalletWithConversion;
  primary: string;
  onTransfer: () => void;
  onEdit: () => void;
}) {
  const currencyName = useCurrencyName();
  return (
    <Card style={styles.card} testID={`wallet-${wallet.id}`}>
      <View style={styles.cardRow}>
        <WalletAvatar wallet={wallet} size={48} />
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text weight="medium" numberOfLines={1} style={styles.shrink}>
              {wallet.name}
            </Text>
            {wallet.isDefault ? <Icon name="star" size={14} color="primary" fill /> : null}
          </View>
          <Text variant="label" color="onSurfaceVariant" numberOfLines={1}>
            {currencyName(wallet.currency)}
          </Text>
        </View>
        <View style={styles.amounts}>
          <Text mono variant="titleMedium" color={wallet.balance < 0 ? "error" : "onSurface"} numberOfLines={1}>
            {formatMoney(wallet.balance, wallet.currency)}
          </Text>
          {wallet.currency !== primary && wallet.balanceInPrimaryCurrency !== null ? (
            <Text variant="caption" color="onSurfaceVariant">
              ≈ {formatMoney(wallet.balanceInPrimaryCurrency, primary)}
            </Text>
          ) : null}
        </View>
      </View>
      <Divider style={styles.cardDivider} />
      <View style={styles.cardActions}>
        <Button variant="text" icon="swap_horiz" label="Transferir" onPress={onTransfer} style={styles.flex} />
        <Button variant="text" icon="edit" label="Editar" onPress={onEdit} style={styles.flex} />
      </View>
    </Card>
  );
}

function TransferRow({ transfer }: { transfer: Transfer }) {
  const remove = useDeleteTransfer();
  const undoable = useUndoableFeedback();
  const maintenance = useMaintenance();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crossCurrency = transfer.sourceWallet.currency !== transfer.targetWallet.currency;
  return (
    <View style={styles.transfer}>
      <Icon name="swap_horiz" size={22} />
      <View style={styles.flex}>
        <Text numberOfLines={1}>
          {transfer.sourceWallet.name} → {transfer.targetWallet.name}
        </Text>
        <Text variant="caption" color="onSurfaceVariant" numberOfLines={1}>
          {formatDate(transfer.date, "dayMonth")}
          {transfer.description ? ` · ${transfer.description}` : ""}
        </Text>
        {error ? (
          <Text variant="caption" color="error">
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.amounts}>
        <Text variant="bodySmall" mono>
          {formatMoney(transfer.amount, transfer.sourceWallet.currency)}
        </Text>
        {crossCurrency ? (
          <Text variant="caption" mono color="onSurfaceVariant">
            {formatMoney(transfer.targetAmount, transfer.targetWallet.currency)}
          </Text>
        ) : null}
      </View>
      <IconButton
        name="delete"
        size={36}
        disabled={maintenance.active}
        onPress={() => setConfirm(true)}
        accessibilityLabel={`Excluir transferência de ${transfer.sourceWallet.name} para ${transfer.targetWallet.name}`}
      />
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Excluir transferência?"
        icon="delete"
        actions={
          <>
            <Button variant="text" label="Cancelar" onPress={() => setConfirm(false)} />
            <Button
              variant="danger"
              label="Excluir"
              loading={remove.isPending}
              onPress={() =>
                remove.mutate(transfer.id, {
                  onSuccess: () => {
                    setConfirm(false);
                    undoable("Transferência excluída");
                  },
                  onError: (e) => {
                    setConfirm(false);
                    setError(errorMessage(e));
                  },
                })
              }
            />
          </>
        }
      >
        Os saldos das duas carteiras voltam ao valor anterior. Você pode desfazer logo em seguida.
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  content: { gap: 12, paddingTop: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  gap: { gap: 12 },
  skeleton: { height: 120, borderRadius: radii.xl },
  card: { padding: 16 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
  amounts: { alignItems: "flex-end", maxWidth: "50%" },
  cardDivider: { marginTop: 12, marginBottom: 4 },
  cardActions: { flexDirection: "row", gap: 8 },
  newWallet: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderStyle: "dashed",
    paddingVertical: 20,
    overflow: "hidden",
  },
  section: { marginTop: 12 },
  transfer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 8,
  },
});
