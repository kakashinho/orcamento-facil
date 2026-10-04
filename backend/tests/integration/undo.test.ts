import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiClient,
  createTestApp,
  createTransaction,
  registerUser,
  type TestContext,
  walletBalance,
} from "./support/test-app.js";

describe("desfazer a última ação (R49)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ UNDO_WINDOW_HOURS: "24" });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const undo = (user: Awaited<ReturnType<typeof registerUser>>) => user.api.post("/api/history/undo");

  it("restaura uma transação excluída, com saldo e tags", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 70, tags: ["mercado"] });
    await user.api.delete(`/api/transactions/${tx.id}`);
    expect(await walletBalance(user, user.defaultWalletId)).toBe(0);

    const response = await undo(user);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ undone: { action: "transaction.delete", entityId: tx.id } });
    const restored = (await user.api.get(`/api/transactions/${tx.id}`)).json();
    expect(restored).toMatchObject({ amount: 70, tags: [{ name: "mercado" }] });
    expect(await walletBalance(user, user.defaultWalletId)).toBe(-70);
  });

  it("reverte uma edição ao estado anterior, inclusive troca de carteira", async () => {
    const user = await registerUser(ctx.app);
    const bank = (await user.api.post("/api/wallets", { name: "Banco" })).json();
    const tx = await createTransaction(user, { amount: 100, description: "Original", tags: ["a"] });
    await user.api.patch(`/api/transactions/${tx.id}`, { amount: 250, description: "Editada", walletId: bank.id, tags: ["b"] });
    expect(await walletBalance(user, bank.id)).toBe(-250);

    expect((await undo(user)).json().undone.action).toBe("transaction.update");
    const reverted = (await user.api.get(`/api/transactions/${tx.id}`)).json();
    expect(reverted).toMatchObject({ amount: 100, description: "Original", wallet: { id: user.defaultWalletId } });
    expect(reverted.tags.map((tag: { name: string }) => tag.name)).toEqual(["a"]);
    expect(await walletBalance(user, user.defaultWalletId)).toBe(-100);
    expect(await walletBalance(user, bank.id)).toBe(0);
  });

  it("desfaz várias ações em ordem inversa e avisa quando não há mais nada", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 10, description: "v1" });
    await user.api.patch(`/api/transactions/${tx.id}`, { description: "v2" });
    await user.api.post(`/api/transactions/${tx.id}/archive`);

    expect((await undo(user)).json().undone.action).toBe("transaction.archive");
    expect((await user.api.get(`/api/transactions/${tx.id}`)).json()).toMatchObject({ archived: false, description: "v2" });
    expect((await undo(user)).json().undone.action).toBe("transaction.update");
    expect((await user.api.get(`/api/transactions/${tx.id}`)).json().description).toBe("v1");
    expect((await undo(user)).json().undone.action).toBe("transaction.create");
    expect((await user.api.get(`/api/transactions/${tx.id}`)).statusCode).toBe(404);
    expect(await walletBalance(user, user.defaultWalletId)).toBe(0);

    const empty = await undo(user);
    expect(empty.statusCode).toBe(404);
    expect(empty.json().code).toBe("NOTHING_TO_UNDO");

    const history = (await user.api.get("/api/history")).json().data;
    expect(history.map((entry: { action: string; undoable: boolean }) => [entry.action, entry.undoable])).toEqual([
      ["transaction.archive", false],
      ["transaction.update", false],
      ["transaction.create", false],
    ]);
  });

  it("desfaz arquivamento em lote", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 1, date: "2025-01-10" });
    await createTransaction(user, { amount: 2, date: "2025-02-10" });
    expect((await user.api.post("/api/transactions/archive", { before: "2026-01-01" })).json().archived).toBe(2);
    expect((await user.api.get("/api/transactions")).json().data).toHaveLength(0);
    expect((await undo(user)).json().undone.action).toBe("transaction.bulk_archive");
    expect((await user.api.get("/api/transactions")).json().data).toHaveLength(2);
  });

  it("respeita a janela de tempo do desfazer", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 5 });
    ctx.clock.advanceMinutes(24 * 60 + 1);
    // O access token (15 min) também expirou: renova a sessão antes de tentar desfazer.
    const tokens = (
      await ctx.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: user.refreshToken } })
    ).json();
    const response = await apiClient(ctx.app, tokens.accessToken).post("/api/history/undo");
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("NOTHING_TO_UNDO");
  });

  it("um usuário não desfaz ações de outro", async () => {
    const owner = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const tx = await createTransaction(owner, { amount: 5 });
    expect((await undo(other)).statusCode).toBe(404);
    expect((await owner.api.get(`/api/transactions/${tx.id}`)).statusCode).toBe(200);
  });
});
