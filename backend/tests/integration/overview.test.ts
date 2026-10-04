import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInTimeZone } from "../../src/shared/utils/dates.js";
import { createTestApp, createTransaction, PREDEFINED, registerUser, type TestContext } from "./support/test-app.js";

describe("tela inicial e moedas (R55, R28, R56, R83, R86)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("GET /api/currencies é público e traz as moedas com nome em português", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/api/currencies" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Provedor de teste: USD, BRL, EUR e JPY — ordenadas pelo nome.
    expect(body.data).toEqual([
      { code: "USD", name: "Dólar americano" },
      { code: "EUR", name: "Euro" },
      { code: "JPY", name: "Iene japonês" },
      { code: "BRL", name: "Real brasileiro" },
    ]);
    expect(body.stale).toBe(false);
  });

  it("sem provedor de câmbio e sem cache, a lista de moedas continua disponível (cadastro não depende dele)", async () => {
    const isolated = await createTestApp();
    isolated.rates.failing = true;
    try {
      const response = await isolated.app.inject({ method: "GET", url: "/api/currencies" });
      expect(response.statusCode).toBe(200);
      expect(response.json().stale).toBe(true);
      expect(response.json().data).toEqual(expect.arrayContaining([{ code: "BRL", name: "Real brasileiro" }]));
    } finally {
      await isolated.close();
    }
  });

  it("visão geral reúne saldos, resumo do mês, maiores despesas e últimas transações", async () => {
    const user = await registerUser(ctx.app);
    const dollars = (await user.api.post("/api/wallets", { name: "Conta EUA", currency: "USD", initialBalance: 100 })).json();
    await createTransaction(user, { type: "income", amount: 3000, description: "Salário", date: "2026-10-01", categoryId: PREDEFINED.salary });
    await createTransaction(user, { amount: 1200, description: "Aluguel", date: "2026-10-05", categoryId: PREDEFINED.housing });
    await createTransaction(user, { amount: 300, description: "Mercado", date: "2026-10-06", categoryId: PREDEFINED.food });
    await createTransaction(user, { amount: 20, description: "Lanche", date: "2026-10-07", categoryId: PREDEFINED.food, walletId: dollars.id });
    await createTransaction(user, { amount: 50, description: "Setembro", date: "2026-09-30", categoryId: PREDEFINED.food });

    const response = await user.api.get("/api/reports/overview?month=2026-10");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.month).toBe("2026-10");
    // Saldo total na moeda principal: BRL (3000 − 1200 − 300 − 50 = 1450) + (USD 80 → BRL 400) = 1850.
    expect(body.wallets).toMatchObject({ primaryCurrency: "BRL", totalBalance: 1850 });
    expect(body.wallets.wallets).toHaveLength(2);
    expect(body.monthSummary).toMatchObject({
      count: 4,
      primaryCurrency: "BRL",
      converted: { income: 3000, expense: 1600, net: 1400 },
    });
    expect(body.topExpenseCategories.map((row: { category: { name: string } }) => row.category.name)).toEqual([
      "Moradia",
      "Alimentação",
    ]);
    expect(body.topExpenseCategories[1]).toMatchObject({ convertedTotal: 400, share: 25 });
    expect(body.recentTransactions.map((tx: { description: string }) => tx.description)).toEqual([
      "Lanche",
      "Mercado",
      "Aluguel",
      "Salário",
      "Setembro",
    ]);
  });

  it("sem mês, usa o mês atual no fuso do usuário", async () => {
    const user = await registerUser(ctx.app);
    const body = (await user.api.get("/api/reports/overview")).json();
    expect(body.month).toBe(todayInTimeZone(ctx.clock.now(), "America/Sao_Paulo").slice(0, 7));
    expect(body.recentTransactions).toEqual([]);
    expect(body.monthSummary).toMatchObject({ count: 0, converted: { income: 0, expense: 0, net: 0 } });
  });
});
