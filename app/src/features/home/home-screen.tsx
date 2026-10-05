import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import type { CategoryTotals, WalletWithConversion } from "@/data/api/types";
import { useOverview } from "@/data/queries/reports";
import { useCurrentUser } from "@/data/session/session-store";
import { useMaintenance } from "@/data/system/maintenance-store";
import { formatMoney } from "@/domain/money";
import {
  Button,
  ContentContainer,
  EmptyState,
  FAB,
  Icon,
  ProgressBar,
  radii,
  SectionHeader,
  Skeleton,
  Text,
  useTheme,
  withAlpha,
  type IconName,
} from "@/ui";
import { useAppSheets } from "../shell/app-sheets";
import { MaintenanceBanner } from "../system/maintenance-banner";
import { TRANSACTION_ROW_HEIGHT, TransactionRow } from "../transactions/components/transaction-row";
import { useCategoryIconResolver } from "../transactions/use-category-icon";
import { WalletAvatar } from "../wallets/components/wallet-picker";

/**
 * Início: patrimônio na moeda principal, saldo de cada carteira (R55), resumo do mês,
 * maiores despesas e atividade recente — tudo em uma requisição (R83, R86).
 */
export function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useCurrentUser();
  const maintenance = useMaintenance();
  const { openTransactionForm, openTransfer, openTransactionDetails } = useAppSheets();
  const overview = useOverview();
  const iconFor = useCategoryIconResolver();
  const data = overview.data;
  const loading = overview.isPending;
  const primary = data?.wallets.primaryCurrency ?? user?.primaryCurrency ?? "BRL";
  const month = data?.monthSummary.converted;
  useScreenMetric("home", !!data);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={overview.isRefetching}
            onRefresh={() => void overview.refetch()}
            colors={[colors.primary]}
          />
        }
      >
        <ContentContainer style={styles.content}>
          <View>
            <Text color="onSurfaceVariant">Olá, {user?.username ?? ""} 👋</Text>
            <Text variant="headline" accessibilityRole="header">
              Suas finanças
            </Text>
          </View>

          <MaintenanceBanner />

          {overview.isError && !data ? (
            <EmptyState
              icon="cloud_off"
              title="Não foi possível carregar"
              description={errorMessage(overview.error)}
              action={
                <Button
                  variant="tonal"
                  icon="refresh"
                  label="Tentar novamente"
                  onPress={() => void overview.refetch()}
                />
              }
            />
          ) : null}

          <View style={[styles.balance, { backgroundColor: colors.primary }]} testID="balance-card">
            <Text variant="bodySmall" color={withAlpha(colors.onPrimary, 0.8)}>
              Patrimônio total ({primary})
            </Text>
            {loading ? (
              <Skeleton style={styles.balanceSkeleton} tone={withAlpha(colors.onPrimary, 0.3)} />
            ) : (
              <Text
                mono
                variant="display"
                color="onPrimary"
                style={styles.balanceValue}
                adjustsFontSizeToFit
                numberOfLines={1}
              >
                {data?.wallets.totalBalance !== null && data?.wallets.totalBalance !== undefined
                  ? formatMoney(data.wallets.totalBalance, primary)
                  : "—"}
              </Text>
            )}
            {data?.wallets.ratesStale ? (
              <Text variant="caption" color={withAlpha(colors.onPrimary, 0.7)}>
                Conversão com cotação em cache
              </Text>
            ) : null}
            <View style={styles.monthRow}>
              <MonthFigure
                icon="south_west"
                label="Receitas (mês)"
                value={month ? formatMoney(month.income, primary) : "—"}
              />
              <MonthFigure
                icon="north_east"
                label="Despesas (mês)"
                value={month ? formatMoney(month.expense, primary) : "—"}
              />
            </View>
          </View>

          <View style={styles.shortcuts}>
            <Shortcut
              icon="add_circle"
              label={"Registrar\ntransação"}
              background={colors.secondaryContainer}
              foreground={colors.onSecondaryContainer}
              disabled={maintenance.active}
              onPress={() => openTransactionForm()}
            />
            <Shortcut
              icon="swap_horiz"
              label={"Transferir\nvalores"}
              background={colors.tertiaryContainer}
              foreground={colors.onTertiaryContainer}
              disabled={maintenance.active}
              onPress={() => openTransfer()}
            />
          </View>

          <SectionHeader
            title="Carteiras"
            action={<Button variant="text" label="Ver todas" onPress={() => router.navigate("/wallets")} />}
          />
        </ContentContainer>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wallets}>
          {loading
            ? [0, 1, 2].map((i) => <Skeleton key={i} style={styles.walletSkeleton} />)
            : data?.wallets.wallets.map((wallet) => (
                <WalletTile key={wallet.id} wallet={wallet} onPress={() => openTransfer(wallet.id)} />
              ))}
        </ScrollView>

        <ContentContainer style={styles.content}>
          {data && data.topExpenseCategories.length > 0 ? (
            <>
              <SectionHeader title="Maiores despesas do mês" />
              <View
                style={[styles.categories, { borderColor: withAlpha(colors.outlineVariant, 0.6) }]}
                testID="top-categories"
              >
                {data.topExpenseCategories.map((item, index) => (
                  <CategoryBar
                    key={item.category?.id ?? `none-${index}`}
                    item={item}
                    primary={primary}
                    icon={iconFor(item.category)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <SectionHeader title="Atividade recente" />
          <View>
            {loading
              ? [0, 1, 2].map((i) => (
                  <View key={i} style={styles.rowSkeleton}>
                    <Skeleton style={styles.iconSkeleton} />
                    <View style={styles.flex}>
                      <Skeleton style={styles.lineSkeleton} />
                      <Skeleton style={styles.shortSkeleton} />
                    </View>
                  </View>
                ))
              : data?.recentTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    icon={iconFor(transaction.category)}
                    onPress={openTransactionDetails}
                  />
                ))}
            {!loading && data && data.recentTransactions.length === 0 ? (
              <EmptyState
                icon="receipt_long"
                title="Nada por aqui ainda"
                description="Registre sua primeira receita ou despesa para acompanhar suas finanças."
              />
            ) : null}
          </View>
        </ContentContainer>
      </ScrollView>
      <FAB
        icon="add"
        label="Registrar"
        onPress={() => openTransactionForm()}
        disabled={maintenance.active}
        style={styles.fab}
      />
    </View>
  );
}

function MonthFigure({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.flex}>
      <View style={styles.figureLabel}>
        <Icon name={icon} size={14} color={withAlpha(colors.onPrimary, 0.7)} />
        <Text variant="caption" color={withAlpha(colors.onPrimary, 0.7)}>
          {label}
        </Text>
      </View>
      <Text mono color="onPrimary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  background,
  foreground,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  background: string;
  foreground: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.replace("\n", " ")}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: withAlpha(foreground, 0.12) }}
      style={[styles.shortcut, { backgroundColor: background }, disabled && styles.disabled]}
    >
      <Icon name={icon} size={26} color={foreground} fill />
      <Text weight="medium" color={foreground}>
        {label}
      </Text>
    </Pressable>
  );
}

