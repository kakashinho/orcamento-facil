/**
 * Datas no formato da API (AAAA-MM-DD e AAAA-MM) e rótulos em português.
 * Implementação própria (sem Intl de datas) para ter o mesmo resultado no aparelho e nos testes.
 */

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const pad = (value: number) => String(value).padStart(2, "0");

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Data de hoje no fuso do aparelho. */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function currentMonth(now: Date = new Date()): string {
  return todayIso(now).slice(0, 7);
}

/** "2026-09" + 1 → "2026-10". */
export function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function firstDayOfMonth(month: string): string {
  return `${month}-01`;
}

export function lastDayOfMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const days = new Date(year, m, 0).getDate();
  return `${month}-${pad(days)}`;
}

/** "2026-09" → "Setembro de 2026". */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  const name = MONTHS[m - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}

/** "2026-09" → "set." (eixo de gráficos). */
export function shortMonthLabel(month: string): string {
  const m = Number(month.split("-")[1]);
  return `${(MONTHS[m - 1] ?? "").slice(0, 3)}.`;
}

/** Formatos usados nas telas: 13/09/2026, "13 de set." e "13 de setembro de 2026". */
export function formatDate(iso: string, style: "short" | "dayMonth" | "long" = "short"): string {
  const [year, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1] ?? "";
  if (style === "dayMonth") return `${d} de ${month.slice(0, 3)}.`;
  if (style === "long") return `${d} de ${month} de ${year}`;
  return `${d}/${m}/${year}`;
}

/** Período padrão de relatórios: do primeiro dia do mês até hoje. */
export function monthToDate(now: Date = new Date()): { from: string; to: string } {
  return { from: firstDayOfMonth(currentMonth(now)), to: todayIso(now) };
}

/** Saudação conforme a hora do dia. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
