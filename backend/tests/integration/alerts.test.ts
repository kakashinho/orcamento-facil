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

interface NotificationDto {
  kind: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
}

describe("alertas de risco (R22, R74, R67)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
    ctx.clock.setTo(new Date("2026-03-10T15:00:00Z"));
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function inbox(user: TestUser): Promise<NotificationDto[]> {
    await ctx.container.events.idle();
    return (await user.api.get("/api/notifications?limit=50")).json().data;
  }

  const kinds = (list: NotificationDto[]) => list.map((n) => n.kind).sort();

  it("orçamento mensal: avisa em 80% e ao passar de 100%, uma vez cada", async () => {
    const user = await registerUser(ctx.app);
    const budget = (await user.api.post("/api/budgets", { categoryId: PREDEFINED.food, period: "monthly", amount: 100 })).json();

    await createTransaction(user, { amount: 70, categoryId: PREDEFINED.food, date: "2026-03-02" });
    expect(await inbox(user)).toEqual([]);

    await createTransaction(user, { amount: 15, categoryId: PREDEFINED.food, date: "2026-03-03" });
    const warning = await inbox(user);
    expect(warning).toEqual([
      expect.objectContaining({
        kind: "budget_warning",
        title: "Orçamento quase no limite",
        body: "Alimentação chegou a 80% do orçamento do mês.",
        entityType: "budget",
        entityId: budget.id,
      }),
    ]);

    await createTransaction(user, { amount: 20, categoryId: PREDEFINED.food, date: "2026-03-04" });
    await createTransaction(user, { amount: 5, categoryId: PREDEFINED.food, date: "2026-03-05" });
    const after = await inbox(user);
    expect(kinds(after)).toEqual(["budget_exceeded", "budget_warning"]);
    expect(after.find((n) => n.kind === "budget_exceeded")!.body).toBe("Alimentação passou do orçamento do mês.");

    // Nenhum texto carrega valores em dinheiro (ADR-S2-005).
    for (const notification of after) expect(`${notification.title} ${notification.body}`).not.toMatch(/R\$|\d+,\d{2}/);
  });

  it("orçamento criado já estourado avisa; excluir despesa e desfazer não geram avisos novos", async () => {
    const user = await registerUser(ctx.app);
    const tx = await createTransaction(user, { amount: 300, categoryId: PREDEFINED.transport, date: "2026-03-02" });
    await user.api.post("/api/budgets", { categoryId: PREDEFINED.transport, period: "monthly", amount: 200 });
    expect(kinds(await inbox(user))).toEqual(["budget_exceeded", "budget_warning"]);

    await user.api.delete(`/api/transactions/${tx.id}`);
    await user.api.post("/api/history/undo");
    expect(await inbox(user)).toHaveLength(2);
  });

  it("limite diário: um aviso por dia, no fuso do usuário", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/budgets", { categoryId: PREDEFINED.leisure, period: "daily", amount: 10 });
    await createTransaction(user, { amount: 12, categoryId: PREDEFINED.leisure, date: "2026-03-10" });
    await createTransaction(user, { amount: 3, categoryId: PREDEFINED.leisure, date: "2026-03-10" });
    const today = await inbox(user);
    expect(today).toEqual([
      expect.objectContaining({ kind: "daily_limit_exceeded", body: "Lazer passou do limite de hoje." }),
    ]);

    ctx.clock.advance(86_400_000); // 11/03
    await createTransaction(user, { amount: 11, categoryId: PREDEFINED.leisure, date: "2026-03-11" });
    expect((await inbox(user)).filter((n) => n.kind === "daily_limit_exceeded")).toHaveLength(2);
  });

  it("meta de redução ultrapassada avisa uma vez no mês", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 300, categoryId: PREDEFINED.health, date: "2026-02-05" });
    await user.api.post("/api/reduction-goals", { categoryId: PREDEFINED.health, percent: 10 }); // alvo 90
    await createTransaction(user, { amount: 80, categoryId: PREDEFINED.health, date: "2026-03-05" });
    expect(await inbox(user)).toEqual([]);
    await createTransaction(user, { amount: 20, categoryId: PREDEFINED.health, date: "2026-03-06" });
    await createTransaction(user, { amount: 20, categoryId: PREDEFINED.health, date: "2026-03-07" });
    expect(await inbox(user)).toEqual([
      expect.objectContaining({
        kind: "reduction_exceeded",
        entityType: "reduction_goal",
        body: "O gasto com Saúde passou da meta de redução deste mês.",
      }),
    ]);
  });

  it("sem orçamento nem meta, registrar despesas não gera avisos", async () => {
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 5000, categoryId: PREDEFINED.food });
    expect(await inbox(user)).toEqual([]);
  });
});
