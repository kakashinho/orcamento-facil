import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, registerUser, type TestContext, walletBalance } from "./support/test-app.js";

describe("carteiras (R53, R55, R56, R28)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("cria várias carteiras com moedas próprias e lista com saldos", async () => {
    const user = await registerUser(ctx.app);
    const checking = await user.api.post("/api/wallets", { name: "Conta corrente", type: "checking", initialBalance: 1500.5 });
    expect(checking.statusCode).toBe(201);
    expect(checking.json()).toMatchObject({ currency: "BRL", balance: 1500.5, initialBalance: 1500.5, isDefault: false });

    const dollars = await user.api.post("/api/wallets", { name: "Conta EUA", type: "savings", currency: "USD", initialBalance: 200 });
    expect(dollars.json()).toMatchObject({ currency: "USD", balance: 200 });

    const list = (await user.api.get("/api/wallets")).json().data;
    expect(list.map((wallet: { name: string }) => wallet.name)).toEqual(["Carteira", "Conta corrente", "Conta EUA"]);
  });

  it("resumo da tela inicial converte o total para a moeda principal (R55, R29)", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/wallets", { name: "Banco", initialBalance: 100 });
    await user.api.post("/api/wallets", { name: "Dólares", currency: "USD", initialBalance: 10 });
    const summary = (await user.api.get("/api/wallets/summary")).json();
    expect(summary.primaryCurrency).toBe("BRL");
    // 0 + 100 BRL + 10 USD × 5
    expect(summary.totalBalance).toBe(150);
    const usd = summary.wallets.find((wallet: { currency: string }) => wallet.currency === "USD");
    expect(usd.balanceInPrimaryCurrency).toBe(50);
  });

  it("resumo continua útil sem cotação: total nulo, saldos individuais presentes", async () => {
    const isolated = await createTestApp();
    try {
      isolated.rates.failing = true;
      const user = await registerUser(isolated.app);
      await user.api.post("/api/wallets", { name: "Euros", currency: "EUR", initialBalance: 30 });
      const summary = (await user.api.get("/api/wallets/summary")).json();
      expect(summary.totalBalance).toBeNull();
      expect(summary.wallets.find((wallet: { currency: string }) => wallet.currency === "EUR").balance).toBe(30);
    } finally {
      await isolated.close();
    }
  });

  it("valida nome único (sem diferenciar maiúsculas) e moeda ISO", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/wallets", { name: "Poupança" });
    const duplicate = await user.api.post("/api/wallets", { name: "POUPANÇA" });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe("WALLET_NAME_TAKEN");
    expect(duplicate.json().details).toEqual([
      { location: "body", path: "name", message: "Você já possui uma carteira com esse nome." },
    ]);
    const unsupported = await user.api.post("/api/wallets", { name: "X", currency: "XYZ" });
    expect(unsupported.statusCode).toBe(400);
    expect(unsupported.json().details[0]).toMatchObject({ location: "body", path: "currency" });
    // Código em minúsculas e com espaços é normalizado (teclado do celular).
    const lower = await user.api.post("/api/wallets", { name: "Viagem", currency: " usd " });
    expect(lower.statusCode).toBe(201);
    expect(lower.json().currency).toBe("USD");
    const blank = await user.api.post("/api/wallets", { name: "   " });
    expect(blank.statusCode).toBe(400);
    expect(blank.json().details).toEqual([{ location: "body", path: "name", message: "Informe o nome da carteira." }]);
  });

  it("ajustar o saldo inicial recompõe o saldo atual", async () => {
    const user = await registerUser(ctx.app);
    const wallet = (await user.api.post("/api/wallets", { name: "Dinheiro", type: "cash", initialBalance: 100 })).json();
    await createTransaction(user, { walletId: wallet.id, amount: 30 });
    const updated = (await user.api.patch(`/api/wallets/${wallet.id}`, { initialBalance: 250 })).json();
    expect(updated).toMatchObject({ initialBalance: 250, balance: 220 });
  });

  it("não troca a moeda de carteira com movimentações e não exclui carteira com movimentos", async () => {
    const user = await registerUser(ctx.app);
    const wallet = (await user.api.post("/api/wallets", { name: "Viagem" })).json();
    expect((await user.api.patch(`/api/wallets/${wallet.id}`, { currency: "EUR" })).statusCode).toBe(200);
    const tx = await createTransaction(user, { walletId: wallet.id, amount: 10 });

    const currencyChange = await user.api.patch(`/api/wallets/${wallet.id}`, { currency: "USD" });
    expect(currencyChange.json().code).toBe("WALLET_HAS_MOVEMENTS");

    const blocked = await user.api.delete(`/api/wallets/${wallet.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "WALLET_NOT_EMPTY", details: { transactions: 1, transfers: 0 } });

    await user.api.delete(`/api/transactions/${tx.id}`);
    expect((await user.api.delete(`/api/wallets/${wallet.id}`)).statusCode).toBe(204);
    expect((await user.api.get(`/api/wallets/${wallet.id}`)).statusCode).toBe(404);
  });

  it("mantém exatamente uma carteira padrão", async () => {
    const user = await registerUser(ctx.app);
    const second = (await user.api.post("/api/wallets", { name: "Nova padrão", isDefault: true })).json();
    expect(second.isDefault).toBe(true);
    const list = (await user.api.get("/api/wallets")).json().data;
    expect(list.filter((wallet: { isDefault: boolean }) => wallet.isDefault)).toHaveLength(1);

    // Transação sem carteira vai para a padrão.
    const tx = await createTransaction(user, { amount: 5 });
    expect(tx.wallet.id).toBe(second.id);

    // Excluir a padrão promove a mais antiga restante.
    await user.api.delete(`/api/transactions/${tx.id}`);
    await user.api.delete(`/api/wallets/${second.id}`);
    const after = (await user.api.get("/api/wallets")).json().data;
    expect(after[0]).toMatchObject({ id: user.defaultWalletId, isDefault: true });
  });

  it("isola os dados por usuário", async () => {
    const owner = await registerUser(ctx.app);
    const intruder = await registerUser(ctx.app);
    expect((await intruder.api.get(`/api/wallets/${owner.defaultWalletId}`)).statusCode).toBe(404);
    expect((await intruder.api.patch(`/api/wallets/${owner.defaultWalletId}`, { name: "x" })).statusCode).toBe(404);
    expect((await intruder.api.delete(`/api/wallets/${owner.defaultWalletId}`)).statusCode).toBe(404);
    const stolen = await intruder.api.post("/api/transactions", {
      type: "expense",
      amount: 1,
      description: "x",
      walletId: owner.defaultWalletId,
    });
    expect(stolen.statusCode).toBe(422);
    expect(await walletBalance(owner, owner.defaultWalletId)).toBe(0);
  });
});
