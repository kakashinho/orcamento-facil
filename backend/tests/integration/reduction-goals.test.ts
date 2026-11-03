import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createTransaction,
  LONG_SESSIONS,
  PREDEFINED,
  registerUser,
  type TestContext,
} from "./support/test-app.js";

// Relógio em março de 2026: a base usa dezembro, janeiro e fevereiro. Câmbio falso: 1 USD = 5 BRL.
describe("metas de redução de gastos (R67)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
    ctx.clock.setTo(new Date("2026-03-10T15:00:00Z"));
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("base = média dos 3 meses anteriores (mês sem gasto conta zero), congelada; alvo e situação do mês", async () => {
    const user = await registerUser(ctx.app);
    const usd = (await user.api.post("/api/wallets", { name: "Viagem", currency: "USD" })).json();
    await createTransaction(user, { amount: 300, categoryId: PREDEFINED.food, date: "2025-12-10" });
    await createTransaction(user, { amount: 200, categoryId: PREDEFINED.food, date: "2026-02-03" });
    await createTransaction(user, { amount: 20, categoryId: PREDEFINED.food, date: "2026-02-04", walletId: usd.id });
    await createTransaction(user, { amount: 999, categoryId: PREDEFINED.food, date: "2025-11-30" }); // fora da base

    const created = await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.food, percent: 10 });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      category: { name: "Alimentação" },
      percent: 10,
      currency: "BRL",
      baseline: 200,
      target: 180,
      month: "2026-03",
      spent: 0,
      state: "on_track",
      startMonth: "2026-03",
      endMonth: null,
    });

    await createTransaction(user, { amount: 150, categoryId: PREDEFINED.food, date: "2026-03-05" });
    expect((await user.api.get("/api/reduction-goals")).json().data[0]).toMatchObject({ spent: 150, state: "on_track" });
    await createTransaction(user, { amount: 40, categoryId: PREDEFINED.food, date: "2026-03-06" });
    // Lançamento novo num mês da base não muda a meta.
    await createTransaction(user, { amount: 600, categoryId: PREDEFINED.food, date: "2026-01-15" });
    expect((await user.api.get("/api/reduction-goals")).json().data[0]).toMatchObject({
      baseline: 200,
      target: 180,
      spent: 190,
      state: "exceeded",
    });
  });

  it("sem gasto anterior, duplicada, percentual inválido e categoria de receita são recusados", async () => {
    const user = await registerUser(ctx.app);
    const noBase = await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.leisure, percent: 10 });
    expect(noBase.statusCode).toBe(422);
    expect(noBase.json()).toMatchObject({ code: "NO_BASELINE", details: [{ path: "categoryId" }] });

    await createTransaction(user, { amount: 90, categoryId: PREDEFINED.transport, date: "2026-02-01" });
    expect((await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.transport, percent: 20 })).statusCode).toBe(201);
    const duplicate = await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.transport, percent: 30 });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("REDUCTION_GOAL_EXISTS");

    expect((await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.transport, percent: 0 })).statusCode).toBe(400);
    expect((await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.transport, percent: 91 })).statusCode).toBe(400);
    const income = await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.salary, percent: 10 });
    expect(income.json().code).toBe("CATEGORY_NOT_EXPENSE");
  });

  it("encerrar no mês de início apaga; em mês seguinte preserva os meses anteriores", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 300, categoryId: PREDEFINED.health, date: "2026-02-01" });
    await createTransaction(user, { amount: 300, categoryId: PREDEFINED.housing, date: "2026-02-01" });
    const health = (await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.health, percent: 10 })).json();
    const housing = (await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.housing, percent: 10 })).json();

    expect((await user.api.delete(`/api/reduction-goals/${health.id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/reduction-goals?month=2026-03")).json().data.map((g: { id: string }) => g.id)).toEqual([
      housing.id,
    ]);

    const other = await registerUser(ctx.app);
    expect((await other.api.delete(`/api/reduction-goals/${housing.id}`)).statusCode).toBe(404);

    ctx.clock.advance(25 * 86_400_000); // abril
    expect((await user.api.delete(`/api/reduction-goals/${housing.id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/reduction-goals?month=2026-04")).json().data).toEqual([]);
    expect((await user.api.get("/api/reduction-goals?month=2026-03")).json().data[0]).toMatchObject({
      id: housing.id,
      endMonth: "2026-03",
    });
  });
});
