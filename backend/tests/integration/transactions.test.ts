import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aad } from "../../src/infrastructure/crypto/field-cipher.js";
import { todayInTimeZone } from "../../src/shared/utils/dates.js";
import { TEST_DATABASE_URL } from "../helpers/test-config.js";
import {
  createTestApp,
  createTransaction,
  PREDEFINED,
  registerUser,
  type TestContext,
  type TestUser,
  walletBalance,
} from "./support/test-app.js";

describe("transações (R06–R12, R26, R43, R44, R48, R52, R65, R70, R81)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe("registro, edição e exclusão", () => {
    it("registra receita e despesa atualizando o saldo da carteira (R06)", async () => {
      const user = await registerUser(ctx.app);
      const income = await createTransaction(user, {
        type: "income",
        amount: 3000,
        description: "Salário",
        date: "2026-10-01",
        categoryId: PREDEFINED.salary,
      });
      expect(income).toMatchObject({
        type: "income",
        amount: 3000,
        currency: "BRL",
        date: "2026-10-01",
        description: "Salário",
        category: { id: PREDEFINED.salary, name: "Salário", predefined: true },
        archived: false,
      });
      await createTransaction(user, { amount: 35.9, description: "Mercado", categoryId: PREDEFINED.food });
      expect(await walletBalance(user, user.defaultWalletId)).toBe(2964.1);
    });

    it("usa a data de hoje quando omitida e rejeita valores inválidos", async () => {
      const user = await registerUser(ctx.app);
      const tx = await createTransaction(user, { amount: 10 });
      expect(tx.date).toBe(todayInTimeZone(ctx.clock.now(), "America/Sao_Paulo"));
      for (const amount of [0, -5, 1.234]) {
        const response = await user.api.post("/api/transactions", { type: "expense", amount, description: "x" });
        expect(response.statusCode).toBe(400);
      }
      expect((await user.api.post("/api/transactions", { type: "transfer", amount: 1, description: "x" })).statusCode).toBe(400);
      expect(
        (await user.api.post("/api/transactions", { type: "expense", amount: 1, description: "x", date: "2026-02-30" })).statusCode,
      ).toBe(400);
    });

    it("edita valor, tipo, categoria e carteira recompondo os saldos (R11)", async () => {
      const user = await registerUser(ctx.app);
      const other = (await user.api.post("/api/wallets", { name: "Banco" })).json();
      const tx = await createTransaction(user, { amount: 100, description: "Compra" });
      expect(await walletBalance(user, user.defaultWalletId)).toBe(-100);

      const edited = await user.api.patch(`/api/transactions/${tx.id}`, {
        amount: 80,
        walletId: other.id,
        categoryId: PREDEFINED.leisure,
        description: "Cinema",
      });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toMatchObject({ amount: 80, description: "Cinema", wallet: { id: other.id }, category: { name: "Lazer" } });
      expect(await walletBalance(user, user.defaultWalletId)).toBe(0);
      expect(await walletBalance(user, other.id)).toBe(-80);

      await user.api.patch(`/api/transactions/${tx.id}`, { type: "income" });
      expect(await walletBalance(user, other.id)).toBe(80);

      const cleared = (await user.api.patch(`/api/transactions/${tx.id}`, { categoryId: null })).json();
      expect(cleared.category).toBeNull();
    });

    it("exclui a transação e estorna o saldo (R12)", async () => {
      const user = await registerUser(ctx.app);
      const tx = await createTransaction(user, { amount: 50 });
      expect((await user.api.delete(`/api/transactions/${tx.id}`)).statusCode).toBe(204);
      expect((await user.api.get(`/api/transactions/${tx.id}`)).statusCode).toBe(404);
      expect((await user.api.delete(`/api/transactions/${tx.id}`)).statusCode).toBe(404);
      expect(await walletBalance(user, user.defaultWalletId)).toBe(0);
    });

    it("duplica com a data de hoje, mantendo valor, categoria e tags (R48)", async () => {
      const user = await registerUser(ctx.app);
      const original = await createTransaction(user, {
        amount: 12.5,
        description: "Café",
        date: "2026-09-01",
        categoryId: PREDEFINED.food,
        tags: ["trabalho"],
      });
      const copy = await user.api.post(`/api/transactions/${original.id}/duplicate`, {});
      expect(copy.statusCode).toBe(201);
      const body = copy.json();
      expect(body.id).not.toBe(original.id);
      expect(body).toMatchObject({ amount: 12.5, description: "Café", category: { id: PREDEFINED.food } });
      expect(body.tags.map((tag: { name: string }) => tag.name)).toEqual(["trabalho"]);
      expect(body.date).toBe(todayInTimeZone(ctx.clock.now(), "America/Sao_Paulo"));

      const adjusted = (await user.api.post(`/api/transactions/${original.id}/duplicate`, { amount: 15, date: "2026-09-02" })).json();
      expect(adjusted).toMatchObject({ amount: 15, date: "2026-09-02" });
      expect(await walletBalance(user, user.defaultWalletId)).toBe(-40);
    });

    it("não permite usar categoria de outro usuário", async () => {
      const owner = await registerUser(ctx.app);
      const category = (await owner.api.post("/api/categories", { name: "Secreta" })).json();
      const intruder = await registerUser(ctx.app);
      const response = await intruder.api.post("/api/transactions", {
        type: "expense",
        amount: 1,
        description: "x",
        categoryId: category.id,
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe("INVALID_CATEGORY");
      expect((await intruder.api.get(`/api/transactions/${(await createTransaction(owner, { amount: 1 })).id}`)).statusCode).toBe(404);
    });
  });

  describe("consulta (R09, R10, R26, R52, R70)", () => {
    let user: TestUser;

    beforeAll(async () => {
      user = await registerUser(ctx.app);
      const pets = (await user.api.post("/api/categories", { name: "Pets" })).json();
      const rows = [
        { amount: 25, description: "Padaria do João", date: "2026-08-15", categoryId: PREDEFINED.food },
        { amount: 300, description: "Aluguel", date: "2026-09-05", categoryId: PREDEFINED.housing, tags: ["casa"] },
        { amount: 89.9, description: "Farmácia São Paulo", date: "2026-09-12", categoryId: PREDEFINED.health },
        { amount: 42, description: "Ração", date: "2026-09-20", categoryId: pets.id, tags: ["casa", "pets"] },
        { type: "income", amount: 5000, description: "Salário", date: "2026-10-01", categoryId: PREDEFINED.salary },
        { amount: 15.5, description: "Café na padaria", date: "2026-10-02" },
      ];
      for (const row of rows) await createTransaction(user, row);
    });

    const list = async (query = "") => (await user.api.get(`/api/transactions${query}`)).json();
    const descriptions = (body: { data: Array<{ description: string }> }) => body.data.map((tx) => tx.description);

    it("lista em ordem cronológica inversa (R09)", async () => {
      expect(descriptions(await list())).toEqual([
        "Café na padaria",
        "Salário",
        "Ração",
        "Farmácia São Paulo",
        "Aluguel",
        "Padaria do João",
      ]);
    });

    it("pagina com cursor sem repetir nem pular itens (rolagem infinita)", async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const page = await list(query);
        seen.push(...descriptions(page));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor);
      expect(pages).toBe(3);
      expect(seen).toEqual(descriptions(await list()));
      expect((await user.api.get("/api/transactions?cursor=lixo")).statusCode).toBe(400);
    });

    it("busca por descrição sem diferenciar acentos e maiúsculas (R10)", async () => {
      expect(descriptions(await list("?q=PADARIA"))).toEqual(["Café na padaria", "Padaria do João"]);
      expect(descriptions(await list("?q=farmacia"))).toEqual(["Farmácia São Paulo"]);
      expect(descriptions(await list("?q=100%25"))).toEqual([]);
    });

    it("filtra por categoria, período, tipo e tag (R10, R43)", async () => {
      expect(descriptions(await list(`?categoryId=${PREDEFINED.housing}`))).toEqual(["Aluguel"]);
      expect(descriptions(await list("?from=2026-09-10&to=2026-09-30"))).toEqual(["Ração", "Farmácia São Paulo"]);
      expect(descriptions(await list("?type=income"))).toEqual(["Salário"]);
      expect(descriptions(await list("?tag=CASA"))).toEqual(["Ração", "Aluguel"]);
    });

    it("mostra as transações de um mês e permite navegar entre meses (R26)", async () => {
      expect(descriptions(await list("?month=2026-09"))).toEqual(["Ração", "Farmácia São Paulo", "Aluguel"]);
      expect(descriptions(await list("?month=2026-08"))).toEqual(["Padaria do João"]);
      const summary = (await user.api.get("/api/transactions/summary?month=2026-10")).json();
      expect(summary).toEqual({
        count: 2,
        totals: [{ currency: "BRL", income: 5000, expense: 15.5, net: 4984.5, count: 2 }],
      });
    });

    it("ordena por valor e por categoria, crescente e decrescente (R70)", async () => {
      const byAmountDesc = (await list("?sort=amount&order=desc")).data.map((tx: { amount: number }) => tx.amount);
      expect(byAmountDesc).toEqual([5000, 300, 89.9, 42, 25, 15.5]);
      const byAmountAsc = (await list("?sort=amount&order=asc&limit=4")).data.map((tx: { amount: number }) => tx.amount);
      expect(byAmountAsc).toEqual([15.5, 25, 42, 89.9]);
      const secondPage = await list(`?sort=amount&order=asc&limit=4&cursor=${(await list("?sort=amount&order=asc&limit=4")).nextCursor}`);
      expect(secondPage.data.map((tx: { amount: number }) => tx.amount)).toEqual([300, 5000]);
      expect(secondPage.nextCursor).toBeNull();

      const byCategory = (await list("?sort=category&order=asc")).data.map(
        (tx: { category: { name: string } | null }) => tx.category?.name ?? null,
      );
      expect(byCategory).toEqual(["Alimentação", "Moradia", "Pets", "Salário", "Saúde", null]);
    });

    it("arquiva transações antigas, tirando-as da lista principal (R52)", async () => {
      const archived = await user.api.post("/api/transactions/archive", { before: "2026-09-01" });
      expect(archived.json()).toEqual({ archived: 1 });
      expect(descriptions(await list())).not.toContain("Padaria do João");
      expect(descriptions(await list("?archived=true"))).toEqual(["Padaria do João"]);
      expect(descriptions(await list("?archived=all"))).toHaveLength(6);

      const single = (await list("?q=Aluguel")).data[0];
      expect((await user.api.post(`/api/transactions/${single.id}/archive`)).json().archived).toBe(true);
      expect(descriptions(await list())).not.toContain("Aluguel");
      expect((await user.api.post(`/api/transactions/${single.id}/unarchive`)).json().archived).toBe(false);
      expect(descriptions(await list())).toContain("Aluguel");
    });
  });

  describe("tags e categorias (R07, R08, R43, R44)", () => {
    it("cria categorias personalizadas, impede duplicar predefinidas e exclui logicamente", async () => {
      const user = await registerUser(ctx.app);
      const categories = (await user.api.get("/api/categories")).json().data;
      expect(categories.filter((category: { predefined: boolean }) => category.predefined).length).toBeGreaterThanOrEqual(5);

      const created = await user.api.post("/api/categories", { name: "Pets" });
      expect(created.statusCode).toBe(201);
      expect((await user.api.post("/api/categories", { name: "pets" })).statusCode).toBe(409);
      expect((await user.api.post("/api/categories", { name: "saude" })).json().code).toBe("CATEGORY_NAME_TAKEN");
      expect((await user.api.patch(`/api/categories/${PREDEFINED.food}`, { name: "Comida" })).statusCode).toBe(403);

      const tx = await createTransaction(user, { amount: 10, categoryId: created.json().id });
      expect((await user.api.delete(`/api/categories/${created.json().id}`)).statusCode).toBe(204);
      expect((await user.api.get("/api/categories")).json().data.map((category: { name: string }) => category.name)).not.toContain("Pets");
      // Transação antiga mantém a categoria excluída; novas não podem usá-la.
      expect((await user.api.get(`/api/transactions/${tx.id}`)).json().category.name).toBe("Pets");
      expect(
        (await user.api.post("/api/transactions", { type: "expense", amount: 1, description: "x", categoryId: created.json().id })).statusCode,
      ).toBe(422);
      // O nome pode ser reutilizado depois da exclusão.
      expect((await user.api.post("/api/categories", { name: "Pets" })).statusCode).toBe(201);
    });

    it("gerencia tags por nome, com contagem de uso", async () => {
      const user = await registerUser(ctx.app);
      const tx = await createTransaction(user, { amount: 10, tags: ["Viagem", "  viagem ", "Férias"] });
      expect(tx.tags.map((tag: { name: string }) => tag.name)).toEqual(["Férias", "Viagem"]);
      const tags = (await user.api.get("/api/tags")).json().data;
      expect(tags).toEqual([
        expect.objectContaining({ name: "Férias", transactionCount: 1 }),
        expect.objectContaining({ name: "Viagem", transactionCount: 1 }),
      ]);
      const viagem = tags.find((tag: { name: string }) => tag.name === "Viagem");
      expect((await user.api.patch(`/api/tags/${viagem.id}`, { name: "Férias" })).statusCode).toBe(409);
      expect((await user.api.delete(`/api/tags/${viagem.id}`)).statusCode).toBe(204);
      expect((await user.api.get(`/api/transactions/${tx.id}`)).json().tags.map((tag: { name: string }) => tag.name)).toEqual(["Férias"]);
      const replaced = (await user.api.patch(`/api/transactions/${tx.id}`, { tags: [] })).json();
      expect(replaced.tags).toEqual([]);
    });

    it("sugere categoria pela descrição e aprende com o histórico (R44)", async () => {
      const user = await registerUser(ctx.app);
      const first = (await user.api.post("/api/categories/suggest", { description: "Almoço no restaurante" })).json();
      expect(first.suggestions[0]).toMatchObject({ categoryId: PREDEFINED.food, name: "Alimentação" });

      const custom = (await user.api.post("/api/categories", { name: "Bichos" })).json();
      await createTransaction(user, { amount: 80, description: "Petshop Amigo", categoryId: custom.id });
      const learned = (await user.api.post("/api/categories/suggest", { description: "petshop amigo" })).json();
      expect(learned.suggestions[0].categoryId).toBe(custom.id);
    });

    it("interpreta texto falado em rascunho de transação (R65)", async () => {
      const user = await registerUser(ctx.app);
      const response = await user.api.post("/api/transactions/parse", { text: "gastei 35,90 no mercado hoje" });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.draft).toMatchObject({ type: "expense", amount: 35.9, description: "Mercado" });
      expect(body.suggestions[0].categoryId).toBe(PREDEFINED.food);
    });
  });

  describe("criptografia em repouso (R81)", () => {
    it("valores financeiros ficam cifrados no banco e invioláveis entre linhas", async () => {
      const user = await registerUser(ctx.app);
      const a = await createTransaction(user, { amount: 1234.56, description: "Valor sigiloso" });
      const b = await createTransaction(user, { amount: 1, description: "Outro" });

      const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await client.connect();
      try {
        const { rows } = await client.query<{ id: string; amount: Buffer }>(
          "select id, amount from transactions where id = any($1)",
          [[a.id, b.id]],
        );
        const rawA = rows.find((row) => row.id === a.id)!.amount;
        expect(Buffer.isBuffer(rawA)).toBe(true);
        expect(rawA.includes(Buffer.from("123456"))).toBe(false);
        expect(ctx.container.cipher.decryptAmount(rawA, aad.transactionAmount(a.id))).toBe(123456);

        const wallet = await client.query<{ balance: Buffer }>("select balance from wallets where id = $1", [user.defaultWalletId]);
        // 1234,56 + 1,00 em despesas
        expect(ctx.container.cipher.decryptAmount(wallet.rows[0]!.balance, aad.walletBalance(user.defaultWalletId))).toBe(-123556);

        // Copiar o ciphertext de uma linha para outra não produz um valor válido.
        await client.query("update transactions set amount = $1 where id = $2", [rawA, b.id]);
        const tampered = await user.api.get(`/api/transactions/${b.id}`);
        expect(tampered.statusCode).toBe(500);
      } finally {
        await client.end();
      }
    });
  });
});
