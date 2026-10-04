import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { transactions } from "../../src/infrastructure/database/schema.js";
import { aad } from "../../src/infrastructure/crypto/field-cipher.js";
import { createTestApp, PREDEFINED, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

/**
 * R83: as telas devem carregar em menos de 1 s em 4G, com destaque para a lista de transações
 * e os gráficos. Este teste mede o tempo de servidor (sem rede) com um volume realista de
 * dados — 3 anos de uso intenso — e exige folga ampla dentro desse orçamento.
 */
const TRANSACTION_COUNT = 3000;
const SERVER_BUDGET_MS = 300;
const RUNS = 5;

describe("desempenho das consultas (R83)", () => {
  let ctx: TestContext;
  let user: TestUser;
  const results: Array<{ endpoint: string; medianMs: number; bytesGzip: number }> = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await registerUser(ctx.app);
    const { db, cipher } = ctx.container;
    const descriptions = ["Supermercado", "Padaria", "Uber", "Aluguel", "Farmácia", "Cinema", "Restaurante", "Combustível"];
    const categoryIds = Object.values(PREDEFINED);
    const start = Date.UTC(2023, 9, 1);
    const rows = Array.from({ length: TRANSACTION_COUNT }, (_, index) => {
      const id = randomUUID();
      const date = new Date(start + Math.floor((index / TRANSACTION_COUNT) * 3 * 365) * 86_400_000).toISOString().slice(0, 10);
      const cents = 100 + ((index * 7919) % 50_000);
      return {
        id,
        userId: user.id,
        walletId: user.defaultWalletId,
        type: index % 10 === 0 ? "income" : "expense",
        amount: cipher.encryptAmount(cents, aad.transactionAmount(id)),
        date,
        description: `${descriptions[index % descriptions.length]} ${index}`,
        categoryId: categoryIds[index % categoryIds.length]!,
        createdAt: new Date(start + index * 1000),
        updatedAt: new Date(start + index * 1000),
      };
    });
    for (let offset = 0; offset < rows.length; offset += 500) {
      await db.insert(transactions).values(rows.slice(offset, offset + 500));
    }
  }, 120_000);

  afterAll(async () => {
    console.table(results);
    await ctx.close();
  });

  async function measure(endpoint: string) {
    const timings: number[] = [];
    let bytesGzip = 0;
    for (let run = 0; run < RUNS; run += 1) {
      const startedAt = performance.now();
      const response = await user.api.get(endpoint, { "accept-encoding": "gzip" });
      timings.push(performance.now() - startedAt);
      expect(response.statusCode).toBe(200);
      bytesGzip = response.rawPayload.length;
    }
    timings.sort((a, b) => a - b);
    const medianMs = Math.round(timings[Math.floor(RUNS / 2)]! * 10) / 10;
    results.push({ endpoint, medianMs, bytesGzip });
    return medianMs;
  }

  it.each([
    "/api/transactions?limit=30",
    "/api/transactions?limit=30&q=farmacia",
    "/api/transactions?limit=30&sort=amount&order=desc",
    "/api/transactions?limit=30&sort=category",
    "/api/transactions?month=2026-01&limit=30",
    "/api/transactions/summary?month=2026-01",
    "/api/wallets/summary",
    "/api/reports/by-category?from=2026-01-01&to=2026-06-30",
    "/api/reports/monthly?fromMonth=2025-07&toMonth=2026-06",
    "/api/reports/cash-flow?from=2026-01-01&to=2026-03-31",
  ])("%s responde dentro do orçamento", async (endpoint) => {
    expect(await measure(endpoint)).toBeLessThan(SERVER_BUDGET_MS);
  });
});
