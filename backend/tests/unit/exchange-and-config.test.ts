import { describe, expect, it, vi } from "vitest";
import type { EventLogger } from "../../src/infra/event-log.js";
import { redactUrl } from "../../src/infra/logger.js";
import { ExchangeRateService } from "../../src/modules/exchange-rates/exchange-rate.service.js";
import { AppError } from "../../src/shared/errors.js";
import { FakeExchangeRateProvider, MutableClock, testConfig } from "../helpers/test-config.js";

const silentLog = { record: vi.fn() } as unknown as EventLogger;

describe("câmbio (R29)", () => {
  it("calcula taxas cruzadas a partir da tabela em USD", async () => {
    const service = new ExchangeRateService(new FakeExchangeRateProvider(), 60, new MutableClock(), silentLog);
    expect((await service.getQuote("USD", "BRL")).rate).toBe("5");
    expect((await service.getQuote("BRL", "USD")).rate).toBe("0.2");
    expect((await service.getQuote("EUR", "BRL")).rate).toBe("6.25");
    expect((await service.convert(1000, "BRL", "EUR")).cents).toBe(160);
    expect((await service.getQuote("BRL", "BRL")).rate).toBe("1");
  });

  it("usa cache dentro do TTL e consulta de novo depois", async () => {
    const provider = new FakeExchangeRateProvider();
    const clock = new MutableClock();
    const service = new ExchangeRateService(provider, 60, clock, silentLog);
    await service.getQuote("USD", "BRL");
    await service.getQuote("EUR", "BRL");
    expect(provider.calls).toBe(1);
    clock.advanceMinutes(61);
    await service.getQuote("USD", "BRL");
    expect(provider.calls).toBe(2);
  });

  it("usa cotação antiga marcada como stale quando o provedor falha", async () => {
    const provider = new FakeExchangeRateProvider();
    const clock = new MutableClock();
    const service = new ExchangeRateService(provider, 60, clock, silentLog);
    await service.getQuote("USD", "BRL");
    provider.failing = true;
    clock.advanceMinutes(120);
    const quote = await service.getQuote("USD", "BRL");
    expect(quote.stale).toBe(true);
    expect(quote.rate).toBe("5");
  });

  it("503 sem cache e provedor fora; 422 para moeda sem cotação", async () => {
    const provider = new FakeExchangeRateProvider();
    provider.failing = true;
    const service = new ExchangeRateService(provider, 60, new MutableClock(), silentLog);
    await expect(service.getQuote("USD", "BRL")).rejects.toMatchObject({ statusCode: 503 });
    provider.failing = false;
    await expect(service.getQuote("USD", "CHF")).rejects.toMatchObject({ code: "UNSUPPORTED_CURRENCY" });
    await expect(service.getQuote("USD", "XYZ")).rejects.toBeInstanceOf(AppError);
  });
});

describe("configuração e logs", () => {
  it("falha com mensagem clara quando falta variável obrigatória", () => {
    expect(() => testConfig({ JWT_SECRET: "curto" })).toThrow(/JWT_SECRET/);
    expect(() => testConfig({ DATA_ENCRYPTION_KEY: "abc" })).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it("monta o mapa de chaves com a ativa e as anteriores", () => {
    const previous = Buffer.alloc(32, 1).toString("base64");
    const config = testConfig({ DATA_ENCRYPTION_KEY_VERSION: "2", DATA_ENCRYPTION_PREVIOUS_KEYS: `1:${previous}` });
    expect(config.encryption.activeKeyVersion).toBe(2);
    expect([...config.encryption.keys.keys()].sort()).toEqual([1, 2]);
    expect(config.auth.passwordResetUrl).toBe("http://localhost:3000/reset-password");
  });

  it("remove tokens das URLs registradas em log", () => {
    expect(redactUrl("/reset-password?token=segredo")).toBe("/reset-password?token=%5BREDACTED%5D");
    expect(redactUrl("/api/transactions?q=mercado")).toBe("/api/transactions?q=mercado");
  });
});
