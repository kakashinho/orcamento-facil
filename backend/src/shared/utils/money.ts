import { errors } from "../errors/app-error.js";

/** Maior valor aceito em uma operação: 1 trilhão na unidade da moeda. */
export const MAX_AMOUNT = 1_000_000_000_000;

/**
 * Converte um valor decimal da API (ex.: 35.9) em centavos inteiros, rejeitando
 * mais de duas casas decimais. Toda aritmética interna é feita em centavos inteiros
 * para evitar erros de ponto flutuante.
 */
export function toCents(amount: number, field = "amount"): number {
  if (!Number.isFinite(amount)) {
    throw errors.invalidField(field, "Informe um número válido.");
  }
  const scaled = amount * 100;
  const cents = Math.round(scaled);
  if (Math.abs(cents - scaled) > 1e-6) {
    throw errors.invalidField(field, "Use no máximo duas casas decimais.");
  }
  if (Math.abs(amount) > MAX_AMOUNT) {
    throw errors.invalidField(field, "Valor acima do máximo permitido.");
  }
  return cents;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const RATE_SCALE_DIGITS = 12;
const RATE_SCALE = 10n ** BigInt(RATE_SCALE_DIGITS);

/** Representação decimal exata (string) de uma taxa, com até 12 casas. */
export function normalizeRate(rate: number | string): string {
  const value = typeof rate === "number" ? rate : Number(rate);
  if (!Number.isFinite(value) || value <= 0) {
    throw errors.validation("Taxa de câmbio inválida.");
  }
  return value.toFixed(RATE_SCALE_DIGITS).replace(/0+$/, "").replace(/\.$/, "");
}

function rateToScaled(rate: string): bigint {
  const [integerPart = "0", fractionPart = ""] = rate.split(".");
  const fraction = (fractionPart + "0".repeat(RATE_SCALE_DIGITS)).slice(0, RATE_SCALE_DIGITS);
  return BigInt(integerPart) * RATE_SCALE + BigInt(fraction);
}

/** Converte centavos pela taxa informada, com arredondamento half-up em aritmética inteira. */
export function convertCents(cents: number, rate: number | string): number {
  const scaledRate = rateToScaled(normalizeRate(rate));
  const negative = cents < 0;
  const product = BigInt(Math.abs(cents)) * scaledRate;
  const rounded = (product + RATE_SCALE / 2n) / RATE_SCALE;
  const result = Number(rounded);
  return negative ? -result : result;
}

/** Taxa implícita entre dois valores (alvo / origem), usada quando o cliente informa os dois. */
export function impliedRate(sourceCents: number, targetCents: number): string {
  return normalizeRate(targetCents / sourceCents);
}

let currencyCodes: Set<string> | undefined;

export function isSupportedCurrency(code: string): boolean {
  currencyCodes ??= new Set(Intl.supportedValuesOf("currency"));
  return currencyCodes.has(code);
}
