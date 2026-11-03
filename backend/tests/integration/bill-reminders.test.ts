import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, LONG_SESSIONS, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("lembretes de contas fixas (R34)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
    ctx.clock.setTo(new Date("2026-01-20T15:00:00Z"));
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function billNotifications(user: TestUser) {
    await ctx.container.services.notifications.flush();
    const data = (await user.api.get("/api/notifications?limit=50")).json().data as Array<{ kind: string; body: string }>;
    return data.filter((n) => n.kind === "bill_reminder").map((n) => n.body);
  }

  it("cria, lista, altera, pausa e exclui; valida os campos e a posse", async () => {
    const user = await registerUser(ctx.app);
    const created = await user.api.post("/api/reminders", { title: "Aluguel", nextDueDate: "2026-01-31", frequency: "monthly", amount: 1500 });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      title: "Aluguel",
      amount: 1500,
      currency: "BRL",
      frequency: "monthly",
      nextDueDate: "2026-01-31",
      seriesId: null,
      active: true,
    });

    const missing = await user.api.post("/api/reminders", { amount: 10 });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().details.map((d: { path: string }) => d.path).sort()).toEqual(["frequency", "nextDueDate", "title"]);

    const id = created.json().id;
    expect((await user.api.patch(`/api/reminders/${id}`, { active: false, amount: null })).json()).toMatchObject({
      active: false,
      amount: null,
      currency: null,
    });
    const other = await registerUser(ctx.app);
    expect((await other.api.patch(`/api/reminders/${id}`, { active: true })).statusCode).toBe(404);
    expect((await user.api.get("/api/reminders")).json().data).toHaveLength(1);
    expect((await user.api.delete(`/api/reminders/${id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/reminders")).json().data).toEqual([]);
  });

  it("nasce de uma despesa recorrente; receita recorrente é recusada", async () => {
    const user = await registerUser(ctx.app);
    const rent = (
      await user.api.post("/api/series/recurring", { type: "expense", amount: 1200, description: "Aluguel do apartamento", frequency: "monthly", date: "2026-02-05" })
    ).json();
    const fromSeries = await user.api.post("/api/reminders", { seriesId: rent.series.id });
    expect(fromSeries.json()).toMatchObject({
      title: "Aluguel do apartamento",
      nextDueDate: "2026-02-05",
      frequency: "monthly",
      seriesId: rent.series.id,
    });
    const salary = (
      await user.api.post("/api/series/recurring", { type: "income", amount: 5000, description: "Salário", frequency: "monthly", date: "2026-02-05" })
    ).json();
    const invalid = await user.api.post("/api/reminders", { seriesId: salary.series.id });
    expect(invalid.json()).toMatchObject({ code: "INVALID_SERIES", details: [{ path: "seriesId" }] });
  });

  it("avisa às 9h do dia do vencimento, uma vez, e avança mantendo o dia original; pausado e preferência desligada não avisam", async () => {
    const user = await registerUser(ctx.app);
    const paused = await registerUser(ctx.app);
    const optedOut = await registerUser(ctx.app);
    await user.api.post("/api/reminders", { title: "Aluguel", nextDueDate: "2026-01-31", frequency: "monthly" });
    const pausedReminder = (await paused.api.post("/api/reminders", { title: "Escola", nextDueDate: "2026-01-31", frequency: "monthly" })).json();
    await paused.api.patch(`/api/reminders/${pausedReminder.id}`, { active: false });
    await optedOut.api.patch("/api/notifications/settings", { billRemindersEnabled: false });
    await optedOut.api.post("/api/reminders", { title: "Internet", nextDueDate: "2026-01-31", frequency: "monthly" });
    const run = async (instant: string) => {
      ctx.clock.setTo(new Date(instant));
      await ctx.container.services.jobs.runOnce();
    };

    await run("2026-01-31T11:59:00Z"); // 8h59 em São Paulo
    expect(await billNotifications(user)).toEqual([]);

    await run("2026-01-31T12:00:00Z"); // 9h
    await run("2026-01-31T13:00:00Z");
    expect(await billNotifications(user)).toEqual(["Hoje vence: Aluguel."]);
    expect((await user.api.get("/api/reminders")).json().data[0]).toMatchObject({ nextDueDate: "2026-02-28", lastNotifiedOn: "2026-01-31" });

    await run("2026-02-28T12:30:00Z");
    expect(await billNotifications(user)).toHaveLength(2);
    expect((await user.api.get("/api/reminders")).json().data[0].nextDueDate).toBe("2026-03-31");

    expect(await billNotifications(paused)).toEqual([]);
    expect(await billNotifications(optedOut)).toEqual([]);
    expect((await optedOut.api.get("/api/reminders")).json().data[0].nextDueDate).toBe("2026-03-31");
  });
});
