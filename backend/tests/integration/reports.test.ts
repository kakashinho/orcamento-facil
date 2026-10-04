import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, PREDEFINED, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("relatórios (R41, R58) e câmbio (R29)", () => {
  let ctx: TestContext;
  let user: TestUser;
  let bank: { id: string };
  let usd: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await registerUser(ctx.app);
    bank = (await user.api.post("/api/wallets", { name: "Banco", initialBalance: 1000 })).json();
    usd = (await user.api.post("/api/wallets", { name: "Conta USD", currency: "USD", initialBalance: 20 })).json();

    await createTransaction(user, { walletId: bank.id, amount: 100, description: "Antes do período", date: "2026-08-20", categoryId: PREDEFINED.food });
    await createTransaction(user, { walletId: bank.id, type: "income", amount: 3000, description: "Salário", date: "2026-09-05", categoryId: PREDEFINED.salary });
    await createTransaction(user, { walletId: bank.id, amount: 1200, description: "Aluguel", date: "2026-09-10", categoryId: PREDEFINED.housing });
    await createTransaction(user, { walletId: bank.id, amount: 300, description: "Mercado", date: "2026-09-10", categoryId: PREDEFINED.food });
    await createTransaction(user, { walletId: usd.id, amount: 10, description: "App store", date: "2026-09-15", categoryId: PREDEFINED.leisure });
    await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: user.defaultWalletId, amount: 200, date: "2026-09-20" });
    await createTransaction(user, { walletId: bank.id, amount: 50, description: "Depois do período", date: "2026-10-05" });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("extrato com saldo inicial, movimentos cronológicos e saldo corrente (R41)", async () => {
    const response = await user.api.get(`/api/reports/statement?from=2026-09-01&to=2026-09-30&walletId=${bank.id}`);
    expect(response.statusCode).toBe(200);
    const [section] = response.json().wallets;
    expect(section.wallet).toMatchObject({ id: bank.id, name: "Banco", currency: "BRL" });
    expect(section.openingBalance).toBe(900);
    expect(section.entries.map((entry: { description: string; amount: number; balance: number; kind: string }) => [
      entry.description,
      entry.kind,
      entry.amount,
      entry.balance,
    ])).toEqual([
      ["Salário", "income", 3000, 3900],
      ["Aluguel", "expense", -1200, 2700],
      ["Mercado", "expense", -300, 2400],
      ["Transferência entre carteiras", "transfer_out", -200, 2200],
    ]);
    expect(section).toMatchObject({ totalIn: 3000, totalOut: 1700, closingBalance: 2200 });
  });

  it("extrato sem carteira traz uma seção por carteira", async () => {
    const body = (await user.api.get("/api/reports/statement?from=2026-09-01&to=2026-09-30")).json();
    expect(body.wallets.map((section: { wallet: { name: string } }) => section.wallet.name)).toEqual(["Carteira", "Banco", "Conta USD"]);
    const cash = body.wallets[0];
    expect(cash.entries).toEqual([expect.objectContaining({ kind: "transfer_in", amount: 200, balance: 200 })]);
  });

  it("gera o extrato em PDF (R41)", async () => {
    const response = await user.api.get(`/api/reports/statement/pdf?from=2026-09-01&to=2026-09-30`);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.headers["content-disposition"]).toBe('attachment; filename="extrato-2026-09-01_2026-09-30.pdf"');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(response.rawPayload.length).toBeGreaterThan(1500);
  });

  it("fluxo de caixa cronológico, sem transferências internas, com totais convertidos (R58)", async () => {
    const body = (await user.api.get("/api/reports/cash-flow?from=2026-09-01&to=2026-09-30")).json();
    expect(body.entries.map((entry: { description: string; amount: number }) => [entry.description, entry.amount])).toEqual([
      ["Salário", 3000],
      ["Aluguel", -1200],
      ["Mercado", -300],
      ["App store", -10],
    ]);
    expect(body.totals).toEqual([
      { currency: "BRL", inflow: 3000, outflow: 1500, net: 1500 },
      { currency: "USD", inflow: 0, outflow: 10, net: -10 },
    ]);
    // 10 USD × 5 = 50 BRL
    expect(body.convertedTotal).toMatchObject({ currency: "BRL", inflow: 3000, outflow: 1550, net: 1450 });
  });

  it("fluxo de caixa de uma carteira inclui as transferências dela", async () => {
    const body = (await user.api.get(`/api/reports/cash-flow?from=2026-09-01&to=2026-09-30&walletId=${bank.id}`)).json();
    expect(body.entries.at(-1)).toMatchObject({ kind: "transfer_out", amount: -200 });
  });

  it("totais por categoria e evolução mensal para gráficos", async () => {
    const byCategory = (await user.api.get("/api/reports/by-category?from=2026-09-01&to=2026-09-30")).json();
    expect(byCategory.categories.map((row: { category: { name: string }; convertedTotal: number }) => [row.category.name, row.convertedTotal])).toEqual([
      ["Moradia", 1200],
      ["Alimentação", 300],
      ["Lazer", 50],
    ]);
    expect(byCategory.convertedTotal).toBe(1550);
    expect(byCategory.categories[0].share).toBeCloseTo(77.42, 2);

    const monthly = (await user.api.get("/api/reports/monthly?fromMonth=2026-08&toMonth=2026-10")).json();
    expect(monthly.months.map((month: { month: string; converted: { income: number; expense: number } }) => [
      month.month,
      month.converted.income,
      month.converted.expense,
    ])).toEqual([
      ["2026-08", 0, 100],
      ["2026-09", 3000, 1550],
      ["2026-10", 0, 50],
    ]);
  });

  it("valida períodos apontando o campo", async () => {
    const inverted = await user.api.get("/api/reports/statement?from=2026-09-30&to=2026-09-01");
    expect(inverted.statusCode).toBe(400);
    expect(inverted.json().details).toEqual([
      { location: "querystring", path: "to", message: "A data final deve ser igual ou posterior à inicial." },
    ]);
    const tooLong = await user.api.get("/api/reports/cash-flow?from=2010-01-01&to=2026-01-01");
    expect(tooLong.json().details).toEqual([
      { location: "querystring", path: "to", message: "O período máximo é de 5 anos." },
    ]);
    const months = await user.api.get("/api/reports/monthly?fromMonth=2020-01&toMonth=2026-01");
    expect(months.json().details[0]).toMatchObject({ path: "toMonth", message: "O período máximo é de 36 meses." });
  });

  it("consulta e converte câmbio (R29)", async () => {
    const rates = (await user.api.get("/api/exchange-rates?base=BRL&symbols=USD,EUR")).json();
    expect(rates).toMatchObject({ base: "BRL", rates: { USD: 0.2, EUR: 0.16 }, stale: false });
    const converted = (await user.api.get("/api/exchange-rates/convert?from=USD&to=BRL&amount=12.5")).json();
    expect(converted).toMatchObject({ from: "USD", to: "BRL", amount: 12.5, result: 62.5, rate: 5 });
    const unsupported = await user.api.get("/api/exchange-rates/convert?from=USD&to=XYZ&amount=1");
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().details[0]).toMatchObject({ location: "querystring", path: "to" });
  });
});
