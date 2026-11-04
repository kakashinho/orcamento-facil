import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTestApp,
  createTransaction,
  LONG_SESSIONS,
  PREDEFINED,
  registerUser,
  type TestContext,
  type TestUser,
  walletBalance,
} from "./support/test-app.js";

const DAY = 86_400_000;
// Todos os cenários começam em 10/03/2026, 12h em São Paulo.
const START = new Date("2026-03-10T15:00:00Z");

async function freshApp(): Promise<TestContext> {
  const ctx = await createTestApp(LONG_SESSIONS);
  ctx.clock.setTo(START);
  return ctx;
}

describe("recorrências e parcelamentos (R37, R62)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await freshApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const recurring = (user: TestUser, body: Record<string, unknown>, headers?: Record<string, string>) =>
    user.api.post("/api/series/recurring", { type: "expense", amount: 100, description: "Academia", frequency: "monthly", ...body }, headers);

  it("recorrência começando hoje: 1 transação agora, a próxima só na data", async () => {
    const user = await registerUser(ctx.app);
    const response = await recurring(user, { categoryId: PREDEFINED.health });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.series).toMatchObject({
      kind: "recurring",
      type: "expense",
      frequency: "monthly",
      amount: 100,
      totalAmount: null,
      startDate: "2026-03-10",
      nextDate: "2026-04-10",
      generatedCount: 1,
      status: "active",
      category: { name: "Saúde" },
    });
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]).toMatchObject({
      date: "2026-03-10",
      amount: 100,
      series: { id: body.series.id, kind: "recurring", frequency: "monthly", occurrence: 1, total: null },
    });
    expect(await walletBalance(user, user.defaultWalletId)).toBe(-100);
    // Transação avulsa continua com series: null.
    expect((await createTransaction(user, { amount: 1 })).series).toBeNull();
  });

  it("começando no passado gera as vencidas; no futuro não gera nada ainda", async () => {
    const user = await registerUser(ctx.app);
    const past = (await recurring(user, { type: "income", amount: 3000, description: "Salário", date: "2025-12-10", categoryId: PREDEFINED.salary })).json();
    expect(past.transactions.map((t: { date: string }) => t.date)).toEqual(["2025-12-10", "2026-01-10", "2026-02-10", "2026-03-10"]);
    expect(await walletBalance(user, user.defaultWalletId)).toBe(12_000);

    const future = (await recurring(user, { date: "2026-04-01" })).json();
    expect(future.transactions).toEqual([]);
    expect(future.series).toMatchObject({ nextDate: "2026-04-01", generatedCount: 0 });

    const invalid = await recurring(user, { date: "2026-03-10", endDate: "2026-03-01" });
    expect(invalid.json()).toMatchObject({ code: "INVALID_END_DATE", details: [{ path: "endDate" }] });
    expect((await recurring(user, { date: "2024-01-01" })).json().code).toBe("DATE_OUT_OF_RANGE");
  });

  it("marcar transação existente como recorrente liga como 1ª e gera as seguintes vencidas", async () => {
    const user = await registerUser(ctx.app);
    const rent = await createTransaction(user, { amount: 1500, description: "Aluguel", date: "2026-01-15", categoryId: PREDEFINED.housing });
    const marked = await user.api.post(`/api/series/recurring/from-transaction/${rent.id}`, { frequency: "monthly" });
    expect(marked.statusCode).toBe(201);
    const body = marked.json();
    expect(body.series).toMatchObject({ startDate: "2026-01-15", generatedCount: 2, nextDate: "2026-03-15" });
    expect(body.transactions.map((t: { date: string; series: { occurrence: number } }) => [t.date, t.series.occurrence])).toEqual([
      ["2026-01-15", 1],
      ["2026-02-15", 2],
    ]);

    const again = await user.api.post(`/api/series/recurring/from-transaction/${rent.id}`, { frequency: "monthly" });
    expect(again.json().code).toBe("TRANSACTION_ALREADY_IN_SERIES");
    const old = await createTransaction(user, { amount: 1, date: "2025-03-01" });
    expect((await user.api.post(`/api/series/recurring/from-transaction/${old.id}`, { frequency: "yearly" })).json().code).toBe(
      "TRANSACTION_TOO_OLD",
    );
    const other = await registerUser(ctx.app);
    expect((await other.api.post(`/api/series/recurring/from-transaction/${rent.id}`, { frequency: "monthly" })).statusCode).toBe(404);
  });

  it("parcelamento divide o total (sobra na 1ª), gera as vencidas e encerra na última", async () => {
    const user = await registerUser(ctx.app);
    const today = (await user.api.post("/api/series/installments", { totalAmount: 100, installments: 3, date: "2026-03-10", description: "Fone" })).json();
    expect(today.transactions.map((t: { amount: number }) => t.amount)).toEqual([33.34]);
    expect(today.series).toMatchObject({ kind: "installment", totalAmount: 100, amount: 33.33, installments: 3, remaining: 2, nextDate: "2026-04-10" });
    expect(today.transactions[0].series).toMatchObject({ kind: "installment", occurrence: 1, total: 3 });

    const past = (await user.api.post("/api/series/installments", { totalAmount: 100, installments: 3, date: "2026-01-10", description: "Cadeira" })).json();
    expect(past.transactions.map((t: { amount: number }) => t.amount)).toEqual([33.34, 33.33, 33.33]);
    expect(past.series).toMatchObject({ status: "ended", nextDate: null, remaining: 0 });

    const salary = await user.api.post("/api/series/installments", {
      totalAmount: 100,
      installments: 2,
      date: "2026-03-10",
      description: "x",
      categoryId: PREDEFINED.salary,
    });
    expect(salary.json().code).toBe("CATEGORY_TYPE_MISMATCH");
    expect((await user.api.post("/api/series/installments", { totalAmount: 100, installments: 1, date: "2026-03-10", description: "x" })).statusCode).toBe(400);
    expect((await user.api.post("/api/series/installments", { totalAmount: 0.01, installments: 2, date: "2026-03-10", description: "x" })).statusCode).toBe(400);
  });

  it("Idempotency-Key: repetir a criação devolve a mesma série, sem duplicar nem gerar de novo", async () => {
    const user = await registerUser(ctx.app);
    const headers = { "idempotency-key": "recorrencia-chave-1" };
    const first = await recurring(user, { description: "Streaming", amount: 40 }, headers);
    expect(first.statusCode).toBe(201);
    const again = await recurring(user, { description: "Streaming", amount: 40 }, headers);
    expect(again.statusCode).toBe(200);
    expect(again.json().series.id).toBe(first.json().series.id);
    expect(again.json().transactions.map((t: { id: string }) => t.id)).toEqual(first.json().transactions.map((t: { id: string }) => t.id));

    const list = (await user.api.get("/api/series")).json();
    expect(list.data).toHaveLength(1);
    expect(await walletBalance(user, first.json().series.wallet.id)).toBe(-40);

    // Outra chave é outra criação; sem chave, sempre cria.
    expect((await recurring(user, { description: "Streaming", amount: 40 }, { "idempotency-key": "recorrencia-chave-2" })).statusCode).toBe(201);
    expect((await recurring(user, { description: "Streaming", amount: 40 })).statusCode).toBe(201);
    expect((await user.api.get("/api/series")).json().data).toHaveLength(3);

    // A chave de um usuário não vale para outro.
    const other = await registerUser(ctx.app);
    expect((await recurring(other, { description: "Streaming", amount: 40 }, headers)).statusCode).toBe(201);
  });

  it("Idempotency-Key: parcelamento repetido e requisições simultâneas criam uma só vez", async () => {
    const user = await registerUser(ctx.app);
    const headers = { "idempotency-key": "parcelas-chave-1" };
    const body = { totalAmount: 100, installments: 3, date: "2026-01-10", description: "Cadeira" };
    const [a, b] = await Promise.all([
      user.api.post("/api/series/installments", body, headers),
      user.api.post("/api/series/installments", body, headers),
    ]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json().series.id).toBe(b.json().series.id);
    expect((await user.api.get("/api/series?status=all")).json().data).toHaveLength(1);
    expect(await walletBalance(user, a.json().series.wallet.id)).toBe(-100);

    const short = await user.api.post("/api/series/installments", body, { "idempotency-key": "curta" });
    expect(short.statusCode).toBe(400);
  });

  it("desfazer a criação exclui as transações, restaura o saldo e cancela a série", async () => {
    const user = await registerUser(ctx.app);
    const created = (await recurring(user, { date: "2026-01-10" })).json();
    expect(await walletBalance(user, user.defaultWalletId)).toBe(-300);
    const undo = await user.api.post("/api/history/undo");
    expect(undo.json().undone).toMatchObject({ action: "series.create", entityType: "series" });
    expect(await walletBalance(user, user.defaultWalletId)).toBe(0);
    expect((await user.api.get(`/api/series/${created.series.id}`)).json()).toMatchObject({ status: "cancelled", occurrences: [] });
  });

  it("editar muda só as próximas; parcelamento não muda valor; cancelar e desfazer; carteira com série ativa", async () => {
    const user = await registerUser(ctx.app);
    const created = (await recurring(user, { amount: 50, date: "2026-02-10" })).json();
    const updated = await user.api.patch(`/api/series/${created.series.id}`, { amount: 80, description: "Academia nova" });
    expect(updated.json()).toMatchObject({ amount: 80, description: "Academia nova" });
    const detail = (await user.api.get(`/api/series/${created.series.id}`)).json();
    expect(detail.occurrences.map((o: { amount: number }) => o.amount)).toEqual([50, 50]);

    const parcel = (await user.api.post("/api/series/installments", { totalAmount: 90, installments: 3, date: "2026-03-10", description: "TV" })).json();
    expect((await user.api.patch(`/api/series/${parcel.series.id}`, { amount: 10 })).statusCode).toBe(400);

    expect((await user.api.delete(`/api/series/${created.series.id}`)).statusCode).toBe(204);
    expect((await user.api.get("/api/series")).json().data.map((s: { id: string }) => s.id)).toEqual([parcel.series.id]);
    expect((await user.api.patch(`/api/series/${created.series.id}`, { amount: 1 })).json().code).toBe("SERIES_NOT_ACTIVE");
    await user.api.post("/api/history/undo");
    expect((await user.api.get(`/api/series/${created.series.id}`)).json()).toMatchObject({ status: "active", nextDate: "2026-04-10" });

    const extra = (await user.api.post("/api/wallets", { name: "Extra" })).json();
    const futureOnExtra = (await recurring(user, { date: "2026-05-01", walletId: extra.id })).json();
    const blocked = await user.api.delete(`/api/wallets/${extra.id}`);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("WALLET_HAS_SERIES");
    await user.api.delete(`/api/series/${futureOnExtra.series.id}`);
    expect((await user.api.delete(`/api/wallets/${extra.id}`)).statusCode).toBe(204);
  });
});

