import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiClient, createTestApp, createTransaction, PASSWORD, registerUser, type TestContext, unique } from "./support/test-app.js";

describe("limpeza periódica de dados vencidos (R85, R83)", () => {
  let ctx: TestContext;
  const adminEmail = `${unique("admin")}@teste.com`;

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: adminEmail });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const login = async (email: string) =>
    (await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } })).json();

  it("remove sessões expiradas e histórico além da retenção, sem afetar o que ainda vale", async () => {
    await registerUser(ctx.app, { email: adminEmail });
    const user = await registerUser(ctx.app);
    await createTransaction(user, { amount: 10 });
    await ctx.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: user.refreshToken } });

    // 31 dias depois: os refresh tokens (30 dias) venceram e o histórico passou da retenção (30 dias).
    ctx.clock.advance(31 * 86_400_000);
    const admin = apiClient(ctx.app, (await login(adminEmail)).tokens.accessToken);

    const forbidden = await apiClient(ctx.app, (await login(user.email)).tokens.accessToken).post("/api/admin/housekeeping");
    expect(forbidden.statusCode).toBe(403);

    const first = await admin.post("/api/admin/housekeeping");
    expect(first.statusCode).toBe(200);
    const removed = Object.fromEntries(
      first.json().results.map((result: { task: string; removed: number; failed: boolean }) => {
        expect(result.failed).toBe(false);
        return [result.task, result.removed];
      }),
    );
    expect(removed.auth).toBeGreaterThanOrEqual(3);
    expect(removed.history).toBeGreaterThanOrEqual(1);
    expect(removed.logs).toBe(0);

    // Idempotente, e quem tem sessão válida continua entrando.
    const second = (await admin.post("/api/admin/housekeeping")).json();
    expect(second.results.find((result: { task: string }) => result.task === "auth").removed).toBe(0);
    expect((await admin.get("/api/users/me")).statusCode).toBe(200);
  });
});