function WalletTile({ wallet, onPress }: { wallet: WalletWithConversion; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${wallet.name}: saldo ${formatMoney(wallet.balance, wallet.currency)}. Toque para transferir.`}
      onPress={onPress}
      android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
      style={[
        styles.walletTile,
        { backgroundColor: colors.surface, borderColor: withAlpha(colors.outlineVariant, 0.6) },
      ]}
    >
      <View style={styles.walletTop}>
        <WalletAvatar wallet={wallet} size={36} shape="circle" />
        <View style={[styles.currencyPill, { backgroundColor: colors.surfaceVariant }]}>
          <Text variant="caption" weight="medium" color="onSurfaceVariant">
            {wallet.currency}
          </Text>
        </View>
      </View>
      <Text variant="bodySmall" color="onSurfaceVariant" numberOfLines={1}>
        {wallet.name}
      </Text>
      <Text
        mono
        variant="titleMedium"
        color={wallet.balance < 0 ? "error" : "onSurface"}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {formatMoney(wallet.balance, wallet.currency)}
      </Text>
    </Pressable>
  );
}

function CategoryBar({ item, primary, icon }: { item: CategoryTotals; primary: string; icon: IconName }) {
  const { colors } = useTheme();
  const share = item.share ?? 0;
  return (
    <View style={styles.categoryRow}>
      <View style={[styles.categoryIcon, { backgroundColor: colors.surfaceVariant }]}>
        <Icon name={icon} size={18} />
      </View>
      <View style={styles.flex}>
        <View style={styles.categoryText}>
          <Text variant="bodySmall" numberOfLines={1} style={styles.flex}>
            {item.category?.name ?? "Sem categoria"}
          </Text>
          <Text variant="bodySmall" mono>
            {item.convertedTotal !== null ? formatMoney(item.convertedTotal, primary) : "—"}
          </Text>
        </View>
        <ProgressBar value={share / 100} color={colors.error} height={6} />
      </View>
      <Text variant="caption" color="onSurfaceVariant" style={styles.share}>
        {Math.round(share)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingBottom: 112 },
  content: { gap: 16, paddingTop: 12 },
  balance: { borderRadius: radii.xl, padding: 20 },
  balanceValue: { marginTop: 4, fontSize: 30, lineHeight: 38 },
  balanceSkeleton: { height: 36, width: 180, marginTop: 8 },
  monthRow: { flexDirection: "row", gap: 16, marginTop: 16 },
  figureLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  shortcuts: { flexDirection: "row", gap: 12 },
  shortcut: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 16,
    overflow: "hidden",
  },
  disabled: { opacity: 0.5 },
  wallets: { gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  walletSkeleton: { width: 176, height: 112, borderRadius: radii.xl },
  walletTile: { width: 176, borderRadius: radii.xl, borderWidth: 1, padding: 16, overflow: "hidden" },
  walletTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  currencyPill: { borderRadius: radii.full, paddingHorizontal: 8, paddingVertical: 2 },
  categories: { borderWidth: 1, borderRadius: radii.xl, padding: 16, gap: 14 },
  categoryRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  categoryIcon: { width: 32, height: 32, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  categoryText: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  share: { width: 36, textAlign: "right" },
  rowSkeleton: {
    height: TRANSACTION_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  iconSkeleton: { width: 44, height: 44, borderRadius: radii.full },
  lineSkeleton: { height: 14, width: 140, marginBottom: 6 },
  shortSkeleton: { height: 12, width: 90 },
  fab: { position: "absolute", right: 16, bottom: 16 },
});
