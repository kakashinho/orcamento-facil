import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, PREDEFINED, registerUser, type TestContext } from "./support/test-app.js";

const OTHER = "00000000-0000-4000-8000-000000000008";

describe("categorias com tipo: coerência entre categoria e transação (R07, R08, R44)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it("predefinidas têm tipo; o filtro ?type= monta o seletor do formulário", async () => {
    const user = await registerUser(ctx.app);
    const all = (await user.api.get("/api/categories")).json().data;
    const byName = new Map(all.map((category: { name: string; type: string | null }) => [category.name, category.type]));
    expect(byName.get("Alimentação")).toBe("expense");
    expect(byName.get("Salário")).toBe("income");
    expect(byName.get("Outros")).toBeNull();

    const income = (await user.api.get("/api/categories?type=income")).json().data.map((c: { name: string }) => c.name);
    expect(income).toEqual(expect.arrayContaining(["Salário", "Outros"]));
    expect(income).not.toContain("Alimentação");
    const expense = (await user.api.get("/api/categories?type=expense")).json().data.map((c: { name: string }) => c.name);
    expect(expense).toEqual(expect.arrayContaining(["Alimentação", "Outros"]));
    expect(expense).not.toContain("Salário");
  });

  it("transação só aceita categoria compatível com o tipo", async () => {
    const user = await registerUser(ctx.app);
    const mismatch = await user.api.post("/api/transactions", {
      type: "expense",
      amount: 10,
      description: "Mercado",
      categoryId: PREDEFINED.salary,
    });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json()).toEqual({
      statusCode: 422,
      code: "CATEGORY_TYPE_MISMATCH",
      message: 'A categoria "Salário" é de receitas e não pode ser usada em uma despesa.',
      details: [
        {
          location: "body",
          path: "categoryId",
          message: 'A categoria "Salário" é de receitas e não pode ser usada em uma despesa.',
        },
      ],
    });
    // "Outros" (sem tipo) serve para os dois.
    expect((await user.api.post("/api/transactions", { type: "income", amount: 1, description: "Pix", categoryId: OTHER })).statusCode).toBe(201);
    expect((await user.api.post("/api/transactions", { type: "expense", amount: 1, description: "Taxa", categoryId: OTHER })).statusCode).toBe(201);
  });

  it("categoria personalizada com tipo; restringir o tipo exige que nenhuma transação do outro tipo a use", async () => {
    const user = await registerUser(ctx.app);
    const freela = await user.api.post("/api/categories", { name: "Freelas" });
    expect(freela.json()).toMatchObject({ name: "Freelas", type: null, predefined: false });
    const id = freela.json().id;
    await createTransaction(user, { type: "income", amount: 800, description: "Site", categoryId: id });

    const blocked = await user.api.patch(`/api/categories/${id}`, { type: "expense" });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "CATEGORY_TYPE_IN_USE", details: [{ path: "type" }] });

    const income = await user.api.patch(`/api/categories/${id}`, { type: "income" });
    expect(income.json()).toMatchObject({ type: "income" });
    const wrong = await user.api.post("/api/transactions", { type: "expense", amount: 5, description: "x", categoryId: id });
    expect(wrong.json().code).toBe("CATEGORY_TYPE_MISMATCH");

    const empty = await user.api.patch(`/api/categories/${id}`, {});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().details[0].message).toBe("Informe o nome ou o tipo da categoria.");
    expect((await user.api.patch(`/api/categories/${PREDEFINED.food}`, { name: "Comida" })).statusCode).toBe(403);
  });

  it("sugestões respeitam o tipo da transação (R44, R65)", async () => {
    const user = await registerUser(ctx.app);
    const asIncome = (await user.api.post("/api/categories/suggest", { description: "salário de outubro", type: "income" })).json();
    expect(asIncome.suggestions[0]).toMatchObject({ categoryId: PREDEFINED.salary });
    const asExpense = (await user.api.post("/api/categories/suggest", { description: "salário de outubro", type: "expense" })).json();
    expect(asExpense.suggestions.map((s: { categoryId: string }) => s.categoryId)).not.toContain(PREDEFINED.salary);

    const parsed = (await user.api.post("/api/transactions/parse", { text: "gastei 30 no mercado" })).json();
    expect(parsed.draft.type).toBe("expense");
    expect(parsed.suggestions[0]).toMatchObject({ categoryId: PREDEFINED.food });
  });
});
