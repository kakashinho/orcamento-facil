import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInTimeZone } from "../../src/shared/utils/dates.js";
import { createTestApp, createTransaction, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

// Câmbio falso dos testes: 1 USD = 5 BRL.
describe("indicadores e evolução do saldo (R14, R35, R36, R75)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function wallet(user: TestUser, body: Record<string, unknown>): Promise<string> {
    const response = await user.api.post("/api/wallets", body);
    expect(response.statusCode).toBe(201);
    return response.json().id;
  }

  describe("evolução do saldo (R14)", () => {
    let user: TestUser;
    let savingsId: string;

    beforeAll(async () => {
      user = await registerUser(ctx.app);
      savingsId = await wallet(user, { name: "Poupança", currency: "BRL" });
      await wallet(user, { name: "Dólar", currency: "USD", initialBalance: 100 });
      await createTransaction(user, { type: "income", amount: 1000, description: "Salário", date: "2026-01-02" });
      await createTransaction(user, { type: "expense", amount: 200, description: "Mercado", date: "2026-01-05" });
      const transfer = await user.api.post("/api/transfers", {
        sourceWalletId: user.defaultWalletId,
        targetWalletId: savingsId,
        amount: 300,
        date: "2026-01-04",
      });
      expect(transfer.statusCode).toBe(201);
    });

    it("consolidado na moeda principal: dia sem movimento repete; transferência interna não muda o total", async () => {
      const body = (await user.api.get("/api/reports/balance-evolution?from=2026-01-01&to=2026-01-06")).json();
      expect(body).toMatchObject({ granularity: "day", currency: "BRL", walletId: null, ratesStale: false });
      expect(body.points).toEqual([
        { date: "2026-01-01", balance: 500 },
        { date: "2026-01-02", balance: 1500 },
        { date: "2026-01-03", balance: 1500 },
        { date: "2026-01-04", balance: 1500 },
        { date: "2026-01-05", balance: 1300 },
        { date: "2026-01-06", balance: 1300 },
      ]);
    });

    it("de uma carteira, na moeda dela, com a transferência", async () => {
      const body = (
        await user.api.get(`/api/reports/balance-evolution?from=2026-01-01&to=2026-01-06&walletId=${user.defaultWalletId}`)
      ).json();
      expect(body.currency).toBe("BRL");
      expect(body.points.map((point: { balance: number }) => point.balance)).toEqual([0, 1000, 1000, 700, 500, 500]);
    });

    it("mensal: um ponto por mês, no último dia (o último mês termina em `to`)", async () => {
      const body = (
        await user.api.get("/api/reports/balance-evolution?from=2025-12-15&to=2026-02-10&granularity=month")
      ).json();
      expect(body.points).toEqual([
        { date: "2025-12-31", balance: 500 },
        { date: "2026-01-31", balance: 1300 },
        { date: "2026-02-10", balance: 1300 },
      ]);
    });

    it("até hoje, o último ponto bate com o saldo total da tela inicial", async () => {
      const today = todayInTimeZone(new Date(), "America/Sao_Paulo");
      const from = new Date(Date.parse(today) - 5 * 86_400_000).toISOString().slice(0, 10);
      const points = (await user.api.get(`/api/reports/balance-evolution?from=${from}&to=${today}`)).json().points;
      const summary = (await user.api.get("/api/wallets/summary")).json();
      expect(points[points.length - 1].balance).toBe(summary.totalBalance);
    });

    it("valida o período e a posse da carteira", async () => {
      const tooLong = await user.api.get("/api/reports/balance-evolution?from=2026-01-01&to=2026-04-03");
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().details).toEqual([
        { location: "querystring", path: "to", message: "Com granularidade diária, o período máximo é de 92 dias." },
      ]);
      const ok = await user.api.get("/api/reports/balance-evolution?from=2026-01-01&to=2026-04-02");
      expect(ok.statusCode).toBe(200);
      expect(ok.json().points).toHaveLength(92);

      const other = await registerUser(ctx.app);
      const foreign = await other.api.get(
        `/api/reports/balance-evolution?from=2026-01-01&to=2026-01-02&walletId=${user.defaultWalletId}`,
      );
      expect(foreign.statusCode).toBe(404);
    });
  });

  it("sem câmbio e sem cache, o consolidado vem nulo, sem erro", async () => {
    const offline = await createTestApp();
    try {
      offline.rates.failing = true;
      const user = await registerUser(offline.app);
      await wallet(user, { name: "Dólar", currency: "USD", initialBalance: 10 });
      const response = await user.api.get("/api/reports/balance-evolution?from=2026-01-01&to=2026-01-02");
      expect(response.statusCode).toBe(200);
      expect(response.json().points).toEqual([
        { date: "2026-01-01", balance: null },
        { date: "2026-01-02", balance: null },
      ]);
    } finally {
      await offline.close();
    }
  });

  describe("indicadores do mês (R35, R75, R36)", () => {
    it("saldo médio diário conta os dias sem movimento; economizado é comparado aos meses anteriores com movimento", async () => {
      const user = await registerUser(ctx.app);
      await createTransaction(user, { type: "income", amount: 1000, date: "2025-10-05" });
      await createTransaction(user, { type: "expense", amount: 400, date: "2025-10-06" });
      // Novembro sem movimento: fica fora da média.
      await createTransaction(user, { type: "income", amount: 1000, date: "2025-12-05" });
      await createTransaction(user, { type: "expense", amount: 900, date: "2025-12-06" });
      await createTransaction(user, { type: "income", amount: 3100, date: "2026-01-11" });
      await createTransaction(user, { type: "expense", amount: 1550, date: "2026-01-21" });

      const body = (await user.api.get("/api/reports/month-indicators?month=2026-01")).json();
      // Saldos de outubro e dezembro entram no saldo de janeiro: 600 + 100 = 700 antes do dia 11.
      // Dias 1–10: 700 · dias 11–20: 3800 · dias 21–31: 2250 → (7000 + 38000 + 24750) / 31 = 2250.
      expect(body).toMatchObject({ month: "2026-01", currency: "BRL", days: 31, averageDailyBalance: 2250 });
      expect(body.savings).toEqual({
        saved: 1550,
        previousAverage: 350,
        previousMonths: ["2025-12", "2025-10"],
        difference: 1200,
        differencePercent: 342.86,
      });
    });

    it("sem meses anteriores com movimento, não há comparação", async () => {
      const user = await registerUser(ctx.app);
      await createTransaction(user, { type: "income", amount: 100, date: "2026-03-10" });
      const savings = (await user.api.get("/api/reports/month-indicators?month=2026-03")).json().savings;
      expect(savings).toEqual({ saved: 100, previousAverage: null, previousMonths: [], difference: null, differencePercent: null });
    });

    it("dez maiores despesas pelo valor na moeda principal; arquivada conta, excluída não", async () => {
      const user = await registerUser(ctx.app);
      const usdId = await wallet(user, { name: "Viagem", currency: "USD" });
      const ids = new Map<number, string>();
      for (let amount = 10; amount <= 120; amount += 10) {
        ids.set(amount, (await createTransaction(user, { amount, description: `Gasto ${amount}`, date: "2026-02-10" })).id);
      }
      await createTransaction(user, { amount: 30, description: "Hotel", date: "2026-02-11", walletId: usdId });
      await createTransaction(user, { type: "income", amount: 9999, description: "Receita", date: "2026-02-12" });
      expect((await user.api.post(`/api/transactions/${ids.get(120)}/archive`)).statusCode).toBe(200);
      expect((await user.api.delete(`/api/transactions/${ids.get(110)}`)).statusCode).toBe(204);

      const top = (await user.api.get("/api/reports/month-indicators?month=2026-02")).json().topExpenses;
      expect(top.map((item: { convertedAmount: number }) => item.convertedAmount)).toEqual([
        150, 120, 100, 90, 80, 70, 60, 50, 40, 30,
      ]);
      expect(top[0].transaction).toMatchObject({ description: "Hotel", amount: 30, currency: "USD" });
      expect(top[1].transaction).toMatchObject({ description: "Gasto 120", archived: true });
    });

    it("mês atual vai até hoje; mês futuro é recusado", async () => {
      const user = await registerUser(ctx.app);
      const today = todayInTimeZone(new Date(), "America/Sao_Paulo");
      const current = (await user.api.get("/api/reports/month-indicators")).json();
      expect(current.month).toBe(today.slice(0, 7));
      expect(current.days).toBe(Number(today.slice(8, 10)));
      expect(current.averageDailyBalance).toBe(0);

      const [year, month] = today.split("-").map(Number) as [number, number];
      const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      const future = await user.api.get(`/api/reports/month-indicators?month=${next}`);
      expect(future.statusCode).toBe(422);
      expect(future.json()).toMatchObject({
        code: "MONTH_IN_FUTURE",
        details: [{ location: "body", path: "month", message: "Escolha o mês atual ou um mês anterior." }],
      });
    });
  });
});
