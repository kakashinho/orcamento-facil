/** Datas da demonstração, sempre em AAAA-MM-DD no fuso de São Paulo (o padrão do usuário). */
const TIME_ZONE = "America/Sao_Paulo";

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const parts = (iso: string) => iso.split("-").map(Number) as [number, number, number];

export function addDays(iso: string, days: number): string {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Soma meses mantendo o dia (ou o último dia do mês, quando o mês é mais curto). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return withDay(first.toISOString().slice(0, 10), Math.min(d, last));
}

export function withDay(iso: string, day: number): string {
  const [y, m] = parts(iso);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

export const monthOf = (iso: string) => iso.slice(0, 7);
export const firstOfMonth = (iso: string) => `${monthOf(iso)}-01`;
export const lastOfMonth = (iso: string) => withDay(iso, 31);
export const dayOf = (iso: string) => Number(iso.slice(8, 10));

/** Gerador pseudoaleatório determinístico: a mesma demonstração sai igual a cada execução. */
export function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    float: next,
    between: (min: number, max: number) => Math.round((min + next() * (max - min)) * 100) / 100,
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
  };
}
