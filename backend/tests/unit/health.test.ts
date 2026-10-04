import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";
import { createContainer } from "../../src/container.js";
import type { App } from "../../src/http/types.js";
import { MemoryMailer } from "../../src/infra/mailer.js";
import { FakeExchangeRateProvider, testConfig } from "../helpers/test-config.js";

// Sem banco: o pool do pg só conecta na primeira consulta, e estas rotas não consultam.
describe("HTTP sem banco de dados", () => {
  let app: App;
  const container = createContainer(testConfig({ DATABASE_URL: "postgresql://nobody:nothing@127.0.0.1:1/none" }), {
    mailer: new MemoryMailer(),
    exchangeRateProvider: new FakeExchangeRateProvider(),
  });

  beforeAll(async () => {
    app = await buildApp(container);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await container.close();
  });

  it("GET /health responde 200 sem depender do banco", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("propaga um x-request-id válido recebido", async () => {
    const response = await app.inject({ method: "GET", url: "/health", headers: { "x-request-id": "abc-123" } });
    expect(response.headers["x-request-id"]).toBe("abc-123");
  });

  it("gera a especificação OpenAPI de todas as rotas (R88)", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    expect(response.statusCode).toBe(200);
    const spec = response.json();
    expect(spec.openapi).toBe("3.0.3");
    const paths = Object.keys(spec.paths);
    for (const path of [
      "/api/auth/register",
      "/api/auth/login",
      "/api/wallets/",
      "/api/transactions/",
      "/api/transactions/{id}/duplicate",
      "/api/transfers/",
      "/api/history/undo",
      "/api/reports/statement/pdf",
      "/api/reports/cash-flow",
      "/api/exchange-rates/convert",
      "/api/admin/maintenance",
    ]) {
      expect(paths).toContain(path);
    }
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("rota inexistente usa o formato padrão de erro", async () => {
    const response = await app.inject({ method: "GET", url: "/api/nao-existe" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ statusCode: 404, code: "ROUTE_NOT_FOUND" });
  });

  it("rota protegida sem token responde 401", async () => {
    const response = await app.inject({ method: "GET", url: "/api/wallets" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("token inválido responde 401 INVALID_TOKEN", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/transactions",
      headers: { authorization: "Bearer abc.def.ghi" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("valida o corpo da requisição antes de tocar no banco", async () => {
    // /login é isento da checagem de manutenção (que consulta o banco).
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "invalido", password: "" },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });
});
