import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import { logger } from "@/core/logging/logger";
import type { Statement, WalletType } from "@/data/api/types";
import { useTransactionSummary } from "@/data/queries/finance";
import { useStatement } from "@/data/queries/reports";
import { MOVEMENT_LABEL } from "@/domain/catalog";
import { formatDate, monthToDate } from "@/domain/dates";
import { formatMoney, formatMoneyWithSign } from "@/domain/money";
import {
  Banner,
  Button,
  Card,
  DateField,
  Divider,
  Icon,
  radii,
  Sheet,
  Skeleton,
  Text,
  useResponsiveLayout,
  useTheme,
} from "@/ui";
import { WalletAvatar } from "../wallets/components/wallet-picker";
import { FilterActions, FilterSection, FilterToolbar } from "./components/filter-toolbar";
import { downloadStatementPdf, sharePdf } from "./statement-pdf";

const PREVIEW_ENTRIES = 5;

/** Extrato do período (R41) com resumo, movimentos por carteira e PDF gerado no servidor. */
export function StatementTab() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const [period, setPeriod] = useState(() => monthToDate());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);

  const statement = useStatement(period);
  const summary = useTransactionSummary({ from: period.from, to: period.to });
  const pdf = useMutation({ mutationFn: () => downloadStatementPdf(period), onSuccess: setFile });
  const share = useMutation({
    mutationFn: (uri: string) => sharePdf(uri),
    onError: (error) => logger.warn("reports.share_failed", { error: String(error) }),
  });

  const changePeriod = (next: { from: string; to: string }) => {
    setPeriod(next);
    setFile(null);
  };

  const converted = summary.data?.converted;
  useScreenMetric("transactions.statement", !!statement.data && !!summary.data);
  const primary = summary.data?.primaryCurrency ?? "BRL";

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.gutter, maxWidth: layout.contentMaxWidth }]}
      refreshControl={
        <RefreshControl
          refreshing={statement.isRefetching}
          onRefresh={() => void statement.refetch()}
          colors={[colors.primary]}
        />
      }
    >
      <FilterToolbar
        label={`${formatDate(period.from)} — ${formatDate(period.to)}`}
        active={0}
        onOpen={() => setFiltersOpen(true)}
      />
      <Text variant="bodySmall" color="onSurfaceVariant">
        Gere o extrato de um período e baixe em PDF para guardar, imprimir ou enviar.
      </Text>

      <Card style={styles.card} testID="statement-summary">
        <Text variant="bodySmall" weight="medium" style={styles.cardTitle}>
          Resumo do período
        </Text>
        {summary.isPending ? (
          <Skeleton style={styles.skeleton} />
        ) : (
          <>
            <SummaryLine label="Lançamentos" value={String(summary.data?.count ?? 0)} />
            <SummaryLine
              label="Receitas"
              value={converted ? formatMoney(converted.income, primary) : "—"}
              color="primary"
            />
            <SummaryLine label="Despesas" value={converted ? formatMoney(converted.expense, primary) : "—"} />
            <Divider style={styles.divider} />
            <SummaryLine label="Saldo" value={converted ? formatMoneyWithSign(converted.net, primary) : "—"} strong />
          </>
        )}
      </Card>

      {file ? (
        <View style={[styles.file, { backgroundColor: colors.primaryContainer }]} testID="statement-pdf-ready">
          <Icon name="picture_as_pdf" size={28} color="onPrimaryContainer" fill />
          <View style={styles.flex}>
            <Text weight="medium" color="onPrimaryContainer" numberOfLines={1}>
              {file.name}
            </Text>
            <Text variant="label" color="onPrimaryContainer">
              Pronto. Toque para abrir ou compartilhar.
            </Text>
          </View>
          <Button
            variant="filled"
            icon="share"
            accessibilityLabel="Abrir ou compartilhar PDF"
            onPress={() => share.mutate(file.uri)}
          />
        </View>
      ) : (
        <Button
          icon="picture_as_pdf"
          label={pdf.isPending ? "Gerando PDF…" : "Gerar extrato em PDF"}
          loading={pdf.isPending}
          fullWidth
          onPress={() => pdf.mutate()}
        />
      )}
      {pdf.isError ? (
        <Banner icon="error" tone="error">
          {errorMessage(pdf.error, "Não foi possível baixar o PDF. Verifique a conexão e tente novamente.")}
        </Banner>
      ) : null}
      {share.isError ? (
        <Banner icon="error" tone="error">
          Não foi possível abrir o PDF neste aparelho.
        </Banner>
      ) : null}

      {statement.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(statement.error)}
        </Banner>
      ) : null}
      {statement.isPending ? <Skeleton style={styles.walletSkeleton} /> : null}
      {statement.data?.wallets.map((section) => (
        <WalletStatement key={section.wallet.id} section={section} />
      ))}

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Período do extrato">
        <View style={styles.sheet}>
          <FilterSection label="Intervalo de datas">
            <View style={styles.dates}>
              <DateField
                compact
                label="De"
                value={period.from}
                onChange={(from) => from && changePeriod({ ...period, from })}
                style={styles.flex}
              />
              <DateField
                compact
                label="Até"
                value={period.to}
                onChange={(to) => to && changePeriod({ ...period, to })}
                style={styles.flex}
              />
            </View>
          </FilterSection>
          <FilterActions onClear={() => changePeriod(monthToDate())} onApply={() => setFiltersOpen(false)} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function SummaryLine({
  label,
  value,
  color = "onSurface",
  strong,
}: {
  label: string;
  value: string;
  color?: "primary" | "onSurface";
  strong?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Text color={strong ? "onSurface" : "onSurfaceVariant"} weight={strong ? "medium" : "regular"}>
        {label}
      </Text>
      <Text mono color={color} weight={strong ? "medium" : "regular"}>
        {value}
      </Text>
    </View>
  );
}

