/**
 * Valores monetários (R28, R29, R56). Toda a formatação usa o padrão brasileiro (pt-BR),
 * com o símbolo da moeda de cada carteira: "R$ 1.234,56", "US$ 908,00", "€ 720,00".
 */

export const LOCALE = "pt-BR";

/** Moedas oferecidas como atalho nos seletores; as demais ficam em "Mais moedas". */
export const COMMON_CURRENCIES = ["BRL", "USD", "EUR", "GBP"] as const;

/** Sinal de menos tipográfico, como no protótipo. */
export const MINUS = "−";

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(LOCALE, { style: "currency", currency, minimumFractionDigits: 2 });
    } catch {
      formatter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** "R$ 1.234,56" (espaços normalizados para facilitar leitura e testes). */
export function formatMoney(amount: number, currency: string): string {
  return formatterFor(currency).format(amount).replace(/ /g, " ");
}

/** Valor com sinal explícito: "+R$ 10,00" (entrada) ou "−R$ 10,00" (saída). */
export function formatSignedMoney(amount: number, currency: string, direction: "in" | "out"): string {
  return `${direction === "in" ? "+" : MINUS}${formatMoney(Math.abs(amount), currency)}`;
}

/** Valor com o sinal do próprio número (relatórios trazem entradas positivas e saídas negativas). */
export function formatMoneyWithSign(amount: number, currency: string): string {
  return formatSignedMoney(amount, currency, amount >= 0 ? "in" : "out");
}

/** Símbolo da moeda em pt-BR ("R$", "US$", "€"). */
export function currencySymbol(currency: string): string {
  try {
    const part = formatterFor(currency)
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Converte o texto digitado no campo de valor em número com até 2 casas, ou null se inválido.
 * Aceita "47,90", "1.234,56", "1234.56" e "R$ 10". Ponto seguido de exatamente 3 dígitos é
 * separador de milhar (padrão brasileiro).
 */
export function parseAmountInput(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!/\d/.test(cleaned)) return null;
  let normalized: string;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = cleaned.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    if (cleaned.indexOf(",") !== lastComma) return null;
    normalized = cleaned.replace(",", ".");
  } else if (lastDot >= 0) {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(cleaned) ? cleaned.replace(/\./g, "") : cleaned;
    if ((normalized.match(/\./g) ?? []).length > 1) return null;
  } else {
    normalized = cleaned;
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** Número → texto para pré-preencher o campo de valor na edição ("47,9" → "47,90"). */
export function formatAmountInput(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Converte para a moeda principal usando a tabela de câmbio com base nela
 * (`rates[X]` = quantas unidades de X valem 1 unidade da moeda principal). Null sem cotação.
 */
export function toPrimaryCurrency(
  amount: number,
  currency: string,
  primary: string,
  rates: Record<string, number> | undefined,
): number | null {
  if (currency === primary) return amount;
  const rate = rates?.[currency];
  if (!rate) return null;
  return amount / rate;
}
