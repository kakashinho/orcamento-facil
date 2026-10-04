import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, registerUser, type TestContext, type TestUser, walletBalance } from "./support/test-app.js";

describe("transferências entre carteiras (R54, R56, R29)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function setup(): Promise<{ user: TestUser; bank: { id: string }; savings: { id: string }; usd: { id: string } }> {
    const user = await registerUser(ctx.app);
    const bank = (await user.api.post("/api/wallets", { name: "Banco", initialBalance: 1000 })).json();
    const savings = (await user.api.post("/api/wallets", { name: "Poupança", type: "savings" })).json();
    const usd = (await user.api.post("/api/wallets", { name: "Dólar", currency: "USD" })).json();
    return { user, bank, savings, usd };
  }

  it("debita a origem e credita o destino sem gerar receita ou despesa", async () => {
    const { user, bank, savings } = await setup();
    const response = await user.api.post("/api/transfers", {
      sourceWalletId: bank.id,
      targetWalletId: savings.id,
      amount: 250.75,
      date: "2026-10-01",
      description: "Guardar",
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ amount: 250.75, targetAmount: 250.75, exchangeRate: null, description: "Guardar" });
    expect(await walletBalance(user, bank.id)).toBe(749.25);
    expect(await walletBalance(user, savings.id)).toBe(250.75);

    const summary = (await user.api.get("/api/transactions/summary")).json();
    expect(summary.count).toBe(0);
  });

  it("converte entre moedas pela cotação atual ou pelo valor informado", async () => {
    const { user, bank, usd } = await setup();
    const quoted = (await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: usd.id, amount: 500 })).json();
    expect(quoted).toMatchObject({ amount: 500, targetAmount: 100, exchangeRate: 0.2 });
    expect(await walletBalance(user, usd.id)).toBe(100);

    const manual = (
      await user.api.post("/api/transfers", { sourceWalletId: usd.id, targetWalletId: bank.id, amount: 50, targetAmount: 260 })
    ).json();
    expect(manual).toMatchObject({ amount: 50, targetAmount: 260, exchangeRate: 5.2 });
    expect(await walletBalance(user, bank.id)).toBe(760);
    expect(await walletBalance(user, usd.id)).toBe(50);
  });

  it("é idempotente com Idempotency-Key", async () => {
    const { user, bank, savings } = await setup();
    const payload = { sourceWalletId: bank.id, targetWalletId: savings.id, amount: 100 };
    const headers = { "idempotency-key": "chave-unica-123" };
    const first = await user.api.post("/api/transfers", payload, headers);
    const retry = await user.api.post("/api/transfers", payload, headers);
    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().id).toBe(first.json().id);
    expect(await walletBalance(user, bank.id)).toBe(900);
  });

  it("valida carteiras e valores", async () => {
    const { user, bank, savings } = await setup();
    expect((await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: bank.id, amount: 1 })).statusCode).toBe(400);
    expect(
      (await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: savings.id, amount: 10, targetAmount: 11 })).statusCode,
    ).toBe(400);
    const other = await registerUser(ctx.app);
    expect(
      (await other.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: other.defaultWalletId, amount: 1 })).statusCode,
    ).toBe(422);
  });

  it("lista, exclui (estornando) e o desfazer restaura", async () => {
    const { user, bank, savings } = await setup();
    const transfer = (await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: savings.id, amount: 300 })).json();
    const listed = (await user.api.get(`/api/transfers?walletId=${savings.id}`)).json();
    expect(listed.data.map((item: { id: string }) => item.id)).toEqual([transfer.id]);

    expect((await user.api.delete(`/api/transfers/${transfer.id}`)).statusCode).toBe(204);
    expect(await walletBalance(user, bank.id)).toBe(1000);
    expect(await walletBalance(user, savings.id)).toBe(0);

    expect((await user.api.post("/api/history/undo")).json().undone.action).toBe("transfer.delete");
    expect(await walletBalance(user, savings.id)).toBe(300);
    expect((await user.api.post("/api/history/undo")).json().undone.action).toBe("transfer.create");
    expect(await walletBalance(user, savings.id)).toBe(0);
    expect(await walletBalance(user, bank.id)).toBe(1000);
  });

  it("carteira com transferência não pode ser excluída", async () => {
    const { user, bank, savings } = await setup();
    await user.api.post("/api/transfers", { sourceWalletId: bank.id, targetWalletId: savings.id, amount: 1 });
    const response = await user.api.delete(`/api/wallets/${savings.id}`);
    expect(response.json()).toMatchObject({ code: "WALLET_NOT_EMPTY", details: { transfers: 1 } });
  });
});
