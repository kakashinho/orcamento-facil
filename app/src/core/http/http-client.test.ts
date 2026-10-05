import { apiError, createFakeApi } from "@/test-utils/fake-api";
import { ApiError, NETWORK_ERROR, TIMEOUT } from "./api-error";
import { buildQuery, createHttpClient, type SessionTokens } from "./http-client";

function sessionWith(token: string | null, renewed: string | null = "renewed"): SessionTokens & { refresh: jest.Mock } {
  return { getAccessToken: jest.fn(async () => token), refresh: jest.fn(async () => renewed) };
}

describe("buildQuery", () => {
  it("ignora filtros vazios e codifica valores", () => {
    expect(buildQuery({ q: "café da manhã", month: "2026-10", tag: "", cursor: undefined, limit: 20 })).toBe(
      "?q=caf%C3%A9%20da%20manh%C3%A3&month=2026-10&limit=20",
    );
    expect(buildQuery({})).toBe("");
  });
});

describe("createHttpClient", () => {
  it("envia JSON com o token JWT (R03)", async () => {
    const fake = createFakeApi().on("POST", "/api/transactions", { status: 201, body: { id: "1" } });
    const http = createHttpClient({
      baseUrl: "http://api.test/",
      fetch: fake.fetch as never,
      session: sessionWith("abc"),
    });
    await expect(http.post("/api/transactions", { amount: 10 })).resolves.toEqual({ id: "1" });
    const call = fake.lastCall("POST", "/api/transactions")!;
    expect(call.headers.authorization).toBe("Bearer abc");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.body).toEqual({ amount: 10 });
  });

  it("não define Accept-Encoding: o OkHttp compacta e descompacta sozinho (R86)", async () => {
    const fake = createFakeApi().on("GET", "/x", { body: {} });
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never });
    await http.get("/x");
    expect(fake.calls[0].headers["accept-encoding"]).toBeUndefined();
  });

  it("não envia token em rotas públicas", async () => {
    const fake = createFakeApi().on("POST", "/api/auth/login", { body: {} });
    const session = sessionWith("abc");
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never, session });
    await http.post("/api/auth/login", {}, { auth: false });
    expect(fake.calls[0].headers.authorization).toBeUndefined();
    expect(session.getAccessToken).not.toHaveBeenCalled();
  });

  it("renova a sessão uma vez com TOKEN_EXPIRED e repete a requisição (R87)", async () => {
    let first = true;
    const fake = createFakeApi().on("GET", "/api/wallets", () => {
      if (first) {
        first = false;
        return apiError(401, "TOKEN_EXPIRED", "O token de acesso expirou.");
      }
      return { body: { data: [] } };
    });
    const session = sessionWith("old", "new");
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never, session });
    await expect(http.get("/api/wallets")).resolves.toEqual({ data: [] });
    expect(session.refresh).toHaveBeenCalledTimes(1);
    expect(fake.calls).toHaveLength(2);
  });

  it("avisa sessão expirada quando a renovação falha", async () => {
    const fake = createFakeApi().on("GET", "/api/wallets", apiError(401, "TOKEN_EXPIRED", "expirou"));
    const onSessionExpired = jest.fn();
    const http = createHttpClient({
      baseUrl: "http://api.test",
      fetch: fake.fetch as never,
      session: sessionWith("old", null),
      onSessionExpired,
    });
    await expect(http.get("/api/wallets")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("encerra a sessão revogada sem tentar renovar", async () => {
    const fake = createFakeApi().on("GET", "/api/users/me", apiError(401, "SESSION_REVOKED", "Sessão encerrada."));
    const session = sessionWith("abc");
    const onSessionExpired = jest.fn();
    const http = createHttpClient({
      baseUrl: "http://api.test",
      fetch: fake.fetch as never,
      session,
      onSessionExpired,
    });
    await expect(http.get("/api/users/me")).rejects.toBeInstanceOf(ApiError);
    expect(session.refresh).not.toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalled();
  });

  it("informa o modo de manutenção (R72)", async () => {
    const fake = createFakeApi().on("POST", "/api/transactions", apiError(503, "MAINTENANCE_MODE", "Em manutenção."));
    const onMaintenance = jest.fn();
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never, onMaintenance });
    await expect(http.post("/api/transactions", {})).rejects.toMatchObject({ status: 503, code: "MAINTENANCE_MODE" });
    expect(onMaintenance).toHaveBeenCalledWith("Em manutenção.");
  });

  it("expõe os erros por campo de `details`", async () => {
    const fake = createFakeApi().on(
      "POST",
      "/api/transactions",
      apiError(400, "VALIDATION_ERROR", "Dados inválidos na requisição.", [
        { location: "body", path: "amount", message: "O valor deve ser maior que zero." },
        { location: "body", path: "date", message: "Data inválida." },
      ]),
    );
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never });
    const error = (await http.post("/api/transactions", {}).catch((e) => e)) as ApiError;
    expect(error.fieldErrors).toEqual({ amount: "O valor deve ser maior que zero.", date: "Data inválida." });
  });

  it("lê o tempo de bloqueio do login (R87)", async () => {
    const fake = createFakeApi().on("POST", "/api/auth/login", {
      ...apiError(423, "ACCOUNT_LOCKED", "Conta bloqueada", { retryAfterSeconds: 900 }),
      headers: { "retry-after": "900" },
    });
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never });
    const error = (await http.post("/api/auth/login", {}, { auth: false }).catch((e) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(900);
  });

  it("converte falha de rede em NETWORK_ERROR", async () => {
    const http = createHttpClient({
      baseUrl: "http://api.test",
      fetch: (async () => {
        throw new TypeError("Network request failed");
      }) as never,
    });
    await expect(http.get("/x")).rejects.toMatchObject({ status: 0, code: NETWORK_ERROR });
  });

  it("encerra requisições lentas com TIMEOUT", async () => {
    const http = createHttpClient({
      baseUrl: "http://api.test",
      timeoutMs: 10,
      fetch: ((_url: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))) as never,
    });
    await expect(http.get("/x")).rejects.toMatchObject({ code: TIMEOUT });
  });

  it("devolve undefined em 204", async () => {
    const fake = createFakeApi().on("DELETE", "/api/transactions/:id", { status: 204 });
    const http = createHttpClient({ baseUrl: "http://api.test", fetch: fake.fetch as never });
    await expect(http.delete("/api/transactions/1")).resolves.toBeUndefined();
  });

  it("monta URL e cabeçalho para downloads", async () => {
    const http = createHttpClient({ baseUrl: "http://api.test", session: sessionWith("tok") });
    expect(http.url("/api/reports/statement/pdf", { from: "2026-10-01", to: "2026-10-04" })).toBe(
      "http://api.test/api/reports/statement/pdf?from=2026-10-01&to=2026-10-04",
    );
    await expect(http.authHeaders()).resolves.toEqual({ Authorization: "Bearer tok" });
  });
});
