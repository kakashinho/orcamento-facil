import type { CategoryTotals } from "@/data/api/types";

/** Cores das categorias predefinidas (R07), pela `systemKey`, legíveis nos temas claro e escuro. */
const SYSTEM_COLORS: Record<string, string> = {
  food: "#E8710A",
  transport: "#1A73E8",
  leisure: "#9334E6",
  housing: "#188038",
  health: "#D93025",
  education: "#129EAF",
  salary: "#1E8E3E",
  other: "#80868B",
};

/** Paleta das categorias do usuário (R08): a mesma categoria sempre recebe a mesma cor. */
const CUSTOM_PALETTE = ["#C5221F", "#B06000", "#0B8043", "#1967D2", "#A142F4", "#E52592", "#00838F", "#5F6368"];

export const NEUTRAL_COLOR = "#9AA0A6";
export const OTHERS_LABEL = "Outras";

function hash(text: string): number {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) value = (value * 31 + text.charCodeAt(index)) >>> 0;
  return value;
}

export function categoryColor(category: { id: string; systemKey?: string | null } | null): string {
  if (!category) return NEUTRAL_COLOR;
  if (category.systemKey && SYSTEM_COLORS[category.systemKey]) return SYSTEM_COLORS[category.systemKey];
  return CUSTOM_PALETTE[hash(category.id) % CUSTOM_PALETTE.length];
}

export interface ChartRow {
  key: string;
  label: string;
  value: number;
  /** Percentual do total (0 a 100). */
  share: number;
  color: string;
}

/**
 * As `max` categorias com maior valor e, se houver mais, "Outras" com a soma do resto (R13, R50).
 * `systemKeys` liga o id da categoria à chave fixa do backend (a resposta do relatório só traz id e nome).
 */
export function groupTopCategories(
  rows: CategoryTotals[],
  systemKeys: Record<string, string | null> = {},
  max = 5,
): ChartRow[] {
  const valued = rows
    .filter((row) => (row.convertedTotal ?? 0) > 0)
    .sort((a, b) => (b.convertedTotal ?? 0) - (a.convertedTotal ?? 0));
  const total = valued.reduce((sum, row) => sum + (row.convertedTotal ?? 0), 0);
  if (total === 0) return [];
  const share = (value: number) => Math.round((value / total) * 1000) / 10;
  const top = valued.slice(0, max).map((row) => ({
    key: row.category?.id ?? "none",
    label: row.category?.name ?? "Sem categoria",
    value: row.convertedTotal ?? 0,
    share: share(row.convertedTotal ?? 0),
    color: row.category
      ? categoryColor({ id: row.category.id, systemKey: systemKeys[row.category.id] })
      : NEUTRAL_COLOR,
  }));
  const rest = valued.slice(max).reduce((sum, row) => sum + (row.convertedTotal ?? 0), 0);
  if (rest > 0) top.push({ key: "others", label: OTHERS_LABEL, value: rest, share: share(rest), color: NEUTRAL_COLOR });
  return top;
}

/** Resumo em texto para o leitor de tela: "Alimentação 42%, Transporte 18%". */
export function describeShares(rows: ChartRow[]): string {
  return rows.map((row) => `${row.label} ${formatPercent(row.share)}`).join(", ");
}

/** "42%" ou "4,5%" (uma casa só abaixo de 10%). */
export function formatPercent(value: number): string {
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${String(rounded).replace(".", ",")}%`;
}
