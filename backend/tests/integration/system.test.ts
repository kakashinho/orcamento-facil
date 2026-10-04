import { gunzipSync, gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiClient, createTestApp, createTransaction, PASSWORD, registerUser, type TestContext, type TestUser, unique } from "./support/test-app.js";

describe("sistema: manutenção (R72), logs (R85), compressão (R86) e saúde", () => {
  let ctx: TestContext;
  let admin: TestUser;
  const adminEmail = `${unique("admin")}@teste.com`;

  beforeAll(async () => {
    ctx = await createTestApp({ ADMIN_EMAILS: adminEmail });
    admin = await registerUser(ctx.app, { email: adminEmail });
  });

  afterAll(async () => {
    await admin.api.put("/api/admin/maintenance", { enabled: false });
    await ctx.close();
  });

  describe("modo de manutenção (R72)", () => {
    it("só administradores alteram o modo", async () => {
      const user = await registerUser(ctx.app);
      expect((await user.api.put("/api/admin/maintenance", { enabled: true })).statusCode).toBe(403);
      expect((await user.api.get("/api/admin/logs")).statusCode).toBe(403);
    });

    it("informa o usuário e bloqueia operações críticas, mantendo consultas e login", async () => {
      const user = await registerUser(ctx.app);
      const tx = await createTransaction(user, { amount: 10 });

      const enabled = await admin.api.put("/api/admin/maintenance", { enabled: true, message: "Atualização até 22h." });
      expect(enabled.json()).toMatchObject({ enabled: true, message: "Atualização até 22h.", forced: false });

      const status = (await ctx.app.inject({ method: "GET", url: "/api/system/status" })).json();
      expect(status.maintenance).toEqual({ enabled: true, message: "Atualização até 22h." });

      const blocked = await user.api.post("/api/transactions", { type: "expense", amount: 1, description: "x" });
      expect(blocked.statusCode).toBe(503);
      expect(blocked.json()).toMatchObject({ code: "MAINTENANCE_MODE", message: "Atualização até 22h." });
      expect(blocked.headers["retry-after"]).toBe("120");
      expect((await user.api.delete(`/api/transactions/${tx.id}`)).statusCode).toBe(503);
      expect(
        (await ctx.app.inject({ method: "POST", url: "/api/auth/register", payload: { email: "a@b.com", username: "abc", password: PASSWORD } }))
          .statusCode,
      ).toBe(503);

      expect((await user.api.get("/api/transactions")).statusCode).toBe(200);
      const login = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: user.email, password: PASSWORD } });
      expect(login.statusCode).toBe(200);

      await admin.api.put("/api/admin/maintenance", { enabled: false });
      expect((await user.api.post("/api/transactions", { type: "expense", amount: 1, description: "x" })).statusCode).toBe(201);
    });

    it("pode ser forçado por variável de ambiente durante o deploy", async () => {
      const forced = await createTestApp({ MAINTENANCE_MODE: "true" });
      try {
        const status = (await forced.app.inject({ method: "GET", url: "/api/system/status" })).json();
        expect(status.maintenance.enabled).toBe(true);
        expect(status.maintenance.message).toContain("manutenção");
        const attempt = await forced.app.inject({
          method: "POST",
          url: "/api/auth/password/forgot",
          payload: { email: "x@y.com" },
        });
        expect(attempt.statusCode).toBe(503);
      } finally {
        await forced.close();
      }
    });
  });

  describe("logs de eventos e erros (R85)", () => {
    it("registra eventos importantes de segurança sem dados sensíveis", async () => {
      const user = await registerUser(ctx.app);
      await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: user.email, password: "Errada@123" } });
      await ctx.container.eventLog.flush();

      const logs = (await admin.api.get("/api/admin/logs?event=auth.&limit=200")).json().data;
      const failed = logs.find((entry: { event: string; userId: string }) => entry.event === "auth.login_failed" && entry.userId === user.id);
      expect(failed).toMatchObject({ level: "warn", context: { reason: "wrong_password", attempts: 1 } });
      expect(JSON.stringify(logs)).not.toContain("Errada@123");
      expect(logs.some((entry: { event: string; userId: string }) => entry.event === "auth.registered" && entry.userId === user.id)).toBe(true);

      const warnings = (await admin.api.get("/api/admin/logs?level=warn")).json().data;
      expect(warnings.every((entry: { level: string }) => entry.level === "warn")).toBe(true);
    });

    it("health/ready confirma o acesso ao banco", async () => {
      const response = await ctx.app.inject({ method: "GET", url: "/health/ready" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", database: "up" });
    });
  });

  describe("compressão (R86)", () => {
    it("comprime respostas grandes conforme Accept-Encoding", async () => {
      const user = await registerUser(ctx.app);
      for (let index = 0; index < 15; index += 1) {
        await createTransaction(user, { amount: index + 1, description: `Compra número ${index} no supermercado do bairro` });
      }
      const plain = await user.api.get("/api/transactions?limit=50");
      const gzipped = await user.api.get("/api/transactions?limit=50", { "accept-encoding": "gzip" });
      expect(gzipped.headers["content-encoding"]).toBe("gzip");
      const decoded = gunzipSync(gzipped.rawPayload).toString();
      expect(JSON.parse(decoded)).toEqual(plain.json());
      expect(gzipped.rawPayload.length).toBeLessThan(plain.rawPayload.length / 3);

      const brotli = await user.api.get("/api/transactions?limit=50", { "accept-encoding": "br" });
      expect(brotli.headers["content-encoding"]).toBe("br");
    });

    it("aceita corpo de requisição comprimido (Content-Encoding: gzip)", async () => {
      const user = await registerUser(ctx.app);
      const body = gzipSync(JSON.stringify({ type: "expense", amount: 9.99, description: "Enviado comprimido" }));
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/transactions",
        headers: {
          authorization: `Bearer ${user.accessToken}`,
          "content-type": "application/json",
          "content-encoding": "gzip",
        },
        payload: body,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().description).toBe("Enviado comprimido");
    });
  });

  it("respostas da API não ficam em cache e trazem cabeçalhos de segurança", async () => {
    const response = await apiClient(ctx.app, admin.accessToken).get("/api/wallets");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
