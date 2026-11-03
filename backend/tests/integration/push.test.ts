import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NotifyInput } from "../../src/modules/notifications/types/notification.types.js";
import { createTestApp, LONG_SESSIONS, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

describe("push pelo FCM: aparelhos, envio, token inválido e reenvio (R18)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp(LONG_SESSIONS);
  });

  beforeEach(() => {
    ctx.push.sent.length = 0;
    ctx.push.results.clear();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function notify(user: TestUser, overrides: Partial<NotifyInput> = {}) {
    const record = await ctx.container.services.notifications.notify({
      userId: user.id,
      kind: "budget_exceeded",
      title: "Orçamento ultrapassado",
      body: "Alimentação passou do orçamento do mês.",
      entityType: "budget",
      entityId: "00000000-0000-4000-8000-0000000000aa",
      dedupeKey: `push:${Math.random()}`,
      ...overrides,
    });
    await ctx.container.services.notifications.flush();
    return record!;
  }

  async function pushStatus(id: string) {
    const { rows } = await ctx.container.pool.query<{ push_status: string; push_attempts: number }>(
      "select push_status, push_attempts from notifications where id = $1",
      [id],
    );
    return rows[0];
  }

  it("registra o aparelho de forma idempotente e transfere o token para outro login", async () => {
    const user = await registerUser(ctx.app);
    const first = await user.api.post("/api/notifications/devices", { token: "token-a", deviceName: "Galaxy" });
    expect(first.statusCode).toBe(201);
    expect((await user.api.post("/api/notifications/devices", { token: "token-a" })).json().id).toBe(first.json().id);

    const other = await registerUser(ctx.app);
    await other.api.post("/api/notifications/devices", { token: "token-a" });
    await notify(user);
    expect(ctx.push.sent).toEqual([]);
    await notify(other);
    expect(ctx.push.sent.map((item) => item.token)).toEqual(["token-a"]);
  });

  it("envia título, texto e dados para cada aparelho ativo; sem aparelho fica 'skipped'", async () => {
    const user = await registerUser(ctx.app);
    const none = await notify(user);
    expect(await pushStatus(none.id)).toEqual({ push_status: "skipped", push_attempts: 0 });

    await user.api.post("/api/notifications/devices", { token: "token-b1" });
    await user.api.post("/api/notifications/devices", { token: "token-b2" });
    const record = await notify(user);
    expect(ctx.push.sent.map((item) => item.token).sort()).toEqual(["token-b1", "token-b2"]);
    expect(ctx.push.sent[0]!.message).toEqual({
      title: "Orçamento ultrapassado",
      body: "Alimentação passou do orçamento do mês.",
      data: { notificationId: record.id, kind: "budget_exceeded", entityType: "budget", entityId: "00000000-0000-4000-8000-0000000000aa" },
    });
    expect(await pushStatus(record.id)).toEqual({ push_status: "sent", push_attempts: 1 });
  });

  it("token recusado pelo FCM é revogado; sair do aparelho para de enviar", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/notifications/devices", { token: "token-velho" });
    ctx.push.results.set("token-velho", "invalid_token");
    const record = await notify(user);
    expect(await pushStatus(record.id)).toMatchObject({ push_status: "skipped" });
    ctx.push.results.clear();
    await notify(user);
    expect(ctx.push.sent).toEqual([]);

    const device = (await user.api.post("/api/notifications/devices", { token: "token-novo" })).json();
    expect((await user.api.delete(`/api/notifications/devices/${device.id}`)).statusCode).toBe(204);
    expect((await user.api.delete(`/api/notifications/devices/${device.id}`)).statusCode).toBe(404);
    await notify(user);
    expect(ctx.push.sent).toEqual([]);
  });

  it("falha temporária fica pendente e é reenviada pela tarefa agendada, até 3 tentativas", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/notifications/devices", { token: "token-instavel" });
    ctx.push.results.set("token-instavel", "failed");
    const record = await notify(user);
    expect(await pushStatus(record.id)).toEqual({ push_status: "pending", push_attempts: 1 });

    const notifications = ctx.container.services.notifications;
    ctx.clock.advanceMinutes(2);
    await notifications.retryPending(ctx.clock.now());
    expect(await pushStatus(record.id)).toEqual({ push_status: "pending", push_attempts: 2 });
    ctx.clock.advanceMinutes(2);
    await notifications.retryPending(ctx.clock.now());
    expect(await pushStatus(record.id)).toEqual({ push_status: "failed", push_attempts: 3 });

    const other = await notify(user);
    ctx.push.results.clear();
    ctx.clock.advanceMinutes(2);
    await ctx.container.services.jobs.runOnce();
    expect(await pushStatus(other.id)).toEqual({ push_status: "sent", push_attempts: 2 });
  });

  it("alertas respeitam 'avisos por push'; a notificação continua na caixa", async () => {
    const user = await registerUser(ctx.app);
    await user.api.post("/api/notifications/devices", { token: "token-silencioso" });
    await user.api.patch("/api/notifications/settings", { alertsPushEnabled: false });
    const alert = await notify(user);
    expect(ctx.push.sent).toEqual([]);
    expect(await pushStatus(alert.id)).toMatchObject({ push_status: "skipped" });
    expect((await user.api.get("/api/notifications/unread-count")).json().count).toBe(1);

    // Lembretes não dependem dessa preferência.
    await notify(user, { kind: "daily_reminder", title: "Registrou seus gastos de hoje?", body: "Toque para anotar." });
    expect(ctx.push.sent).toHaveLength(1);
  });
});
