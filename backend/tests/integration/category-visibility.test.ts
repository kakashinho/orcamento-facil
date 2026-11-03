import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, createTransaction, PREDEFINED, registerUser, type TestContext } from "./support/test-app.js";

describe("ocultar categorias dos relatórios (R46)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const visibility = (hiddenInReports: boolean) => ({ hiddenInReports });

  it("oculta e reexibe predefinida e personalizada, só para o usuário", async () => {
    const user = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const pets = (await user.api.post("/api/categories", { name: "Pets", type: "expense" })).json();

    const hidden = await user.api.put(`/api/categories/${PREDEFINED.food}/visibility`, visibility(true));
    expect(hidden.statusCode).toBe(200);
    expect(hidden.json()).toMatchObject({ id: PREDEFINED.food, hiddenInReports: true, predefined: true });
    expect((await user.api.put(`/api/categories/${pets.id}/visibility`, visibility(true))).json().hiddenInReports).toBe(true);

    const flags = async (api: typeof user.api) =>
      new Map((await api.get("/api/categories")).json().data.map((c: { id: string; hiddenInReports: boolean }) => [c.id, c.hiddenInReports]));
    const mine = await flags(user.api);
    expect(mine.get(PREDEFINED.food)).toBe(true);
    expect(mine.get(pets.id)).toBe(true);
    expect(mine.get(PREDEFINED.transport)).toBe(false);
    expect((await flags(other.api)).get(PREDEFINED.food)).toBe(false);

    await user.api.put(`/api/categories/${PREDEFINED.food}/visibility`, visibility(false));
    expect((await flags(user.api)).get(PREDEFINED.food)).toBe(false);
  });

  it("categoria de outro usuário ou inexistente → 404", async () => {
    const user = await registerUser(ctx.app);
    const other = await registerUser(ctx.app);
    const foreign = (await other.api.post("/api/categories", { name: "Privada" })).json();
    expect((await user.api.put(`/api/categories/${foreign.id}/visibility`, visibility(true))).statusCode).toBe(404);
    expect(
      (await user.api.put("/api/categories/00000000-0000-4000-8000-0000000000ff/visibility", visibility(true))).statusCode,
    ).toBe(404);
  });

  it("gráfico por categoria sem a oculta, percentuais recalculados; totais do mês intactos", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 300, categoryId: PREDEFINED.food, date: "2026-03-05" });
    await createTransaction(user, { amount: 100, categoryId: PREDEFINED.transport, date: "2026-03-06" });
    await createTransaction(user, { amount: 100, categoryId: PREDEFINED.leisure, date: "2026-03-07" });
    await createTransaction(user, { amount: 50, description: "Sem categoria", date: "2026-03-08" });
    const url = "/api/reports/by-category?from=2026-03-01&to=2026-03-31";

    const before = (await user.api.get(url)).json();
    expect(before.hidden).toEqual({ count: 0, convertedTotal: 0 });
    expect(before.convertedTotal).toBe(550);

    await user.api.put(`/api/categories/${PREDEFINED.food}/visibility`, visibility(true));
    const after = (await user.api.get(url)).json();
    const names = after.categories.map((row: { category: { name: string } | null }) => row.category?.name ?? null);
    expect(names).not.toContain("Alimentação");
    expect(names).toContain(null);
    expect(after.convertedTotal).toBe(250);
    expect(after.hidden).toEqual({ count: 1, convertedTotal: 300 });
    const shares = after.categories.reduce((sum: number, row: { share: number }) => sum + row.share, 0);
    expect(shares).toBeCloseTo(100, 1);

    const all = (await user.api.get(`${url}&includeHidden=true`)).json();
    expect(all.convertedTotal).toBe(550);
    expect(all.hidden.count).toBe(0);

    const overview = (await user.api.get("/api/reports/overview?month=2026-03")).json();
    expect(overview.topExpenseCategories.map((row: { category: { name: string } | null }) => row.category?.name)).not.toContain(
      "Alimentação",
    );
    expect(overview.monthSummary.converted.expense).toBe(550);
  });
});
