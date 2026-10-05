import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { useDebouncedValue } from "@/core/hooks/use-debounced-value";
import { errorMessage } from "@/core/http/api-error";
import { useScreenMetric } from "@/core/logging/use-screen-metric";
import type { ArchivedFilter, SortKey, SortOrder, Transaction } from "@/data/api/types";
import { useCategories, useTags, useTransactionsInfinite, useTransactionSummary } from "@/data/queries/finance";
import { useCurrentUser } from "@/data/session/session-store";
import { categoryIcon } from "@/domain/catalog";
import { currentMonth, formatDate, monthLabel, shiftMonth } from "@/domain/dates";
import { formatMoney } from "@/domain/money";
import {
  Banner,
  Chip,
  DateField,
  EmptyState,
  Icon,
  IconButton,
  radii,
  SegmentedControl,
  Sheet,
  Skeleton,
  Spinner,
  Text,
  useResponsiveLayout,
  useTheme,
  withAlpha,
} from "@/ui";
import { FilterActions, FilterSection } from "./components/filter-toolbar";
import { TRANSACTION_ROW_HEIGHT, TransactionRow } from "./components/transaction-row";
import { useCategoryIconResolver } from "./use-category-icon";

const SORT_OPTIONS: [SortKey, string][] = [
  ["date", "Data"],
  ["amount", "Valor"],
  ["category", "Categoria"],
];

/**
 * Histórico (R09): ordem cronológica inversa com rolagem infinita, busca por descrição,
 * categoria, tag e período (R10), navegação por mês (R26), ordenação (R70) e arquivadas (R52).
 */
