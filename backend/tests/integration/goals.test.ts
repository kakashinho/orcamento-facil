import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createTransaction,
  LONG_SESSIONS,
  PREDEFINED,
  registerUser,
  type TestContext,
  type TestUser,
} from "./support/test-app.js";

// Relógio em 10/03/2026. Câmbio falso: 1 USD = 5 BRL.
describe("metas de economia (R15, R16, R17, R68)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
    ctx.clock.setTo(new Date("2026-03-10T15:00:00Z"));
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function goal(user: TestUser, body: Record<string, unknown> = {}) {
    const response = await user.api.post("/api/goals", {
      name: "Viagem",
      targetAmount: 1500,
      deadline: "2026-12-20",
      categoryId: PREDEFINED.leisure,
      ...body,
    });
    expect(response.statusCode).toBe(201);
    return response.json();
  }

  const income = (user: TestUser, amount: number, extra: Record<string, unknown> = {}) =>
    createTransaction(user, { type: "income", amount, description: "Freela", date: "2026-03-05", ...extra });

  it("cria, lista, detalha, altera e cancela; valida data e categoria", async () => {
    const user = await registerUser(ctx.app);
    const created = await goal(user);
    expect(created).toMatchObject({
      name: "Viagem",
      category: { id: PREDEFINED.leisure, name: "Lazer" },
      targetAmount: 1500,
      currency: "BRL",
      deadline: "2026-12-20",
      status: "active",
      saved: 0,
      percent: 0,
      remaining: 1500,
      daysLeft: 285,
    });

    const past = await user.api.post("/api/goals", { name: "X", targetAmount: 10, deadline: "2026-03-09", categoryId: PREDEFINED.food });
    expect(past.json()).toMatchObject({ code: "INVALID_DEADLINE", details: [{ path: "deadline" }] });
    const salary = await user.api.post("/api/goals", { name: "X", targetAmount: 10, deadline: "2026-12-01", categoryId: PREDEFINED.salary });
    expect(salary.json()).toMatchObject({ code: "CATEGORY_TYPE_MISMATCH", details: [{ path: "categoryId" }] });

    const updated = (await user.api.patch(`/api/goals/${created.id}`, { name: "Viagem ao Nordeste", targetAmount: 2000 })).json();
    expect(updated).toMatchObject({ name: "Viagem ao Nordeste", targetAmount: 2000 });

    const other = await registerUser(ctx.app);
    expect((await other.api.get(`/api/goals/${created.id}`)).statusCode).toBe(404);

    expect((await user.api.delete(`/api/goals/${created.id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/goals")).json().data).toEqual([]);
    expect((await user.api.get("/api/goals?status=cancelled")).json().data).toHaveLength(1);
    const cancelled = await user.api.patch(`/api/goals/${created.id}`, { name: "Outra" });
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json().code).toBe("GOAL_NOT_ACTIVE");
  });

  it("vínculo parcial, receita dividida entre metas sem passar do valor dela, e as recusas", async () => {
    const user = await registerUser(ctx.app);
    const trip = await goal(user);
    const car = await goal(user, { name: "Carro" });
    const extra = await goal(user, { name: "Reserva" });
    const freela = await income(user, 1000);

    const partial = await user.api.post(`/api/goals/${trip.id}/contributions`, { transactionId: freela.id, amount: 600 });
    expect(partial.statusCode).toBe(201);
    expect(partial.json()).toMatchObject({
      contribution: { transactionId: freela.id, amount: 600, currency: "BRL" },
      goal: { saved: 600, percent: 40, remaining: 900 },
      achievedNow: false,
    });

    const again = await user.api.post(`/api/goals/${trip.id}/contributions`, { transactionId: freela.id, amount: 1 });
    expect(again.json().code).toBe("CONTRIBUTION_EXISTS");
    const tooMuch = await user.api.post(`/api/goals/${car.id}/contributions`, { transactionId: freela.id, amount: 401 });
    expect(tooMuch.json()).toMatchObject({ code: "CONTRIBUTION_EXCEEDS_TRANSACTION", details: [{ path: "amount" }] });
    const rest = await user.api.post(`/api/goals/${car.id}/contributions`, { transactionId: freela.id });
    expect(rest.json().contribution.amount).toBe(400);
    const nothingLeft = await user.api.post(`/api/goals/${extra.id}/contributions`, { transactionId: freela.id });
    expect(nothingLeft.json().code).toBe("CONTRIBUTION_EXCEEDS_TRANSACTION");

    const expense = await createTransaction(user, { amount: 50 });
    const notIncome = await user.api.post(`/api/goals/${extra.id}/contributions`, { transactionId: expense.id });
    expect(notIncome.json()).toMatchObject({ code: "CONTRIBUTION_NOT_INCOME", details: [{ path: "transactionId" }] });

    const byTx = (await user.api.get(`/api/goals/contributions?transactionId=${freela.id}`)).json().data;
    expect(byTx.map((item: { goal: { name: string }; amount: number }) => [item.goal.name, item.amount])).toEqual([
      ["Viagem", 600],
      ["Carro", 400],
    ]);

    // Duplicar a receita não copia os vínculos.
    const copy = (await user.api.post(`/api/transactions/${freela.id}/duplicate`, {})).json();
    expect((await user.api.get(`/api/goals/contributions?transactionId=${copy.id}`)).json().data).toEqual([]);

    await user.api.delete(`/api/goals/${extra.id}`);
    const another = await income(user, 10);
    const cancelled = await user.api.post(`/api/goals/${extra.id}/contributions`, { transactionId: another.id });
    expect(cancelled.json().code).toBe("GOAL_NOT_ACTIVE");
  });

  it("progresso na leitura: receita excluída para de contar, desfazer devolve; valor menor e virar despesa", async () => {
    const user = await registerUser(ctx.app);
    const trip = await goal(user);
    const freela = await income(user, 1000);
    await user.api.post(`/api/goals/${trip.id}/contributions`, { transactionId: freela.id, amount: 800 });
    const saved = async () => (await user.api.get(`/api/goals/${trip.id}`)).json();

    await user.api.delete(`/api/transactions/${freela.id}`);
    expect((await saved()).saved).toBe(0);
    await user.api.post("/api/history/undo");
    expect((await saved()).saved).toBe(800);

    await user.api.patch(`/api/transactions/${freela.id}`, { amount: 500 });
    const detail = await saved();
    expect(detail.saved).toBe(500);
    expect(detail.contributions).toEqual([
      expect.objectContaining({ amount: 800, counted: 500, transaction: expect.objectContaining({ amount: 500 }) }),
    ]);

    await user.api.patch(`/api/transactions/${freela.id}`, { type: "expense" });
    expect((await saved()).saved).toBe(0);
  });

  it("receita em outra moeda é convertida para a moeda da meta", async () => {
    const user = await registerUser(ctx.app);
    const usd = (await user.api.post("/api/wallets", { name: "Dólar", currency: "USD" })).json();
    const trip = await goal(user);
    const dollars = await income(user, 100, { walletId: usd.id });
    const response = await user.api.post(`/api/goals/${trip.id}/contributions`, { transactionId: dollars.id });
    expect(response.json()).toMatchObject({ contribution: { amount: 100, currency: "USD" }, goal: { saved: 500 } });
  });

  it("meta atingida: celebra uma vez (achievedNow) e avisa na caixa uma única vez", async () => {
    const user = await registerUser(ctx.app);
    const small = await goal(user, { name: "Fone", targetAmount: 500 });
    const first = await income(user, 300);
    const second = await income(user, 300);
    expect((await user.api.post(`/api/goals/${small.id}/contributions`, { transactionId: first.id })).json().achievedNow).toBe(false);
    const done = (await user.api.post(`/api/goals/${small.id}/contributions`, { transactionId: second.id })).json();
    expect(done.achievedNow).toBe(true);
    expect(done.goal).toMatchObject({ status: "achieved", saved: 600, percent: 120, remaining: 0 });

    await ctx.container.events.idle();
    const inbox = (await user.api.get("/api/notifications")).json().data;
    expect(inbox).toEqual([
      expect.objectContaining({ kind: "goal_achieved", title: "Meta atingida!", body: "Você completou a meta “Fone”.", entityId: small.id }),
    ]);
    // Continua aceitando vínculos, sem novo aviso.
    const third = await income(user, 50);
    expect((await user.api.post(`/api/goals/${small.id}/contributions`, { transactionId: third.id })).json().achievedNow).toBe(false);
    await ctx.container.events.idle();
    expect((await user.api.get("/api/notifications")).json().data).toHaveLength(1);
  });

  it("desvincular receita de meta atingida reabre a meta (volta a ativa, sem perder o aviso)", async () => {
    const user = await registerUser(ctx.app);
    const small = await goal(user, { name: "Fone", targetAmount: 500 });
    const first = await income(user, 300);
    const second = await income(user, 300);
    await user.api.post(`/api/goals/${small.id}/contributions`, { transactionId: first.id });
    const done = (await user.api.post(`/api/goals/${small.id}/contributions`, { transactionId: second.id })).json();
    expect(done.goal.status).toBe("achieved");

    const detail = (await user.api.get(`/api/goals/${small.id}`)).json();
    const removed = await user.api.delete(`/api/goals/${small.id}/contributions/${detail.contributions[0].id}`);
    expect(removed.statusCode).toBe(204);
    expect(await user.api.get(`/api/goals/${small.id}`).then((r) => r.json())).toMatchObject({ status: "active", saved: 300, achievedAt: null });
    await ctx.container.events.idle();
    expect((await user.api.get("/api/notifications")).json().data).toHaveLength(1);
  });

  it("meta completada por mudança no finance (desfazer) também é marcada e avisada", async () => {
    const user = await registerUser(ctx.app);
    const big = await goal(user, { name: "Notebook", targetAmount: 2000 });
    const freela = await income(user, 1000);
    await user.api.post(`/api/goals/${big.id}/contributions`, { transactionId: freela.id });
    await user.api.delete(`/api/transactions/${freela.id}`);
    expect((await user.api.patch(`/api/goals/${big.id}`, { targetAmount: 1000 })).json().status).toBe("active");

    await user.api.post("/api/history/undo");
    await ctx.container.events.idle();
    expect((await user.api.get(`/api/goals/${big.id}`)).json()).toMatchObject({ status: "achieved", saved: 1000 });
    const kinds = (await user.api.get("/api/notifications")).json().data.map((n: { kind: string }) => n.kind);
    expect(kinds).toEqual(["goal_achieved"]);
  });
});
