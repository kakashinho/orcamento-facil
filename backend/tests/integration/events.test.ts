import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FinanceChangedEvent } from "../../src/infrastructure/events/domain-events.js";
import { createTestApp, createTransaction, registerUser, type TestContext } from "./support/test-app.js";

describe("eventos finance.changed depois do commit (ADR-S2-003)", () => {
  let ctx: TestContext;
  const received: FinanceChangedEvent[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.container.events.subscribe("finance.changed", "espiao", async (event) => void received.push(event));
  });

  beforeEach(() => {
    received.length = 0;
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function settled(): Promise<FinanceChangedEvent[]> {
    await ctx.container.events.idle();
    return received.splice(0);
  }

  it("transações: criar, editar, duplicar e excluir publicam um evento cada", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 10 });
    expect(await settled()).toEqual([
      {
        type: "finance.changed",
        userId: user.id,
        cause: "transaction.created",
        transactionId: tx.id,
        walletIds: [user.defaultWalletId],
        origin: "user",
      },
    ]);

    expect((await user.api.patch(`/api/transactions/${tx.id}`, { amount: 12 })).statusCode).toBe(200);
    expect((await settled()).map((e) => e.cause)).toEqual(["transaction.updated"]);

    // Edição sem mudança não publica.
    expect((await user.api.patch(`/api/transactions/${tx.id}`, { amount: 12 })).statusCode).toBe(200);
    expect(await settled()).toEqual([]);

    const copy = (await user.api.post(`/api/transactions/${tx.id}/duplicate`, {})).json();
    expect((await settled()).map((e) => [e.cause, e.transactionId])).toEqual([["transaction.created", copy.id]]);

    expect((await user.api.delete(`/api/transactions/${tx.id}`)).statusCode).toBe(204);
    expect((await settled()).map((e) => e.cause)).toEqual(["transaction.deleted"]);

    // Arquivar não muda saldo: não publica.
    expect((await user.api.post(`/api/transactions/${copy.id}/archive`)).statusCode).toBe(200);
    expect(await settled()).toEqual([]);
  });

  it("falha não publica", async () => {
    const user = await registerUser(ctx.app);
    const invalid = await user.api.post("/api/transactions", {
      type: "expense",
      amount: 10,
      description: "x",
      walletId: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(invalid.statusCode).toBe(422);
    expect(await settled()).toEqual([]);
  });

  it("transferências, saldo inicial e desfazer publicam", async () => {
    const user = await registerUser(ctx.app);
    const savings = (await user.api.post("/api/wallets", { name: "Poupança", currency: "BRL" })).json();
    await settled();

    const transfer = await user.api.post("/api/transfers", {
      sourceWalletId: user.defaultWalletId,
      targetWalletId: savings.id,
      amount: 5,
    });
    expect(transfer.statusCode).toBe(201);
    expect(await settled()).toEqual([
      expect.objectContaining({ cause: "transfer.changed", walletIds: [user.defaultWalletId, savings.id] }),
    ]);

    expect((await user.api.patch(`/api/wallets/${savings.id}`, { initialBalance: 100 })).statusCode).toBe(200);
    expect(await settled()).toEqual([expect.objectContaining({ cause: "wallet.updated", walletIds: [savings.id] })]);

    expect((await user.api.patch(`/api/wallets/${savings.id}`, { name: "Reserva" })).statusCode).toBe(200);
    expect(await settled()).toEqual([]);

    expect((await user.api.post("/api/history/undo")).statusCode).toBe(200);
    expect(await settled()).toEqual([expect.objectContaining({ cause: "undo", walletIds: [] })]);
  });
});
