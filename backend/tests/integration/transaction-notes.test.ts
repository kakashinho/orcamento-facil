import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, registerUser, type TestContext } from "./support/test-app.js";

describe("notas nas transações (R57)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function storedNotes(transactionId: string): Promise<Buffer | null> {
    const { rows } = await ctx.container.pool.query<{ notes: Buffer | null }>("select notes from transactions where id = $1", [
      transactionId,
    ]);
    return rows[0]!.notes;
  }

  it("cria, lê, edita e apaga a nota; sem nota responde null", async () => {
    const user = await registerUser(ctx.app);
    const plain = await createTransaction(user, { amount: 10 });
    expect(plain.notes).toBeNull();

    const tx = await createTransaction(user, { amount: 25, notes: "  Dividido com a Ana  " });
    expect(tx.notes).toBe("Dividido com a Ana");
    expect((await user.api.get(`/api/transactions/${tx.id}`)).json().notes).toBe("Dividido com a Ana");

    const edited = await user.api.patch(`/api/transactions/${tx.id}`, { notes: "Pago no Pix" });
    expect(edited.json().notes).toBe("Pago no Pix");
    expect((await user.api.patch(`/api/transactions/${tx.id}`, { notes: "   " })).json().notes).toBeNull();
    await user.api.patch(`/api/transactions/${tx.id}`, { notes: "De novo" });
    expect((await user.api.patch(`/api/transactions/${tx.id}`, { notes: null })).json().notes).toBeNull();
  });

  it("nota com mais de 1000 caracteres é recusada apontando o campo", async () => {
    const user = await registerUser(ctx.app);
    const response = await user.api.post("/api/transactions", {
      type: "expense",
      amount: 1,
      description: "x",
      notes: "a".repeat(1001),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().details).toEqual([
      { location: "body", path: "notes", message: "Use no máximo 1000 caracteres." },
    ]);
  });

  it("no banco a nota é cifrada; ciphertext copiado de outra transação não é lido", async () => {
    const user = await registerUser(ctx.app);
    const a = await createTransaction(user, { amount: 1, notes: "Segredo da nota A" });
    const b = await createTransaction(user, { amount: 1, notes: "Nota B" });
    const raw = await storedNotes(a.id);
    expect(raw).toBeInstanceOf(Buffer);
    expect(raw!.toString("utf8")).not.toContain("Segredo");

    await ctx.container.pool.query("update transactions set notes = $1 where id = $2", [raw, b.id]);
    expect((await user.api.get(`/api/transactions/${b.id}`)).statusCode).toBe(500);
  });

  it("duplicar copia a nota; a busca por texto não olha a nota", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 30, description: "Mercado", notes: "palavraescondida" });
    const copy = (await user.api.post(`/api/transactions/${tx.id}/duplicate`, {})).json();
    expect(copy.notes).toBe("palavraescondida");
    expect((await user.api.get("/api/transactions?q=palavraescondida")).json().data).toEqual([]);
  });

  it("desfazer a edição da nota devolve a anterior; snapshot antigo sem nota mantém a atual", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 5, description: "Café", notes: "Primeira" });
    await user.api.patch(`/api/transactions/${tx.id}`, { notes: "Segunda" });
    expect((await user.api.post("/api/history/undo")).statusCode).toBe(200);
    expect((await user.api.get(`/api/transactions/${tx.id}`)).json().notes).toBe("Primeira");

    // Entrada de histórico gravada antes da versão com notas: o estado anterior não tem `notes`.
    const { services, db } = ctx.container;
    const legacyBefore = {
      walletId: user.defaultWalletId,
      type: "expense",
      amountCents: 500,
      date: tx.date,
      description: "Café antigo",
      categoryId: null,
      archived: false,
      tagIds: [],
    };
    await db.transaction((dbTx) => services.transactions.revertUpdate(dbTx, user.id, tx.id, legacyBefore));
    const after = (await user.api.get(`/api/transactions/${tx.id}`)).json();
    expect(after.description).toBe("Café antigo");
    expect(after.notes).toBe("Primeira");
  });
});
