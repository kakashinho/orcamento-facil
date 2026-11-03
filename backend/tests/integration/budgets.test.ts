import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createTransaction,
  LONG_SESSIONS,
  PREDEFINED,
  registerUser,
  type TestContext,
  type TestUser,
  unique,
} from "./support/test-app.js";

/** Relógio fixo e sessões longas: os testes atravessam meses. Câmbio falso: 1 USD = 5 BRL. */
const DAY = 86_400_000;

describe("orçamentos por categoria com vigência (R21, R74, R23, R45)", () => {
  let ctx: TestContext;
  let admin: TestUser;
  const adminEmail = `${unique("admin")}@teste.com`;

  beforeAll(async () => {
    ctx = await createTestApp({ ...LONG_SESSIONS, ADMIN_EMAILS: adminEmail });
    // 10/03/2026 às 12h em São Paulo.
    ctx.clock.setTo(new Date("2026-03-10T15:00:00Z"));
    admin = await registerUser(ctx.app, { email: adminEmail });
  });

  afterAll(async () => {
    await admin.api.put("/api/admin/maintenance", { enabled: false });
    await ctx.close();
  });

  async function budget(user: TestUser, body: Record<string, unknown>) {
    const response = await user.api.post("/api/budgets", body);
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  it("cria mensal e diário para a mesma categoria; segundo mensal é conflito; categoria de receita é recusada", async () => {
    const user = await registerUser(ctx.app);
    const monthly = await budget(user, { categoryId: PREDEFINED.food, period: "monthly", amount: 500 });
    expect(monthly).toMatchObject({
      category: { id: PREDEFINED.food, name: "Alimentação", predefined: true },
      period: "monthly",
      amount: 500,
      currency: "BRL",
      validFrom: "2026-03",
      validTo: null,
    });
    await budget(user, { categoryId: PREDEFINED.food, period: "daily", amount: 25 });

    const duplicate = await user.api.post("/api/budgets", { categoryId: PREDEFINED.food, period: "monthly", amount: 600 });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ code: "BUDGET_ALREADY_EXISTS", details: [{ path: "categoryId" }] });

    const income = await user.api.post("/api/budgets", { categoryId: PREDEFINED.salary, period: "monthly", amount: 100 });
    expect(income.statusCode).toBe(422);
    expect(income.json()).toMatchObject({ code: "CATEGORY_NOT_EXPENSE", details: [{ path: "categoryId" }] });

    const missing = await user.api.post("/api/budgets", {
      categoryId: "00000000-0000-4000-8000-0000000000ff",
      period: "monthly",
      amount: 100,
    });
    expect(missing.statusCode).toBe(422);

    const list = (await user.api.get("/api/budgets")).json().data;
    expect(list.map((item: { period: string }) => item.period)).toEqual(["daily", "monthly"]);
  });

  it("status do mês e do dia: converte moedas, conta arquivadas, ignora excluídas, receitas e outros dias", async () => {
    const user = await registerUser(ctx.app);
    const usd = (await user.api.post("/api/wallets", { name: "Viagem", currency: "USD" })).json();
    await budget(user, { categoryId: PREDEFINED.food, period: "monthly", amount: 500 });
    await budget(user, { categoryId: PREDEFINED.food, period: "daily", amount: 25 });
    await budget(user, { categoryId: PREDEFINED.transport, period: "monthly", amount: 100 });

    await createTransaction(user, { amount: 270, categoryId: PREDEFINED.food, date: "2026-03-02" });
    const archived = await createTransaction(user, { amount: 30, categoryId: PREDEFINED.food, date: "2026-03-10" });
    await user.api.post(`/api/transactions/${archived.id}/archive`);
    await createTransaction(user, { amount: 20, categoryId: PREDEFINED.food, date: "2026-03-05", walletId: usd.id });
    const deleted = await createTransaction(user, { amount: 999, categoryId: PREDEFINED.food, date: "2026-03-06" });
    await user.api.delete(`/api/transactions/${deleted.id}`);
    await createTransaction(user, { type: "income", amount: 50, categoryId: "00000000-0000-4000-8000-000000000008", date: "2026-03-06" });
    await createTransaction(user, { amount: 80, categoryId: PREDEFINED.food, date: "2026-02-27" });

    const status = (await user.api.get("/api/budgets/status")).json();
    expect(status).toMatchObject({ month: "2026-03", date: "2026-03-10" });
    expect(status.monthly).toEqual([
      expect.objectContaining({
        category: expect.objectContaining({ name: "Alimentação" }),
        limit: 500,
        spent: 400,
        remaining: 100,
        percent: 80,
        state: "warning",
      }),
      expect.objectContaining({ category: expect.objectContaining({ name: "Transporte" }), spent: 0, percent: 0, state: "ok" }),
    ]);
    expect(status.daily).toEqual([expect.objectContaining({ limit: 25, spent: 30, remaining: -5, percent: 120, state: "exceeded" })]);

    const otherDay = (await user.api.get("/api/budgets/status?date=2026-03-02")).json();
    expect(otherDay.daily[0]).toMatchObject({ spent: 270, state: "exceeded" });
  });

  it("limite diário usa o dia do fuso do usuário", async () => {
    const late = await createTestApp(LONG_SESSIONS);
    try {
      late.clock.setTo(new Date("2026-03-11T02:30:00Z")); // 10/03 às 23h30 em São Paulo
      const user = await registerUser(late.app);
      await user.api.post("/api/budgets", { categoryId: PREDEFINED.food, period: "daily", amount: 10 });
      await createTransaction(user, { amount: 12, categoryId: PREDEFINED.food, date: "2026-03-10" });
      const status = (await user.api.get("/api/budgets/status")).json();
      expect(status.date).toBe("2026-03-10");
      expect(status.daily[0]).toMatchObject({ spent: 12, state: "exceeded" });
    } finally {
      await late.close();
    }
  });

  it("alterar no mesmo mês muda o valor; em outro mês abre vigência nova; encerrar preserva o histórico", async () => {
    const user = await registerUser(ctx.app);
    const created = await budget(user, { categoryId: PREDEFINED.housing, period: "monthly", amount: 1000 });
    const same = (await user.api.patch(`/api/budgets/${created.id}`, { amount: 1200 })).json();
    expect(same).toMatchObject({ id: created.id, amount: 1200, validFrom: "2026-03" });
    await createTransaction(user, { amount: 900, categoryId: PREDEFINED.housing, date: "2026-03-15" });

    // Abril.
    ctx.clock.advance(25 * DAY);
    const next = (await user.api.patch(`/api/budgets/${created.id}`, { amount: 1500 })).json();
    expect(next.id).not.toBe(created.id);
    expect(next).toMatchObject({ amount: 1500, validFrom: "2026-04", validTo: null });
    await createTransaction(user, { amount: 1600, categoryId: PREDEFINED.housing, date: "2026-04-05" });
    // A vigência encerrada não pode mais ser alterada.
    expect((await user.api.patch(`/api/budgets/${created.id}`, { amount: 1 })).statusCode).toBe(404);

    const history = (await user.api.get("/api/budgets/history?fromMonth=2026-02&toMonth=2026-04")).json();
    expect(history.months.map((m: { month: string; items: Array<{ limit: number; spent: number; state: string }> }) => [
      m.month,
      m.items.map((item) => [item.limit, item.spent, item.state]),
    ])).toEqual([
      ["2026-02", []],
      ["2026-03", [[1200, 900, "ok"]]],
      ["2026-04", [[1500, 1600, "exceeded"]]],
    ]);

    expect((await user.api.delete(`/api/budgets/${next.id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/budgets?month=2026-04")).json().data).toEqual([]);
    const after = (await user.api.get("/api/budgets/history?fromMonth=2026-03&toMonth=2026-04")).json();
    expect(after.months.map((m: { items: unknown[] }) => m.items.length)).toEqual([1, 0]);
  });

  it("posse, manutenção e validação", async () => {
    const user = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const created = await budget(user, { categoryId: PREDEFINED.health, period: "monthly", amount: 300 });
    expect((await other.api.patch(`/api/budgets/${created.id}`, { amount: 1 })).statusCode).toBe(404);
    expect((await other.api.delete(`/api/budgets/${created.id}`)).statusCode).toBe(404);

    const tooLong = await user.api.get("/api/budgets/history?fromMonth=2025-01&toMonth=2026-01");
    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.json().details).toEqual([{ location: "querystring", path: "toMonth", message: "O período máximo é de 12 meses." }]);
    expect((await user.api.post("/api/budgets", { categoryId: PREDEFINED.health, period: "weekly", amount: 1 })).statusCode).toBe(400);

    await admin.api.put("/api/admin/maintenance", { enabled: true });
    try {
      const blocked = await user.api.post("/api/budgets", { categoryId: PREDEFINED.leisure, period: "monthly", amount: 1 });
      expect(blocked.statusCode).toBe(503);
      expect((await user.api.get("/api/budgets/status")).statusCode).toBe(200);
    } finally {
      await admin.api.put("/api/admin/maintenance", { enabled: false });
    }
  });
});