describe("geração das ocorrências na data (tarefa agendada)", () => {
  it("gera no dia, no fuso do usuário, sem duplicar; encerra parcelas; recupera atraso de 12 em 12", async () => {
    const ctx = await freshApp();
    try {
      const user = await registerUser(ctx.app);
      const monthly = (
        await user.api.post("/api/series/recurring", { type: "expense", amount: 10, description: "Streaming", frequency: "monthly", date: "2026-03-11" })
      ).json();
      const parcels = (await user.api.post("/api/series/installments", { totalAmount: 30, installments: 2, date: "2026-03-10", description: "Tênis" })).json();
      const run = () => ctx.container.services.jobs.runOnce();

      ctx.clock.setTo(new Date("2026-03-11T02:30:00Z")); // 10/03 às 23h30 em São Paulo
      await run();
      expect((await user.api.get(`/api/series/${monthly.series.id}`)).json().occurrences).toEqual([]);

      ctx.clock.setTo(new Date("2026-03-11T03:05:00Z")); // 11/03 às 0h05
      await run();
      await run();
      expect((await user.api.get(`/api/series/${monthly.series.id}`)).json().occurrences).toHaveLength(1);

      ctx.clock.setTo(new Date("2026-04-10T15:00:00Z"));
      await run();
      const parcelDetail = (await user.api.get(`/api/series/${parcels.series.id}`)).json();
      expect(parcelDetail).toMatchObject({ status: "ended", nextDate: null, remaining: 0 });
      expect(parcelDetail.occurrences.map((o: { amount: number }) => o.amount)).toEqual([15, 15]);

      // Saldo: 2 ocorrências de 10 (11/03 ainda não venceu em 10/04? venceu 11/03; 11/04 não) + 30 das parcelas.
      expect(await walletBalance(user, user.defaultWalletId)).toBe(-40);

      const weekly = (
        await user.api.post("/api/series/recurring", { type: "expense", amount: 1, description: "Café", frequency: "weekly", date: "2026-04-10" })
      ).json();
      ctx.clock.advance(20 * 7 * DAY);
      await run();
      expect((await user.api.get(`/api/series/${weekly.series.id}`)).json().occurrences).toHaveLength(13);
      await run();
      expect((await user.api.get(`/api/series/${weekly.series.id}`)).json().occurrences).toHaveLength(21);
    } finally {
      await ctx.close();
    }
  });

  it("categoria excluída depois: a ocorrência sai sem categoria; falha numa série não para as outras", async () => {
    const ctx = await freshApp();
    try {
      const user = await registerUser(ctx.app);
      const pets = (await user.api.post("/api/categories", { name: "Pets", type: "expense" })).json();
      const created = (
        await user.api.post("/api/series/recurring", {
          type: "expense",
          amount: 20,
          description: "Ração",
          frequency: "monthly",
          date: "2026-03-10",
          categoryId: pets.id,
        })
      ).json();
      await user.api.delete(`/api/categories/${pets.id}`);
      ctx.clock.setTo(new Date("2026-04-10T15:00:00Z"));
      await ctx.container.services.jobs.runOnce();
      const occurrences = (await user.api.get(`/api/series/${created.series.id}`)).json().occurrences;
      const second = (await user.api.get(`/api/transactions/${occurrences[1].transactionId}`)).json();
      expect(second.category).toBeNull();
    } finally {
      await ctx.close();
    }
  });
});