function WalletStatement({ section }: { section: Statement["wallets"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const currency = section.wallet.currency;
  const entries = expanded ? section.entries : section.entries.slice(0, PREVIEW_ENTRIES);
  return (
    <Card style={styles.card}>
      <View style={styles.walletHeader}>
        <WalletAvatar wallet={{ type: section.wallet.type as WalletType }} size={36} />
        <View style={styles.flex}>
          <Text weight="medium">{section.wallet.name}</Text>
          <Text variant="label" color="onSurfaceVariant">
            {currency}
          </Text>
        </View>
      </View>
      <SummaryLine label="Saldo inicial" value={formatMoney(section.openingBalance, currency)} />
      <SummaryLine label="Entradas" value={formatMoney(section.totalIn, currency)} color="primary" />
      <SummaryLine label="Saídas" value={formatMoney(section.totalOut, currency)} />
      <SummaryLine label="Saldo final" value={formatMoney(section.closingBalance, currency)} strong />
      {section.entries.length > 0 ? <Divider style={styles.divider} /> : null}
      {entries.map((entry, index) => (
        <View key={`${entry.referenceId}-${index}`} style={styles.entry}>
          <View style={styles.flex}>
            <Text variant="bodySmall" numberOfLines={1}>
              {entry.description}
            </Text>
            <Text variant="caption" color="onSurfaceVariant">
              {formatDate(entry.date, "dayMonth")} · {entry.category?.name ?? MOVEMENT_LABEL[entry.kind]}
            </Text>
          </View>
          <View style={styles.entryAmounts}>
            <Text variant="bodySmall" mono color={entry.amount >= 0 ? "primary" : "onSurface"}>
              {formatMoneyWithSign(entry.amount, currency)}
            </Text>
            <Text variant="caption" mono color="onSurfaceVariant">
              {formatMoney(entry.balance, currency)}
            </Text>
          </View>
        </View>
      ))}
      {section.entries.length > PREVIEW_ENTRIES ? (
        <Button
          variant="text"
          icon={expanded ? "expand_less" : "expand_more"}
          label={expanded ? "Mostrar menos" : `Ver todos (${section.entries.length})`}
          onPress={() => setExpanded((v) => !v)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: "100%", alignSelf: "center", gap: 16, paddingTop: 12, paddingBottom: 112 },
  card: { padding: 16 },
  cardTitle: { marginBottom: 8 },
  skeleton: { height: 96 },
  walletSkeleton: { height: 180, borderRadius: radii.xl },
  divider: { marginVertical: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radii.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  walletHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  entry: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  entryAmounts: { alignItems: "flex-end" },
  sheet: { gap: 16, paddingTop: 12 },
  dates: { flexDirection: "row", gap: 12 },
});
