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

describe("lembretes agendados: registro diário e prazo das metas (R18)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function runJobsAt(isoInstant: string) {
    ctx.clock.setTo(new Date(isoInstant));
    await ctx.container.services.jobs.runOnce();
    await ctx.container.services.notifications.flush();
  }

  async function kinds(user: TestUser, kind: string) {
    const data = (await user.api.get("/api/notifications?limit=50")).json().data as Array<{ kind: string; body: string }>;
    return data.filter((n) => n.kind === kind);
  }

  it("lembrete diário a partir das 20h no fuso do usuário, um por dia, só sem transação no dia e com aparelho", async () => {
    // Usuários criados de manhã (10/03, 9h em São Paulo).
    ctx.clock.setTo(new Date("2026-03-10T12:00:00Z"));
    const idle = await registerUser(ctx.app);
    const busy = await registerUser(ctx.app);
    const noDevice = await registerUser(ctx.app);
    const optedOut = await registerUser(ctx.app);
    const lisbon = await registerUser(ctx.app);
    for (const user of [idle, busy, optedOut, lisbon]) {
      await user.api.post("/api/notifications/devices", { token: `token-${user.username}` });
    }
    await optedOut.api.patch("/api/notifications/settings", { dailyReminderEnabled: false });
    await lisbon.api.patch("/api/users/me", { timezone: "Europe/Lisbon" });
    await createTransaction(busy, { amount: 10 });

    await runJobsAt("2026-03-10T22:59:00Z"); // 19h59 em São Paulo, 22h59 em Lisboa
    expect(await kinds(idle, "daily_reminder")).toEqual([]);
    expect(await kinds(lisbon, "daily_reminder")).toHaveLength(1);

    await runJobsAt("2026-03-10T23:00:00Z"); // 20h em São Paulo
    expect(await kinds(idle, "daily_reminder")).toEqual([
      expect.objectContaining({ body: "Toque para anotar as despesas do dia." }),
    ]);
    expect(await kinds(busy, "daily_reminder")).toEqual([]);
    expect(await kinds(noDevice, "daily_reminder")).toEqual([]);
    expect(await kinds(optedOut, "daily_reminder")).toEqual([]);

    await runJobsAt("2026-03-10T23:30:00Z");
    expect(await kinds(idle, "daily_reminder")).toHaveLength(1);
    expect(ctx.push.sent.filter((item) => item.token === `token-${idle.username}`)).toHaveLength(1);

    await runJobsAt("2026-03-11T23:05:00Z"); // dia seguinte, 20h05
    expect(await kinds(idle, "daily_reminder")).toHaveLength(2);
  });

  it("prazo de metas: 7 dias e 1 dia antes, uma vez cada; atingida, cancelada ou preferência desligada não avisam", async () => {
    ctx.clock.setTo(new Date("2026-04-01T12:00:00Z"));
    const user = await registerUser(ctx.app);
    const quiet = await registerUser(ctx.app);
    await quiet.api.patch("/api/notifications/settings", { goalRemindersEnabled: false });
    const goal = (name: string, deadline: string, owner = user) =>
      owner.api.post("/api/goals", { name, targetAmount: 100, deadline, categoryId: PREDEFINED.leisure }).then((r) => r.json());

    const week = await goal("Viagem", "2026-04-08");
    const tomorrow = await goal("Fone", "2026-04-02");
    const cancelled = await goal("Cancelada", "2026-04-08");
    await user.api.delete(`/api/goals/${cancelled.id}`);
    await goal("Silenciosa", "2026-04-08", quiet);

    await runJobsAt("2026-04-01T13:00:00Z");
    await runJobsAt("2026-04-01T14:00:00Z");
    const reminders = await kinds(user, "goal_deadline");
    expect(reminders.map((n) => n.body).sort()).toEqual(["A meta “Fone” vence amanhã.", "Faltam 7 dias para a meta “Viagem”."]);
    expect(await kinds(quiet, "goal_deadline")).toEqual([]);
    expect(week.id).toBeDefined();
    expect(tomorrow.id).toBeDefined();

    // Seis dias depois, "Viagem" vence amanhã: segundo aviso dela.
    await runJobsAt("2026-04-07T13:00:00Z");
    expect((await kinds(user, "goal_deadline")).filter((n) => n.body.includes("Viagem"))).toHaveLength(2);
  });
});
