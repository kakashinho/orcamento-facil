import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, LONG_SESSIONS, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("saldo mínimo da carteira (R78)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
    ctx.clock.setTo(new Date("2026-03-10T15:00:00Z"));
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function lowBalance(user: TestUser) {
    await ctx.container.events.idle();
    const inbox = (await user.api.get("/api/notifications?limit=50")).json().data;
    return inbox.filter((n: { kind: string }) => n.kind === "low_balance");
  }

  it("cria, altera e remove o mínimo (inclusive negativo); sem mínimo responde null", async () => {
    const user = await registerUser(ctx.app);
    expect((await user.api.get(`/api/wallets/${user.defaultWalletId}`)).json().minBalance).toBeNull();

    const card = await user.api.post("/api/wallets", { name: "Cartão", type: "credit_card", minBalance: -2000 });
    expect(card.json()).toMatchObject({ minBalance: -2000 });
    expect((await user.api.patch(`/api/wallets/${card.json().id}`, { minBalance: -1500.5 })).json().minBalance).toBe(-1500.5);
    expect((await user.api.patch(`/api/wallets/${card.json().id}`, { minBalance: null })).json().minBalance).toBeNull();
    expect((await user.api.patch(`/api/wallets/${card.json().id}`, { minBalance: 1.001 })).statusCode).toBe(400);
  });

  it("avisa ao ficar abaixo, no máximo uma vez por dia por carteira", async () => {
    const user = await registerUser(ctx.app);
    await user.api.patch(`/api/wallets/${user.defaultWalletId}`, { initialBalance: 500, minBalance: 100 });
    expect(await lowBalance(user)).toEqual([]);

    await createTransaction(user, { amount: 450 });
    expect(await lowBalance(user)).toEqual([
      expect.objectContaining({
        title: "Saldo abaixo do mínimo",
        body: "A carteira Carteira ficou abaixo do saldo mínimo.",
        entityType: "wallet",
        entityId: user.defaultWalletId,
      }),
    ]);
    await createTransaction(user, { amount: 10 });
    expect(await lowBalance(user)).toHaveLength(1);

    ctx.clock.advance(86_400_000);
    await createTransaction(user, { amount: 1 });
    expect(await lowBalance(user)).toHaveLength(2);
  });

  it("transferência e definir um mínimo acima do saldo também avisam", async () => {
    const user = await registerUser(ctx.app);
    const savings = (await user.api.post("/api/wallets", { name: "Reserva", initialBalance: 1000, minBalance: 900 })).json();
    await user.api.post("/api/transfers", { sourceWalletId: savings.id, targetWalletId: user.defaultWalletId, amount: 200 });
    expect((await lowBalance(user)).map((n: { entityId: string }) => n.entityId)).toEqual([savings.id]);

    const other = await registerUser(ctx.app);
    await other.api.patch(`/api/wallets/${other.defaultWalletId}`, { minBalance: 50 });
    expect(await lowBalance(other)).toHaveLength(1);
  });
});
