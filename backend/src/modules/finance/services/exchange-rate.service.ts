import type { Clock } from "../../../infrastructure/clock.js";
import type {
  ExchangeRateProvider,
  RateTable,
} from "../../../infrastructure/exchange-rates/exchange-rate.provider.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import { errors } from "../../../shared/errors/app-error.js";
import { convertCents, fromCents, isSupportedCurrency, normalizeRate, toCents } from "../../../shared/utils/money.js";
import type { ConversionResultDto, RateTableDto } from "../types/exchange-rate.types.js";

/** Moeda de referência da tabela em cache; taxas cruzadas são derivadas dela. */
const REFERENCE_CURRENCY = "USD";

export interface Quote {
  from: string;
  to: string;
  /** Decimal exato em string (até 12 casas). */
  rate: string;
  updatedAt: Date;
  source: string;
  /** Verdadeiro quando o provedor falhou e a cotação veio de um cache já expirado. */
  stale: boolean;
}

interface CachedTable {
  table: RateTable;
  fetchedAt: number;
}

export class ExchangeRateService {
  private cached: CachedTable | null = null;
  private inflight: Promise<RateTable> | null = null;

  constructor(
    private readonly provider: ExchangeRateProvider,
    private readonly cacheTtlMinutes: number,
    private readonly clock: Clock,
    private readonly eventLog: EventLogger,
  ) {}

  assertCurrency(code: string): void {
    if (!isSupportedCurrency(code)) {
      throw errors.unprocessable("UNSUPPORTED_CURRENCY", `Moeda não suportada: ${code}.`);
    }
  }

  private async loadTable(): Promise<{ table: RateTable; stale: boolean }> {
    const now = this.clock.now().getTime();
    const ttlMs = this.cacheTtlMinutes * 60_000;
    if (this.cached && now - this.cached.fetchedAt < ttlMs) {
      return { table: this.cached.table, stale: false };
    }
    try {
      this.inflight ??= this.provider.fetchLatest(REFERENCE_CURRENCY);
      const table = await this.inflight;
      this.cached = { table, fetchedAt: now };
      return { table, stale: false };
    } catch (error) {
      this.eventLog.record("exchange_rates.fetch_failed", {
        level: "warn",
        message: "Falha ao consultar a API de câmbio",
        context: { error: error instanceof Error ? error.message : String(error) },
      });
      if (this.cached) {
        return { table: this.cached.table, stale: true };
      }
      throw errors.serviceUnavailable(
        "EXCHANGE_RATE_UNAVAILABLE",
        "Cotações de câmbio indisponíveis no momento. Tente novamente em instantes.",
      );
    } finally {
      this.inflight = null;
    }
  }

  async getQuote(from: string, to: string): Promise<Quote> {
    this.assertCurrency(from);
    this.assertCurrency(to);
    if (from === to) {
      return { from, to, rate: "1", updatedAt: this.clock.now(), source: "identity", stale: false };
    }
    const { table, stale } = await this.loadTable();
    const fromRate = from === table.base ? 1 : table.rates[from];
    const toRate = to === table.base ? 1 : table.rates[to];
    if (!fromRate || !toRate) {
      throw errors.unprocessable(
        "UNSUPPORTED_CURRENCY",
        `Não há cotação disponível para ${!fromRate ? from : to}.`,
      );
    }
    return {
      from,
      to,
      rate: normalizeRate(toRate / fromRate),
      updatedAt: table.updatedAt,
      source: table.source,
      stale,
    };
  }

  async convert(cents: number, from: string, to: string): Promise<{ cents: number; quote: Quote }> {
    const quote = await this.getQuote(from, to);
    return { cents: convertCents(cents, quote.rate), quote };
  }

  /** Converte um valor decimal da API (ex.: 12.5) e devolve o DTO de resposta (R29). */
  async convertAmount(amount: number, from: string, to: string): Promise<ConversionResultDto> {
    const { cents, quote } = await this.convert(toCents(amount), from, to);
    return {
      from,
      to,
      amount,
      result: fromCents(cents),
      rate: Number(quote.rate),
      updatedAt: quote.updatedAt.toISOString(),
      stale: quote.stale,
    };
  }

  /** Tabela de taxas a partir de uma moeda base, opcionalmente filtrada. */
  async getRates(base: string, symbols?: string[]): Promise<RateTableDto> {
    this.assertCurrency(base);
    const { table, stale } = await this.loadTable();
    const baseRate = base === table.base ? 1 : table.rates[base];
    if (!baseRate) {
      throw errors.unprocessable("UNSUPPORTED_CURRENCY", `Não há cotação disponível para ${base}.`);
    }
    const wanted = symbols && symbols.length > 0 ? symbols : Object.keys(table.rates);
    const rates: Record<string, number> = {};
    for (const code of wanted) {
      const rate = code === table.base ? 1 : table.rates[code];
      if (rate) rates[code] = Number(normalizeRate(rate / baseRate));
    }
    return { base, rates, updatedAt: table.updatedAt.toISOString(), source: table.source, stale };
  }

  /**
   * Converte vários valores para uma moeda alvo sem falhar o chamador: devolve `null`
   * quando não há cotação (relatórios e resumos continuam úteis por moeda).
   */
  async tryConvertMany(
    amounts: Array<{ cents: number; currency: string }>,
    target: string,
  ): Promise<{ total: number; updatedAt: Date | null; stale: boolean } | null> {
    try {
      let total = 0;
      let updatedAt: Date | null = null;
      let stale = false;
      for (const item of amounts) {
        if (item.currency === target) {
          total += item.cents;
          continue;
        }
        const { cents, quote } = await this.convert(item.cents, item.currency, target);
        total += cents;
        updatedAt = quote.updatedAt;
        stale ||= quote.stale;
      }
      return { total, updatedAt, stale };
    } catch {
      return null;
    }
  }
}
