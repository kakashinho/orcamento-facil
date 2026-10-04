import { type AppConfig, loadConfig } from "../../src/config/env.js";
import type { Clock } from "../../src/infrastructure/clock.js";
import type { ExchangeRateProvider, RateTable } from "../../src/infrastructure/exchange-rates/exchange-rate.provider.js";

export const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
export const TEST_JWT_SECRET = "test-jwt-secret-with-more-than-32-characters";
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/orcamento_test";

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    DATABASE_POOL_MAX: "5",
    JWT_SECRET: TEST_JWT_SECRET,
    DATA_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    LOG_LEVEL: "silent",
    SCRYPT_COST_LOG2: "10",
    SCRYPT_PARALLELIZATION: "1",
    AUTH_RATE_LIMIT_MAX: "100000",
    PUBLIC_BASE_URL: "http://localhost:3000",
    ...overrides,
  });
}

/**
 * Relógio controlável: avança o tempo sem esperar (bloqueio, expiração, janela de undo).
 * Cada leitura avança 1 ms, como o tempo real — sem isso, registros criados em sequência
 * empatariam no mesmo instante e a ordem por data de criação ficaria indefinida.
 */
export class MutableClock implements Clock {
  private current: number;

  constructor(start: Date = new Date()) {
    this.current = start.getTime();
  }

  now(): Date {
    this.current += 1;
    return new Date(this.current);
  }

  advance(milliseconds: number): void {
    this.current += milliseconds;
  }

  advanceMinutes(minutes: number): void {
    this.advance(minutes * 60_000);
  }
}

/** Provedor de câmbio determinístico (base USD), sem rede. */
export class FakeExchangeRateProvider implements ExchangeRateProvider {
  calls = 0;
  failing = false;
  rates: Record<string, number> = { USD: 1, BRL: 5, EUR: 0.8, JPY: 150 };

  async fetchLatest(base: string): Promise<RateTable> {
    this.calls += 1;
    if (this.failing) throw new Error("provider down");
    return {
      base,
      rates: { ...this.rates },
      updatedAt: new Date("2026-10-03T00:00:00Z"),
      source: "fake",
    };
  }
}
