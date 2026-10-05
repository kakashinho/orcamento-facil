import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Currency } from "@/data/api/types";
import { useCurrencies } from "@/data/queries/finance";
import { COMMON_CURRENCIES, currencySymbol } from "@/domain/money";
import { Chip, Icon, Sheet, Text, TextField, useInsideSheet, useTheme, withAlpha } from "@/ui";

/** Nome da moeda em português (lista do servidor), ou o próprio código. */
export function useCurrencyName(): (code: string) => string {
  const { data } = useCurrencies();
  return useMemo(() => {
    const names = new Map(data?.data.map((c) => [c.code, c.name]));
    return (code: string) => names.get(code) ?? code;
  }, [data]);
}

/** Até quantas moedas a lista mostra de uma vez (a busca refina). */
const VISIBLE_RESULTS = 40;

/**
 * Seletor de moeda (R28/R56): atalhos para as mais usadas e lista completa com busca, vinda de
 * GET /api/currencies (moedas com cotação disponível). Dentro de uma folha, a lista abre no
 * próprio formulário — o Android não apresenta um Modal dentro de outro.
 */
export function CurrencyPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const insideSheet = useInsideSheet();
  const [open, setOpen] = useState(false);

  const shortcuts = useMemo(() => {
    const list: string[] = [...COMMON_CURRENCIES];
    if (!list.includes(value)) list.push(value);
    return list;
  }, [value]);

  const choose = (code: string) => {
    onChange(code);
    setOpen(false);
  };

  return (
    <View>
      <Text variant="caption" weight="medium" color="onSurfaceVariant" style={styles.label}>
        {label}
      </Text>
      <View style={styles.chips}>
        {shortcuts.map((code) => (
          <Chip
            key={code}
            label={`${currencySymbol(code)} ${code}`}
            selected={value === code}
            disabled={disabled}
            onPress={() => onChange(code)}
          />
        ))}
        <Chip
          label="Mais moedas"
          icon="language"
          trailingIcon={insideSheet ? (open ? "expand_less" : "expand_more") : undefined}
          disabled={disabled}
          onPress={() => setOpen((v) => !v)}
        />
      </View>

      {insideSheet ? (
        open ? (
          <CurrencyList value={value} onChoose={choose} />
        ) : null
      ) : (
        <Sheet open={open} onClose={() => setOpen(false)} title="Escolher moeda">
          <CurrencyList value={value} onChoose={choose} />
        </Sheet>
      )}
    </View>
  );
}

function CurrencyList({ value, onChoose }: { value: string; onChoose: (code: string) => void }) {
  const { colors } = useTheme();
  const currencies = useCurrencies();
  const [search, setSearch] = useState("");

  const filtered = useMemo<Currency[]>(() => {
    const term = search.trim().toLowerCase();
    const all = currencies.data?.data ?? [];
    const matches = term
      ? all.filter((c) => c.code.toLowerCase().includes(term) || c.name.toLowerCase().includes(term))
      : all;
    return matches.slice(0, VISIBLE_RESULTS);
  }, [currencies.data, search]);

  return (
    <View style={styles.list}>
      <TextField
        label="Buscar moeda"
        icon="search"
        value={search}
        onChangeText={setSearch}
        placeholder="Ex.: iene, CHF"
        autoCapitalize="none"
      />
      {currencies.isPending ? (
        <Text color="onSurfaceVariant">Carregando moedas…</Text>
      ) : (
        <View>
          {filtered.map((item) => (
            <Pressable
              key={item.code}
              accessibilityRole="button"
              accessibilityLabel={`${item.name} (${item.code})`}
              accessibilityState={{ selected: item.code === value }}
              android_ripple={{ color: withAlpha(colors.onSurface, 0.08) }}
              onPress={() => onChoose(item.code)}
              style={styles.row}
            >
              <Text mono weight="medium" style={styles.code}>
                {item.code}
              </Text>
              <Text style={styles.name} numberOfLines={1}>
                {item.name}
              </Text>
              {item.code === value ? <Icon name="check" size={20} color="primary" /> : null}
            </Pressable>
          ))}
          {filtered.length === 0 ? <Text color="onSurfaceVariant">Nenhuma moeda encontrada.</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { paddingHorizontal: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  list: { gap: 12, paddingTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  code: { width: 48 },
  name: { flex: 1 },
});
