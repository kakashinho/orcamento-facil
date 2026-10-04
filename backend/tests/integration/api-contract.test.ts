import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp, PASSWORD, registerUser, type TestContext, type TestUser, unique } from "./support/test-app.js";

/**
 * Contrato da API com o aplicativo: validação coerente com o contexto e erros no formato único
 * { statusCode, code, message, details? }, com `details` apontando cada campo.
 */
describe("contrato da API: validação e erros", () => {
  let ctx: TestContext;
  let user: TestUser;

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await registerUser(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const raw = (method: "GET" | "POST", url: string, payload: string, contentType: string) =>
    ctx.app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${user.accessToken}`, "content-type": contentType },
      payload,
    });

  describe("campos dos DTOs", () => {
    it("campo ausente é 'Campo obrigatório.', apontando cada campo", async () => {
      const response = await user.api.post("/api/transactions", {});
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR", message: "Dados inválidos na requisição." });
      expect(response.json().details).toEqual(
        expect.arrayContaining([
          { location: "body", path: "amount", message: "Campo obrigatório." },
          { location: "body", path: "description", message: "Campo obrigatório." },
        ]),
      );
    });

    it("campo desconhecido é erro, não é ignorado (ex.: categoryID no lugar de categoryId)", async () => {
      const response = await user.api.post("/api/transactions", {
        type: "expense",
        amount: 10,
        description: "Mercado",
        categoryID: "00000000-0000-4000-8000-000000000001",
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().details).toEqual([
        { location: "body", path: "categoryID", message: "Campo não reconhecido." },
      ]);
      const query = await user.api.get("/api/transactions?sortBy=amount");
      expect(query.json().details).toEqual([{ location: "querystring", path: "sortBy", message: "Campo não reconhecido." }]);
    });

    it("textos só com espaços são rejeitados; espaços das pontas são removidos", async () => {
      const blank = await user.api.post("/api/transactions", { type: "expense", amount: 10, description: "   " });
      expect(blank.json().details).toEqual([{ location: "body", path: "description", message: "Informe a descrição." }]);
      expect((await user.api.post("/api/tags", { name: "  " })).json().details[0]).toMatchObject({ path: "name" });
      expect((await user.api.post("/api/categories", { name: "\t" })).json().details[0]).toMatchObject({ path: "name" });

      const trimmed = await user.api.post("/api/transactions", { type: "expense", amount: 10, description: "  Feira  " });
      expect(trimmed.json().description).toBe("Feira");
    });

    it("valores: positivos, até duas casas decimais", async () => {
      const decimals = await user.api.post("/api/transactions", { type: "expense", amount: 1.234, description: "x" });
      expect(decimals.json().details).toEqual([
        { location: "body", path: "amount", message: "Use no máximo duas casas decimais." },
      ]);
      const negative = await user.api.post("/api/transactions", { type: "expense", amount: -5, description: "x" });
      expect(negative.json().details[0]).toMatchObject({ path: "amount", message: "O valor deve ser maior que zero." });
      const text = await user.api.post("/api/transactions", { type: "expense", amount: "10", description: "x" });
      expect(text.json().details[0].path).toBe("amount");
    });

    it("datas: formato, data real e ano plausível", async () => {
      const post = (date: string) => user.api.post("/api/transactions", { type: "expense", amount: 1, description: "x", date });
      expect((await post("04/10/2026")).json().details[0].message).toBe("Use o formato AAAA-MM-DD.");
      expect((await post("2026-02-30")).json().details[0].message).toBe("Data inválida.");
      expect((await post("0100-01-01")).json().details[0].message).toBe("Use uma data entre 1900 e 2100.");
    });

    it("período invertido em filtros é erro, não lista vazia", async () => {
      const response = await user.api.get("/api/transactions?from=2026-10-10&to=2026-10-01");
      expect(response.statusCode).toBe(400);
      expect(response.json().details).toEqual([
        { location: "querystring", path: "to", message: "A data final deve ser igual ou posterior à inicial." },
      ]);
    });

    it("enums dizem os valores aceitos", async () => {
      const response = await user.api.post("/api/transactions", { type: "gasto", amount: 1, description: "x" });
      expect(response.json().details).toEqual([
        { location: "body", path: "type", message: "Valor inválido. Use: income, expense." },
      ]);
    });

    it("identificador e cursor inválidos apontam o parâmetro", async () => {
      const id = await user.api.get("/api/transactions/123");
      expect(id.json().details).toEqual([{ location: "params", path: "id", message: "Identificador inválido." }]);
      const cursor = await user.api.get("/api/transactions?cursor=lixo");
      expect(cursor.json().details).toEqual([
        { location: "querystring", path: "cursor", message: "Cursor de paginação inválido. Recomece a listagem sem o cursor." },
      ]);
    });

    it("e-mail vindo do teclado do celular (espaço e maiúsculas) é normalizado", async () => {
      const username = unique("joana");
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: ` ${username.toUpperCase()}@Exemplo.COM `, username, password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().user.email).toBe(`${username}@exemplo.com`);
    });

    it("regras do service também apontam o campo (transferência e conflito de nome)", async () => {
      const same = await user.api.post("/api/transfers", {
        sourceWalletId: user.defaultWalletId,
        targetWalletId: user.defaultWalletId,
        amount: 10,
      });
      expect(same.json().details).toEqual([
        { location: "body", path: "targetWalletId", message: "Escolha uma carteira de destino diferente da origem." },
      ]);
      const missing = await user.api.post("/api/transactions", {
        type: "expense",
        amount: 1,
        description: "x",
        walletId: "00000000-0000-4000-8000-0000000000ff",
      });
      expect(missing.statusCode).toBe(422);
      expect(missing.json()).toMatchObject({ code: "INVALID_WALLET", details: [{ path: "walletId" }] });
    });
  });

  describe("formato da requisição", () => {
    it("JSON malformado → 400 INVALID_JSON, em português", async () => {
      const response = await raw("POST", "/api/transactions", "{oops", "application/json");
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        statusCode: 400,
        code: "INVALID_JSON",
        message: "O corpo da requisição não é um JSON válido.",
      });
    });

    it("texto puro → 415 UNSUPPORTED_MEDIA_TYPE", async () => {
      const response = await raw("POST", "/api/transactions", "gastei 10", "text/plain");
      expect(response.statusCode).toBe(415);
      expect(response.json().code).toBe("UNSUPPORTED_MEDIA_TYPE");
    });

    it("corpo vazio com Content-Type JSON vale como 'sem corpo' em rotas sem corpo", async () => {
      // Muitos clientes HTTP mandam o cabeçalho em todo POST; não deve virar erro 400.
      const fresh = await registerUser(ctx.app);
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/history/undo",
        headers: { authorization: `Bearer ${fresh.accessToken}`, "content-type": "application/json" },
        payload: "",
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("NOTHING_TO_UNDO");
      const needsBody = await raw("POST", "/api/transactions", "", "application/json");
      expect(needsBody.json().details).toEqual([
        { location: "body", message: "Envie os dados no corpo da requisição, em JSON." },
      ]);
    });

    it("rota inexistente responde no mesmo formato", async () => {
      const response = await user.api.get("/api/nao-existe");
      expect(response.json()).toEqual({
        statusCode: 404,
        code: "ROUTE_NOT_FOUND",
        message: "Rota GET /api/nao-existe não encontrada.",
      });
    });
  });

  describe("documentação (R88)", () => {
    it("o OpenAPI descreve as respostas de erro de cada rota", async () => {
      const spec = (await ctx.app.inject({ method: "GET", url: "/docs/json" })).json();
      const create = spec.paths["/api/transactions/"].post.responses;
      expect(Object.keys(create)).toEqual(expect.arrayContaining(["201", "400", "401", "409", "422", "503"]));
      expect(create["401"].description).toContain("TOKEN_EXPIRED");
      const login = spec.paths["/api/auth/login"].post.responses;
      expect(Object.keys(login)).toEqual(expect.arrayContaining(["200", "400", "401", "423", "429"]));
      expect(Object.keys(login)).not.toContain("503");
      const body = spec.paths["/api/transactions/"].post.requestBody.content["application/json"].schema;
      expect(body.additionalProperties).toBe(false);
    });
  });
});