export function HistoryTab({ onOpen }: { onOpen: (transaction: Transaction) => void }) {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const user = useCurrentUser();
  const iconFor = useCategoryIconResolver();
  const categories = useCategories().data ?? [];
  const tags = useTags().data ?? [];

  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(() => currentMonth());
  const [sort, setSort] = useState<SortKey>("date");
  const [order, setOrder] = useState<SortOrder>("desc");
  const [archived, setArchived] = useState<ArchivedFilter>("false");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = useDebouncedValue(search.trim(), 350);
  const useRange = !!(from || to);

  const filters = useMemo(
    () => ({
      q: q || undefined,
      month: useRange ? undefined : month,
      from: from || undefined,
      to: to || undefined,
      categoryId: categoryId ?? undefined,
      tag: tag ?? undefined,
      archived,
    }),
    [q, useRange, month, from, to, categoryId, tag, archived],
  );

  const list = useTransactionsInfinite({ ...filters, sort, order });
  const summary = useTransactionSummary(filters);
  const items = useMemo(() => list.data?.pages.flatMap((page) => page.data) ?? [], [list.data]);
  useScreenMetric("transactions.history", !!list.data);

  const toggleSort = (key: SortKey) => {
    if (key === sort) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("desc");
    }
  };

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setCategoryId(null);
    setTag(null);
    setArchived("false");
  };

  const loadMore = useCallback(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [list]);

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <TransactionRow transaction={item} icon={iconFor(item.category)} onPress={onOpen} />
    ),
    [iconFor, onOpen],
  );

  const converted = summary.data?.converted;
  const primary = summary.data?.primaryCurrency ?? user?.primaryCurrency ?? "BRL";
  const selectedCategory = categories.find((c) => c.id === categoryId);

  const header = (
    <View style={[styles.header, { paddingHorizontal: layout.gutter }]}>
      <View style={[styles.search, { backgroundColor: colors.surfaceVariant }]}>
        <Icon name="search" size={20} />
        <TextInput
          accessibilityLabel="Buscar por descrição"
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por descrição"
          placeholderTextColor={colors.onSurfaceVariant}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.onSurface }]}
        />
        {search ? (
          <IconButton name="close" size={32} onPress={() => setSearch("")} accessibilityLabel="Limpar busca" />
        ) : null}
        <IconButton name="tune" size={32} onPress={() => setFiltersOpen(true)} accessibilityLabel="Filtros" />
      </View>

      {useRange ? (
        <View style={styles.center}>
          <Chip
            selected
            label={`${from ? formatDate(from) : "início"} — ${to ? formatDate(to) : "hoje"}`}
            trailingIcon="close"
            accessibilityLabel="Remover intervalo de datas"
            onPress={() => {
              setFrom("");
              setTo("");
            }}
          />
        </View>
      ) : (
        <View style={styles.monthNav}>
          <IconButton
            name="chevron_left"
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
            accessibilityLabel="Mês anterior"
          />
          <Text weight="medium" accessibilityRole="header">
            {monthLabel(month)}
          </Text>
          <IconButton
            name="chevron_right"
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
            accessibilityLabel="Próximo mês"
          />
        </View>
      )}

      {converted ? (
        <View
          style={[styles.summary, { backgroundColor: withAlpha(colors.surfaceVariant, 0.6) }]}
          testID="history-summary"
        >
          <Text variant="label" color="onSurfaceVariant">
            {summary.data?.count ?? 0} lançamentos
          </Text>
          <Text variant="label" mono color="primary">
            +{formatMoney(converted.income, primary)}
          </Text>
          <Text variant="label" mono>
            −{formatMoney(converted.expense, primary)}
          </Text>
        </View>
      ) : null}

      <View style={styles.sortRow}>
        <Text variant="label" color="onSurfaceVariant">
          Ordenar:
        </Text>
        {SORT_OPTIONS.map(([key, label]) => (
          <Chip
            key={key}
            label={label}
            selected={sort === key}
            trailingIcon={sort === key ? (order === "asc" ? "arrow_upward" : "arrow_downward") : undefined}
            accessibilityLabel={`Ordenar por ${label.toLowerCase()}${sort === key ? (order === "asc" ? ", crescente" : ", decrescente") : ""}`}
            onPress={() => toggleSort(key)}
          />
        ))}
      </View>

      {selectedCategory || tag || archived !== "false" ? (
        <View style={styles.activeFilters}>
          {selectedCategory ? (
            <Chip selected label={selectedCategory.name} trailingIcon="close" onPress={() => setCategoryId(null)} />
          ) : null}
          {tag ? <Chip selected label={`#${tag}`} trailingIcon="close" onPress={() => setTag(null)} /> : null}
          {archived !== "false" ? (
            <Chip
              selected
              label={archived === "true" ? "Só arquivadas" : "Incluindo arquivadas"}
              trailingIcon="close"
              onPress={() => setArchived("false")}
            />
          ) : null}
        </View>
      ) : null}

      {list.isError ? (
        <Banner icon="cloud_off" tone="error">
          {errorMessage(list.error)}
        </Banner>
      ) : null}
    </View>
  );

  const empty = list.isPending ? (
    <View style={{ paddingHorizontal: layout.gutter }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <Skeleton style={styles.skeletonIcon} />
          <View style={styles.flex}>
            <Skeleton style={styles.skeletonTitle} />
            <Skeleton style={styles.skeletonSub} />
          </View>
        </View>
      ))}
    </View>
  ) : list.isError ? null : (
    <EmptyState
      icon="receipt_long"
      title="Nenhuma transação"
      description="Não há registros para este período ou filtro. Ajuste a busca ou registre uma nova transação."
    />
  );

  return (
    <>
      <FlatList
        testID="history-list"
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({
          length: TRANSACTION_ROW_HEIGHT,
          offset: TRANSACTION_ROW_HEIGHT * index,
          index,
        })}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          list.isFetchingNextPage ? (
            <View style={styles.footer}>
              <Spinner />
            </View>
          ) : items.length > 0 && !list.hasNextPage ? (
            <Text variant="label" color="onSurfaceVariant" align="center" style={styles.footer}>
              Fim do histórico deste período
            </Text>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={[styles.content, { maxWidth: layout.contentMaxWidth }]}
        style={styles.flex}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isFetchingNextPage}
            onRefresh={() => void list.refetch()}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      />

      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filtros">
        <View style={styles.sheet}>
          <FilterSection label="Intervalo de datas" hint="Substitui a navegação mensal enquanto ativo.">
            <View style={styles.dates}>
              <DateField compact clearable label="De" value={from} onChange={setFrom} style={styles.flex} />
              <DateField compact clearable label="Até" value={to} onChange={setTo} style={styles.flex} />
            </View>
          </FilterSection>
          <FilterSection label="Categoria">
            <View style={styles.wrap}>
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  label={category.name}
                  icon={categoryIcon(category)}
                  selected={categoryId === category.id}
                  onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
                />
              ))}
            </View>
          </FilterSection>
          {tags.length > 0 ? (
            <FilterSection label="Tag">
              <View style={styles.wrap}>
                {tags.map((t) => (
                  <Chip
                    key={t.id}
                    label={`#${t.name}`}
                    selected={tag === t.name}
                    onPress={() => setTag(tag === t.name ? null : t.name)}
                  />
                ))}
              </View>
            </FilterSection>
          ) : null}
          <FilterSection
            label="Arquivadas"
            hint="Arquivadas saem da lista principal, mas continuam disponíveis para consulta."
          >
            <SegmentedControl
              value={archived}
              onChange={setArchived}
              options={[
                { value: "false", label: "Ativas" },
                { value: "true", label: "Arquivadas" },
                { value: "all", label: "Todas" },
              ]}
            />
          </FilterSection>
          <FilterActions onClear={clearFilters} onApply={() => setFiltersOpen(false)} />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { width: "100%", alignSelf: "center", paddingBottom: 112 },
  header: { gap: 8, paddingTop: 12, paddingBottom: 8 },
  search: {
    height: 48,
    borderRadius: radii.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 8,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  center: { alignItems: "center", paddingTop: 4 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  activeFilters: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: { paddingVertical: 16, alignItems: "center" },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  skeletonIcon: { width: 44, height: 44, borderRadius: radii.full },
  skeletonTitle: { height: 16, width: 160, marginBottom: 6 },
  skeletonSub: { height: 12, width: 96 },
  sheet: { gap: 16, paddingTop: 12 },
  dates: { flexDirection: "row", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