describe("projeção de saldo (R63)", () => {
  it("parte do saldo atual e soma recorrências e parcelas restantes, mês a mês", async () => {
    const ctx = await freshApp();
    try {
      const user = await registerUser(ctx.app);
      await user.api.post("/api/series/recurring", { type: "income", amount: 5000, description: "Salário", frequency: "monthly", date: "2026-03-05", categoryId: PREDEFINED.salary });
      await user.api.post("/api/series/recurring", { type: "expense", amount: 2000, description: "Aluguel", frequency: "monthly", date: "2026-03-15" });
      await user.api.post("/api/series/installments", { totalAmount: 300, installments: 3, date: "2026-03-01", description: "Celular" });

      const body = (await user.api.get("/api/reports/projection")).json();
      expect(body).toMatchObject({ currency: "BRL", startBalance: 4900, ratesStale: false });
      expect(
        body.months.map((m: { month: string; openingBalance: number; expectedIncome: number; expectedExpense: number; closingBalance: number }) => [
          m.month,
          m.openingBalance,
          m.expectedIncome,
          m.expectedExpense,
          m.closingBalance,
        ]),
      ).toEqual([
        ["2026-03", 4900, 0, 2000, 2900],
        ["2026-04", 2900, 5000, 2100, 5800],
        ["2026-05", 5800, 5000, 2100, 8700],
        ["2026-06", 8700, 5000, 2000, 11700],
        ["2026-07", 11700, 5000, 2000, 14700],
        ["2026-08", 14700, 5000, 2000, 17700],
      ]);
      expect(body.months[1].items.map((i: { description: string }) => i.description).sort()).toEqual(["Aluguel", "Celular", "Salário"]);
      expect((await user.api.get("/api/reports/projection?months=25")).statusCode).toBe(400);
      expect((await user.api.get("/api/reports/projection?months=3")).json().months).toHaveLength(3);
    } finally {
      await ctx.close();
    }
  });
});
