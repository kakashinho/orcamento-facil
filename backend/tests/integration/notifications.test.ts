import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NotifyInput } from "../../src/modules/notifications/types/notification.types.js";
import { createTestApp, LONG_SESSIONS, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("caixa de notificações e preferências (R22, R18, R34)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
  });

  afterAll(async () => {
    await ctx.close();
  });

  function notify(user: TestUser, overrides: Partial<NotifyInput> = {}) {
    return ctx.container.services.notifications.notify({
      userId: user.id,
      kind: "budget_warning",
      title: "Orçamento quase no limite",
      body: "Alimentação chegou a 80% do orçamento do mês.",
      entityType: "budget",
      entityId: "00000000-0000-4000-8000-0000000000aa",
      data: { month: "2026-11", percent: 80 },
      dedupeKey: `teste:${Math.random()}`,
      ...overrides,
    });
  }

  it("mesma chave não duplica o aviso", async () => {
    const user = await registerUser(ctx.app);
    const first = await notify(user, { dedupeKey: "budget:x:2026-11:80" });
    const second = await notify(user, { dedupeKey: "budget:x:2026-11:80" });
    expect(first).toBeDefined();
    expect(second).toBeUndefined();
    expect((await user.api.get("/api/notifications/unread-count")).json()).toEqual({ count: 1 });
    // Outro usuário pode ter a mesma chave.
    const other = await registerUser(ctx.app);
    expect(await notify(other, { dedupeKey: "budget:x:2026-11:80" })).toBeDefined();
  });

  it("lista paginada, filtro de não lidas, marcar uma e todas como lidas", async () => {
    const user = await registerUser(ctx.app);
    for (let index = 0; index < 23; index += 1) await notify(user, { title: `Aviso ${index}` });

    const first = (await user.api.get("/api/notifications")).json();
    expect(first.data).toHaveLength(20);
    expect(first.data[0]).toMatchObject({
      title: "Aviso 22",
      kind: "budget_warning",
      entityType: "budget",
      data: { month: "2026-11", percent: 80 },
      readAt: null,
    });
    const second = (await user.api.get(`/api/notifications?cursor=${first.nextCursor}`)).json();
    expect(second.data.map((n: { title: string }) => n.title)).toEqual(["Aviso 2", "Aviso 1", "Aviso 0"]);
    expect(second.nextCursor).toBeNull();

    const read = await user.api.post(`/api/notifications/${first.data[0].id}/read`);
    expect(read.statusCode).toBe(200);
    expect(read.json().readAt).not.toBeNull();
    expect((await user.api.get("/api/notifications?unread=true&limit=50")).json().data).toHaveLength(22);

    const other = await registerUser(ctx.app);
    expect((await other.api.post(`/api/notifications/${first.data[1].id}/read`)).statusCode).toBe(404);

    expect((await user.api.post("/api/notifications/read-all")).json()).toEqual({ updated: 22 });
    expect((await user.api.get("/api/notifications/unread-count")).json()).toEqual({ count: 0 });
  });

  it("preferências: padrões, alteração parcial e validação", async () => {
    const user = await registerUser(ctx.app);
    expect((await user.api.get("/api/notifications/settings")).json()).toEqual({
      dailyReminderEnabled: true,
      dailyReminderHour: 20,
      goalRemindersEnabled: true,
      billRemindersEnabled: true,
      alertsPushEnabled: true,
    });
    const updated = await user.api.patch("/api/notifications/settings", { dailyReminderHour: 21, alertsPushEnabled: false });
    expect(updated.json()).toMatchObject({ dailyReminderHour: 21, alertsPushEnabled: false, dailyReminderEnabled: true });
    expect((await user.api.get("/api/notifications/settings")).json().dailyReminderHour).toBe(21);

    expect((await user.api.patch("/api/notifications/settings", { dailyReminderHour: 24 })).statusCode).toBe(400);
    expect((await user.api.patch("/api/notifications/settings", {})).statusCode).toBe(400);
  });

  it("tela inicial traz a contagem de não lidas", async () => {
    const user = await registerUser(ctx.app);
    await notify(user);
    await notify(user);
    expect((await user.api.get("/api/reports/overview")).json().unreadNotifications).toBe(2);
  });

  it("limpeza: lidas somem depois de 90 dias, não lidas depois de 180", async () => {
    const user = await registerUser(ctx.app);
    const read = await notify(user, { title: "Lida" });
    await notify(user, { title: "Não lida" });
    await user.api.post(`/api/notifications/${read!.id}/read`);
    const { housekeeping, notifications } = ctx.container.services;

    ctx.clock.advance(91 * 86_400_000);
    await housekeeping.run();
    const after90 = await notifications.list(user.id, { unread: "false", limit: 50 });
    expect(after90.data.map((n) => n.title)).toEqual(["Não lida"]);

    ctx.clock.advance(90 * 86_400_000);
    await housekeeping.run();
    expect(await notifications.countUnread(user.id)).toBe(0);
  });
});
