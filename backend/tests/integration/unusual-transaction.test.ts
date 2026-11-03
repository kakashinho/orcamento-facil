import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, PREDEFINED, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("aviso de transação incomum (R47)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function unusual(user: TestUser) {
    await ctx.container.events.idle();
    return (await user.api.get("/api/notifications?limit=50")).json().data.filter((n: { kind: string }) => n.kind === "unusual_transaction");
  }

  async function history(user: TestUser, amounts: number[]) {
    for (const [index, amount] of amounts.entries()) {
      await createTransaction(user, { amount, categoryId: PREDEFINED.food, date: `2026-02-${String(index + 1).padStart(2, "0")}` });
    }
  }

  it("despesa muito acima do habitual da categoria avisa uma vez", async () => {
    const user = await registerUser(ctx.app);
    await history(user, [20, 20, 20, 20, 20]);
    expect(await unusual(user)).toEqual([]);

    const big = await createTransaction(user, { amount: 100, categoryId: PREDEFINED.food, date: "2026-02-20" });
    expect(await unusual(user)).toEqual([
      expect.objectContaining({
        title: "Despesa incomum",
        body: "Uma despesa em Alimentação ficou bem acima do seu gasto habitual.",
        entityType: "transaction",
        entityId: big.id,
      }),
    ]);
    // Editar não reavalia.
    await user.api.patch(`/api/transactions/${big.id}`, { amount: 150 });
    expect(await unusual(user)).toHaveLength(1);
  });

  it("não avisa com menos de 5 despesas anteriores nem quando o histórico é muito disperso", async () => {
    const few = await registerUser(ctx.app);
    await history(few, [20, 20, 20, 20]);
    await createTransaction(few, { amount: 500, categoryId: PREDEFINED.food, date: "2026-02-20" });
    expect(await unusual(few)).toEqual([]);

    const dispersed = await registerUser(ctx.app);
    await history(dispersed, [10, 10, 10, 90, 90]); // média 42, desvio ≈ 39,2
    await createTransaction(dispersed, { amount: 105, categoryId: PREDEFINED.food, date: "2026-02-20" });
    expect(await unusual(dispersed)).toEqual([]);
  });

  it("receitas e despesas sem categoria não são avaliadas", async () => {
    const user = await registerUser(ctx.app);
    await history(user, [20, 20, 20, 20, 20]);
    await createTransaction(user, { amount: 900, date: "2026-02-20" });
    await createTransaction(user, { type: "income", amount: 9000, date: "2026-02-20" });
    expect(await unusual(user)).toEqual([]);
  });
});
