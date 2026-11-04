import { daysBetween, formatDate, toIsoDate } from "@/domain/dates";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Quando o aviso chegou, em linguagem curta: "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias" e,
 * depois de uma semana, a data ("12 de out." no ano corrente, "12/10/2025" nos anteriores).
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE) return "agora";
  if (elapsed < HOUR) return `há ${Math.floor(elapsed / MINUTE)} min`;
  const days = daysBetween(toIsoDate(date), toIsoDate(now));
  if (days === 0) return `há ${Math.floor(elapsed / HOUR)} h`;
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  const day = toIsoDate(date);
  return day.slice(0, 4) === toIsoDate(now).slice(0, 4) ? formatDate(day, "dayMonth") : formatDate(day);
}
