/**
 * Testes de contrato da Sprint 2: a camada de dados do app (createApi + cliente HTTP + sessão)
 * contra o backend real — observações e séries nas transações, saldo mínimo, categorias ocultas,
 * recorrências e parcelamentos, orçamentos, metas, relatórios novos, notificações, lembretes e
 * anexos (upload multipart, download autenticado e exclusão).
 *
 * Rode com a API no ar:  CONTRACT_API_URL=http://localhost:3100 npm run test:contract
 */
import type { AppNotification, Attachment, Budget, CreateSeriesResult, Goal, Transaction, Wallet } from "@/data/api";
import {
  addDays,
  addMonths,
  authHeaders,
  expectApiError,
  firstDay,
  FOOD,
  makeClient,
  month,
  registerUser,
  requireApi,
  SALARY,
  suffix,
  today,
  TRANSPORT,
  waitFor,
} from "./support";

const user = makeClient();
let defaultWalletId: string;
let reserve: Wallet;
let market: Transaction;
let internet: Transaction;
let recurring: CreateSeriesResult;
let installments: CreateSeriesResult;
let marked: CreateSeriesResult;
let goal: Goal;

const NO_SUCH_ID = "00000000-0000-4000-8000-0000000000ff";

beforeAll(async () => {
  await requireApi();
  await registerUser(user, "s2");
  const summary = await user.api.wallets.summary();
  defaultWalletId = summary.wallets.find((w) => w.isDefault)!.id;
});

describe("transações com observações e série (R57)", () => {
  it("grava, devolve e remove as observações", async () => {
    market = await user.api.transactions.create({
      type: "expense",
      amount: 40,
      description: "Mercado",
      date: today,
      categoryId: FOOD,
      notes: "Dividido com a Ana",
    });
    expect(market).toMatchObject({ notes: "Dividido com a Ana", series: null });
    await expect(user.api.transactions.get(market.id)).resolves.toMatchObject({ notes: "Dividido com a Ana" });

    const cleared = await user.api.transactions.update(market.id, { notes: null });
    expect(cleared.notes).toBeNull();
    const page = await user.api.transactions.list({ month });
    expect(page.data.find((t) => t.id === market.id)).toMatchObject({ notes: null, series: null });
  });

  it("recusa observações acima de 1000 caracteres", async () => {
    const error = await expectApiError(
      user.api.transactions.update(market.id, { notes: "x".repeat(1001) }),
      400,
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors.notes).toEqual(expect.any(String));
  });
});

describe("carteiras com saldo mínimo (R78)", () => {
  it("cria, altera e remove o saldo mínimo", async () => {
    reserve = await user.api.wallets.create({
      name: `Reserva ${suffix}`,
      type: "savings",
      initialBalance: 50,
      minBalance: 20,
    });
    expect(reserve).toMatchObject({ balance: 50, minBalance: 20 });
    await expect(user.api.wallets.update(reserve.id, { minBalance: null })).resolves.toMatchObject({
      minBalance: null,
    });
    // Saldo 50 abaixo do mínimo 100: dispara o aviso de saldo baixo (conferido em "notificações").
    await expect(user.api.wallets.update(reserve.id, { minBalance: 100 })).resolves.toMatchObject({
      minBalance: 100,
    });
    const summary = await user.api.wallets.summary();
    expect(summary.wallets.find((w) => w.id === reserve.id)).toMatchObject({ minBalance: 100 });
  });

  it("aceita no máximo 2 casas decimais", async () => {
    const error = await expectApiError(
      user.api.wallets.update(reserve.id, { minBalance: 10.555 }),
      400,
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors.minBalance).toEqual(expect.any(String));
  });
});

describe("categorias ocultas nos relatórios (R46)", () => {
  it("oculta a categoria e conta o que ficou de fora", async () => {
    await user.api.transactions.create({ type: "expense", amount: 20, description: "Uber", categoryId: TRANSPORT });

    await expect(user.api.categories.setVisibility(TRANSPORT, true)).resolves.toMatchObject({
      id: TRANSPORT,
      predefined: true,
      hiddenInReports: true,
    });
    const categories = await user.api.categories.list("expense");
    expect(categories.data.find((c) => c.id === TRANSPORT)?.hiddenInReports).toBe(true);
    expect(categories.data.find((c) => c.id === FOOD)?.hiddenInReports).toBe(false);

    const report = await user.api.reports.byCategory({ from: firstDay, to: today });
    expect(report).toMatchObject({ type: "expense", primaryCurrency: "BRL", convertedTotal: 40 });
    expect(report.categories.map((c) => c.category?.id)).toEqual([FOOD]);
    expect(report.hidden).toEqual({ count: 1, convertedTotal: 20 });

    const overview = await user.api.reports.overview();
    expect(overview.topExpenseCategories.map((c) => c.category?.id)).not.toContain(TRANSPORT);
  });

  it("inclui as ocultas quando pedido e volta a exibir", async () => {
    const all = await user.api.reports.byCategory({ from: firstDay, to: today, includeHidden: true });
    expect(all.categories.map((c) => c.category?.id)).toEqual(expect.arrayContaining([FOOD, TRANSPORT]));
    expect(all.hidden.count).toBe(0);

    await expect(user.api.categories.setVisibility(TRANSPORT, false)).resolves.toMatchObject({
      hiddenInReports: false,
    });
    const report = await user.api.reports.byCategory({ from: firstDay, to: today });
    expect(report.hidden).toEqual({ count: 0, convertedTotal: 0 });
  });
});

describe("recorrências e parcelamentos (R37, R62)", () => {
  it("registra uma recorrência e gera a 1ª ocorrência na data", async () => {
    recurring = await user.api.series.createRecurring({
      type: "expense",
      amount: 59.9,
      description: "Academia",
      date: today,
      frequency: "monthly",
      notes: "Plano mensal",
    });
    expect(recurring.series).toMatchObject({
      kind: "recurring",
      type: "expense",
      frequency: "monthly",
      amount: 59.9,
      totalAmount: null,
      installments: null,
      startDate: today,
      endDate: null,
      generatedCount: 1,
      remaining: null,
      status: "active",
      wallet: { id: defaultWalletId, currency: "BRL" },
    });
    expect(recurring.series.nextDate?.slice(0, 7)).toBe(addMonths(month, 1));
    expect(recurring.transactions).toHaveLength(1);
    expect(recurring.transactions[0]).toMatchObject({
      amount: 59.9,
      date: today,
      notes: "Plano mensal",
      series: { id: recurring.series.id, kind: "recurring", frequency: "monthly", occurrence: 1, total: null },
    });
  });

  it("recusa data final antes do início", async () => {
    const error = await expectApiError(
      user.api.series.createRecurring({
        type: "expense",
        amount: 10,
        description: "x",
        date: today,
        frequency: "weekly",
        endDate: addDays(today, -1),
      }),
      422,
      "INVALID_END_DATE",
    );
    expect(error.fieldErrors.endDate).toEqual(expect.any(String));
  });

  it("divide o parcelamento e deixa a sobra dos centavos na 1ª parcela", async () => {
    installments = await user.api.series.createInstallments({
      totalAmount: 100,
      installments: 3,
      date: today,
      description: "Fone",
    });
    expect(installments.series).toMatchObject({
      kind: "installment",
      type: "expense",
      frequency: "monthly",
      amount: 33.33,
      totalAmount: 100,
      installments: 3,
      generatedCount: 1,
      remaining: 2,
      status: "active",
    });
    expect(installments.transactions).toHaveLength(1);
    expect(installments.transactions[0]).toMatchObject({
      amount: 33.34,
      series: { id: installments.series.id, kind: "installment", occurrence: 1, total: 3 },
    });

    const detail = await user.api.series.get(installments.series.id);
    expect(detail.occurrences).toEqual([
      { occurrence: 1, transactionId: installments.transactions[0].id, date: today, amount: 33.34 },
    ]);
  });

  it("marca uma transação existente como recorrente uma única vez", async () => {
    internet = await user.api.transactions.create({ type: "expense", amount: 120, description: "Internet" });
    marked = await user.api.series.markRecurring(internet.id, "monthly");
    expect(marked.series).toMatchObject({ kind: "recurring", generatedCount: 1, startDate: today });
    expect(marked.transactions[0]).toMatchObject({
      id: internet.id,
      series: { id: marked.series.id, occurrence: 1 },
    });
    await expectApiError(user.api.series.markRecurring(internet.id, "monthly"), 409, "TRANSACTION_ALREADY_IN_SERIES");
  });

  it("altera só as próximas ocorrências", async () => {
    const updated = await user.api.series.update(recurring.series.id, {
      amount: 69.9,
      description: "Academia (novo plano)",
    });
    expect(updated).toMatchObject({ amount: 69.9, description: "Academia (novo plano)", status: "active" });
    await expect(user.api.transactions.get(recurring.transactions[0].id)).resolves.toMatchObject({
      amount: 59.9,
      description: "Academia",
    });

    const error = await expectApiError(
      user.api.series.update(installments.series.id, { amount: 50 }),
      400,
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors.amount).toEqual(expect.any(String));
  });

  it("cancela a série e registra no histórico", async () => {
    await expect(user.api.series.cancel(marked.series.id)).resolves.toBeUndefined();

    const active = await user.api.series.list();
    expect(active.data.map((s) => s.id)).toEqual(expect.arrayContaining([recurring.series.id, installments.series.id]));
    expect(active.data.map((s) => s.id)).not.toContain(marked.series.id);
    const cancelled = await user.api.series.list("cancelled");
    expect(cancelled.data.find((s) => s.id === marked.series.id)).toMatchObject({
      status: "cancelled",
      nextDate: null,
    });
    const all = await user.api.series.list("all");
    expect(all.data).toHaveLength(3);

    await expectApiError(user.api.series.cancel(marked.series.id), 409, "SERIES_NOT_ACTIVE");
    await expectApiError(user.api.series.update(marked.series.id, { description: "x" }), 409, "SERIES_NOT_ACTIVE");

    const history = await user.api.history.list(5);
    expect(history.data[0]).toMatchObject({
      action: "series.cancel",
      entityType: "series",
      entityId: marked.series.id,
      label: expect.any(String),
    });
  });

  it("não gera nada antes da data e protege a carteira com série ativa", async () => {
    const card = await user.api.wallets.create({ name: `Cartão ${suffix}`, type: "credit_card" });
    const future = await user.api.series.createRecurring({
      type: "expense",
      amount: 30,
      description: "Streaming",
      date: addDays(today, 7),
      walletId: card.id,
      frequency: "monthly",
    });
    expect(future.transactions).toEqual([]);
    expect(future.series).toMatchObject({ generatedCount: 0, nextDate: addDays(today, 7) });
    const summary = await user.api.wallets.summary();
    expect(summary.wallets.find((w) => w.id === card.id)?.balance).toBe(0);

    await expectApiError(user.api.wallets.remove(card.id), 409, "WALLET_HAS_SERIES");
    await user.api.series.cancel(future.series.id);
    await expect(user.api.wallets.remove(card.id)).resolves.toBeUndefined();
  });
});

describe("orçamentos e metas de redução (R21, R23, R45, R67, R74)", () => {
  let monthly: Budget;
  let daily: Budget;

  it("cria limites mensal e diário, com conflitos e categoria inválida", async () => {
    monthly = await user.api.budgets.create({ categoryId: FOOD, period: "monthly", amount: 100 });
    expect(monthly).toMatchObject({
      category: { id: FOOD, predefined: true },
      period: "monthly",
      amount: 100,
      currency: "BRL",
      validFrom: month,
      validTo: null,
    });
    const duplicated = await expectApiError(
      user.api.budgets.create({ categoryId: FOOD, period: "monthly", amount: 150 }),
      409,
      "BUDGET_ALREADY_EXISTS",
    );
    expect(duplicated.fieldErrors.categoryId).toEqual(expect.any(String));
    await expectApiError(
      user.api.budgets.create({ categoryId: SALARY, period: "monthly", amount: 100 }),
      422,
      "CATEGORY_NOT_EXPENSE",
    );
    daily = await user.api.budgets.create({ categoryId: FOOD, period: "daily", amount: 10 });
    expect(daily).toMatchObject({ period: "daily", amount: 10 });
  });

  it("mostra orçado × gasto do mês e do dia", async () => {
    await user.api.transactions.create({ type: "expense", amount: 45, description: "Feira", categoryId: FOOD });
    const status = await user.api.budgets.status();
    expect(status).toMatchObject({ month, date: today });
    expect(status.monthly).toEqual([
      expect.objectContaining({
        budgetId: monthly.id,
        limit: 100,
        spent: 85,
        remaining: 15,
        percent: 85,
        state: "warning",
        currency: "BRL",
      }),
    ]);
    expect(status.daily).toEqual([
      expect.objectContaining({ budgetId: daily.id, limit: 10, spent: 85, state: "exceeded" }),
    ]);

    // Os alertas chegam pelos eventos de domínio, logo depois da gravação.
    const inbox = await waitFor(
      () => user.api.notifications.list({ limit: 50 }),
      (page) => page.data.some((n) => n.kind === "budget_warning"),
    );
    expect(inbox.data.find((n) => n.kind === "budget_warning")).toMatchObject({
      entityType: "budget",
      entityId: monthly.id,
    });
  });

  it("altera o limite do mês atual e consulta o histórico", async () => {
    const updated = await user.api.budgets.update(monthly.id, 200);
    expect(updated).toMatchObject({ id: monthly.id, amount: 200, validFrom: month });
    const status = await user.api.budgets.status(month, today);
    expect(status.monthly[0]).toMatchObject({ limit: 200, percent: 42.5, state: "ok" });

    const list = await user.api.budgets.list(month);
    expect(list.data.map((b) => b.id).sort()).toEqual([monthly.id, daily.id].sort());

    const previous = addMonths(month, -1);
    const history = await user.api.budgets.history(previous, month);
    expect(history).toMatchObject({ fromMonth: previous, toMonth: month });
    expect(history.months.map((m) => m.month)).toEqual([previous, month]);
    expect(history.months[0].items).toEqual([]);
    expect(history.months[1].items).toEqual([expect.objectContaining({ budgetId: monthly.id, limit: 200 })]);

    const error = await expectApiError(user.api.budgets.history(addMonths(month, -12), month), 400, "VALIDATION_ERROR");
    expect(error.fieldErrors.toMonth).toEqual(expect.any(String));
  });

  it("encerra os orçamentos", async () => {
    await expect(user.api.budgets.remove(daily.id)).resolves.toBeUndefined();
    await expect(user.api.budgets.remove(monthly.id)).resolves.toBeUndefined();
    await expect(user.api.budgets.list()).resolves.toEqual({ data: [] });
    await expectApiError(user.api.budgets.remove(monthly.id), 404);
  });

  it("recusa meta de redução sem gasto nos meses anteriores", async () => {
    const error = await expectApiError(user.api.reductionGoals.create(FOOD, 10), 422, "NO_BASELINE");
    expect(error.fieldErrors.categoryId).toEqual(expect.any(String));
    await expectApiError(user.api.reductionGoals.create(SALARY, 10), 422, "CATEGORY_NOT_EXPENSE");
    const invalid = await expectApiError(user.api.reductionGoals.create(FOOD, 95), 400, "VALIDATION_ERROR");
    expect(invalid.fieldErrors.percent).toEqual(expect.any(String));
    await expect(user.api.reductionGoals.list()).resolves.toEqual({ data: [] });
  });
});

describe("metas de economia (R15, R16, R17, R68)", () => {
  let other: Goal;
  let salary: Transaction;
  let bonus: Transaction;
  let firstContributionId: string;

  it("cria a meta com progresso zerado e valida a data e a categoria", async () => {
    const travel = await user.api.categories.create({ name: `Viagem ${suffix}`, type: "expense" });
    goal = await user.api.goals.create({
      name: "Viagem",
      targetAmount: 500,
      deadline: addDays(today, 60),
      categoryId: travel.id,
    });
    expect(goal).toMatchObject({
      name: "Viagem",
      category: { id: travel.id, predefined: false },
      targetAmount: 500,
      currency: "BRL",
      deadline: addDays(today, 60),
      status: "active",
      achievedAt: null,
      saved: 0,
      percent: 0,
      remaining: 500,
      daysLeft: 60,
    });
    const past = await expectApiError(
      user.api.goals.create({ name: "x", targetAmount: 1, deadline: addDays(today, -1), categoryId: travel.id }),
      422,
      "INVALID_DEADLINE",
    );
    expect(past.fieldErrors.deadline).toEqual(expect.any(String));
    await expectApiError(
      user.api.goals.create({ name: "x", targetAmount: 1, deadline: today, categoryId: SALARY }),
      422,
      "CATEGORY_TYPE_MISMATCH",
    );
  });

  it("destina parte de uma receita à meta", async () => {
    salary = await user.api.transactions.create({
      type: "income",
      amount: 300,
      description: "Freela",
      categoryId: SALARY,
    });
    const result = await user.api.goals.contribute(goal.id, salary.id, 200);
    expect(result).toMatchObject({
      contribution: { goalId: goal.id, transactionId: salary.id, amount: 200, currency: "BRL" },
      goal: { id: goal.id, saved: 200, percent: 40, remaining: 300, status: "active" },
      achievedNow: false,
    });
    firstContributionId = result.contribution.id;

    await expect(user.api.goals.byTransaction(salary.id)).resolves.toEqual({
      data: [{ id: firstContributionId, goal: { id: goal.id, name: "Viagem" }, amount: 200 }],
    });
    await expectApiError(user.api.goals.contribute(goal.id, salary.id, 10), 409, "CONTRIBUTION_EXISTS");
    await expectApiError(user.api.goals.contribute(goal.id, market.id), 422, "CONTRIBUTION_NOT_INCOME");
  });

  it("não destina mais do que resta da receita e bloqueia meta cancelada", async () => {
    other = await user.api.goals.create({
      name: "Reserva de emergência",
      targetAmount: 1000,
      deadline: addDays(today, 90),
      categoryId: goal.category.id,
    });
    const exceeded = await expectApiError(
      user.api.goals.contribute(other.id, salary.id, 150),
      422,
      "CONTRIBUTION_EXCEEDS_TRANSACTION",
    );
    expect(exceeded.fieldErrors.amount).toEqual(expect.any(String));
    // Sem valor: destina o que ainda não foi destinado (100).
    await expect(user.api.goals.contribute(other.id, salary.id)).resolves.toMatchObject({
      contribution: { amount: 100 },
      goal: { saved: 100 },
    });

    await expect(user.api.goals.remove(other.id)).resolves.toBeUndefined();
    const cancelled = await user.api.goals.list("cancelled");
    expect(cancelled.data.map((g) => g.id)).toEqual([other.id]);
    await expectApiError(user.api.goals.update(other.id, { name: "Outra" }), 409, "GOAL_NOT_ACTIVE");
  });

  it("avisa quando um vínculo completa a meta", async () => {
    bonus = await user.api.transactions.create({
      type: "income",
      amount: 400,
      description: "Bônus",
      categoryId: SALARY,
    });
    await expectApiError(user.api.goals.contribute(other.id, bonus.id), 409, "GOAL_NOT_ACTIVE");

    const result = await user.api.goals.contribute(goal.id, bonus.id);
    expect(result.achievedNow).toBe(true);
    expect(result.goal).toMatchObject({ status: "achieved", saved: 600, percent: 120, remaining: 0 });
    expect(result.goal.achievedAt).toEqual(expect.any(String));

    const detail = await user.api.goals.get(goal.id);
    expect(detail.contributions).toHaveLength(2);
    expect(detail.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transaction: expect.objectContaining({ id: salary.id }), amount: 200, counted: 200 }),
        expect.objectContaining({ transaction: expect.objectContaining({ id: bonus.id }), amount: 400, counted: 400 }),
      ]),
    );
    await expect(user.api.goals.list()).resolves.toEqual({ data: [] });
    const achieved = await user.api.goals.list("achieved");
    expect(achieved.data.map((g) => g.id)).toEqual([goal.id]);
    const all = await user.api.goals.list("all");
    expect(all.data.map((g) => g.id).sort()).toEqual([goal.id, other.id].sort());
  });

  it("desfaz o vínculo de uma receita", async () => {
    await expect(user.api.goals.removeContribution(goal.id, firstContributionId)).resolves.toBeUndefined();
    const detail = await user.api.goals.get(goal.id);
    expect(detail.contributions.map((c) => c.transaction.id)).toEqual([bonus.id]);
    // O vínculo com a meta cancelada é preservado.
    const links = await user.api.goals.byTransaction(salary.id);
    expect(links.data.map((c) => c.goal.id)).toEqual([other.id]);
    await expectApiError(user.api.goals.removeContribution(goal.id, firstContributionId), 404);
  });
});

describe("relatórios da Sprint 2 (R14, R35, R36, R63, R75)", () => {
  it("traz a evolução diária e mensal do saldo", async () => {
    const summary = await user.api.wallets.summary();
    const days = Number(today.slice(8));

    const daily = await user.api.reports.balanceEvolution({ from: firstDay, to: today });
    expect(daily).toMatchObject({ from: firstDay, to: today, granularity: "day", currency: "BRL", walletId: null });
    expect(daily.points).toHaveLength(days);
    expect(daily.points[0].date).toBe(firstDay);
    expect(daily.points.at(-1)!.date).toBe(today);
    expect(daily.points.at(-1)!.balance).toBeCloseTo(summary.totalBalance!, 2);

    const from = `${addMonths(month, -2)}-01`;
    const monthly = await user.api.reports.balanceEvolution({ from, to: today, granularity: "month" });
    expect(monthly.granularity).toBe("month");
    expect(monthly.points.map((p) => p.date.slice(0, 7))).toEqual([addMonths(month, -2), addMonths(month, -1), month]);
    expect(monthly.points.at(-1)!.balance).toBeCloseTo(summary.totalBalance!, 2);

    const wallet = await user.api.reports.balanceEvolution({ from: firstDay, to: today, walletId: reserve.id });
    expect(wallet).toMatchObject({ walletId: reserve.id, currency: "BRL" });
    expect(wallet.points.at(-1)!.balance).toBe(50);
  });

  it("limita a evolução diária a 92 dias", async () => {
    const error = await expectApiError(
      user.api.reports.balanceEvolution({ from: addDays(today, -100), to: today }),
      400,
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors.to).toEqual(expect.any(String));
  });

  it("calcula os indicadores do mês: saldo médio, economia e maiores despesas", async () => {
    const indicators = await user.api.reports.monthIndicators();
    const summary = await user.api.transactions.summary({ month });
    expect(indicators).toMatchObject({ month, currency: "BRL", days: Number(today.slice(8)), ratesStale: false });
    expect(indicators.averageDailyBalance).toEqual(expect.any(Number));
    expect(indicators.savings.saved).toBeCloseTo(summary.converted!.net, 2);
    expect(indicators.savings).toMatchObject({ previousMonths: [], previousAverage: null, difference: null });

    const amounts = indicators.topExpenses.map((e) => e.convertedAmount!);
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(indicators.topExpenses[0].transaction).toMatchObject({ id: internet.id, type: "expense", amount: 120 });
    expect(indicators.topExpenses.length).toBeLessThanOrEqual(10);
  });

  it("aceita um mês passado e recusa mês futuro", async () => {
    const previous = await user.api.reports.monthIndicators(addMonths(month, -1));
    expect(previous).toMatchObject({ month: addMonths(month, -1), topExpenses: [] });
    await expectApiError(user.api.reports.monthIndicators(addMonths(month, 1)), 422, "MONTH_IN_FUTURE");
  });

  it("projeta o saldo pelas recorrências e parcelas restantes", async () => {
    const summary = await user.api.wallets.summary();
    const projection = await user.api.reports.projection();
    expect(projection).toMatchObject({ currency: "BRL", ratesStale: false });
    expect(projection.startBalance).toBeCloseTo(summary.totalBalance!, 2);
    expect(projection.months.map((m) => m.month)).toEqual([0, 1, 2, 3, 4, 5].map((n) => addMonths(month, n)));
    expect(projection.months[0].openingBalance).toBeCloseTo(projection.startBalance!, 2);
    projection.months.forEach((m, i) => {
      expect(m.closingBalance).toBeCloseTo(m.openingBalance! + m.expectedIncome! - m.expectedExpense!, 2);
      if (i > 0) expect(m.openingBalance).toBeCloseTo(projection.months[i - 1].closingBalance!, 2);
    });

    const next = projection.months[1].items;
    expect(next).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ seriesId: recurring.series.id, kind: "recurring", type: "expense", amount: 69.9 }),
        expect.objectContaining({ seriesId: installments.series.id, kind: "installment", amount: 33.33 }),
      ]),
    );
    const seriesIn = (i: number) => projection.months[i].items.map((item) => item.seriesId);
    expect(seriesIn(2)).toContain(installments.series.id);
    expect(seriesIn(3)).not.toContain(installments.series.id);
    expect(projection.months.flatMap((m) => m.items.map((item) => item.seriesId))).not.toContain(marked.series.id);

    await expectApiError(user.api.reports.projection(2), 400, "VALIDATION_ERROR");
  });
});

describe("notificações (R18, R22, R68, R74, R78)", () => {
  let inbox: AppNotification[];

  it("reúne os alertas gerados, sem valores em dinheiro", async () => {
    const expected = ["low_balance", "budget_warning", "daily_limit_exceeded", "goal_achieved"];
    const page = await waitFor(
      () => user.api.notifications.list({ limit: 50 }),
      (p) => expected.every((kind) => p.data.some((n) => n.kind === kind)),
    );
    inbox = page.data;
    expect(inbox.map((n) => n.kind)).toEqual(expect.arrayContaining(expected));
    expect(inbox.find((n) => n.kind === "low_balance")).toMatchObject({ entityType: "wallet", entityId: reserve.id });
    expect(inbox.find((n) => n.kind === "goal_achieved")).toMatchObject({
      entityType: "savings_goal",
      entityId: goal.id,
    });
    for (const n of inbox) {
      expect(n).toMatchObject({ id: expect.any(String), readAt: null, createdAt: expect.any(String) });
      expect(`${n.title} ${n.body}`).not.toMatch(/R\$|\d+,\d{2}/);
    }
    await expect(user.api.notifications.unreadCount()).resolves.toEqual({ count: inbox.length });
  });

  it("pagina por cursor e filtra as não lidas", async () => {
    const first = await user.api.notifications.list({ limit: 1 });
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await user.api.notifications.list({ limit: 1, cursor: first.nextCursor! });
    expect(second.data[0].id).not.toBe(first.data[0].id);

    const read = await user.api.notifications.markRead(first.data[0].id);
    expect(read).toMatchObject({ id: first.data[0].id, readAt: expect.any(String) });
    const unread = await user.api.notifications.list({ unread: true, limit: 50 });
    expect(unread.data.map((n) => n.id)).not.toContain(first.data[0].id);
    await expect(user.api.notifications.unreadCount()).resolves.toEqual({ count: inbox.length - 1 });
    await expectApiError(user.api.notifications.markRead(NO_SUCH_ID), 404);
  });

  it("mostra o total no sino da tela inicial e marca todas como lidas", async () => {
    const overview = await user.api.reports.overview();
    expect(overview.unreadNotifications).toBe(inbox.length - 1);
    await expect(user.api.notifications.markAllRead()).resolves.toEqual({ updated: inbox.length - 1 });
    await expect(user.api.notifications.unreadCount()).resolves.toEqual({ count: 0 });
  });

  it("lê e altera as preferências de aviso", async () => {
    await expect(user.api.notifications.settings()).resolves.toEqual({
      dailyReminderEnabled: true,
      dailyReminderHour: 20,
      goalRemindersEnabled: true,
      billRemindersEnabled: true,
      alertsPushEnabled: true,
    });
    await expect(
      user.api.notifications.updateSettings({ dailyReminderHour: 8, alertsPushEnabled: false }),
    ).resolves.toMatchObject({ dailyReminderHour: 8, alertsPushEnabled: false, dailyReminderEnabled: true });
    const error = await expectApiError(
      user.api.notifications.updateSettings({ dailyReminderHour: 24 }),
      400,
      "VALIDATION_ERROR",
    );
    expect(error.fieldErrors.dailyReminderHour).toEqual(expect.any(String));
    await expectApiError(user.api.notifications.updateSettings({}), 400, "VALIDATION_ERROR");
  });

  it("registra o aparelho para push de forma idempotente e o remove no logout", async () => {
    const token = `contrato-fcm-${suffix}`;
    const device = await user.api.notifications.registerDevice(token, "Pixel do contrato");
    expect(device.id).toEqual(expect.any(String));
    await expect(user.api.notifications.registerDevice(token)).resolves.toEqual({ id: device.id });
    await expect(user.api.notifications.unregisterDevice(device.id)).resolves.toBeUndefined();
    await expectApiError(user.api.notifications.unregisterDevice(device.id), 404);
  });
});

describe("lembretes de contas (R34)", () => {
  let rent: string;

  it("cria lembrete avulso e a partir de uma despesa recorrente", async () => {
    const created = await user.api.reminders.create({
      title: "Aluguel",
      nextDueDate: addDays(today, 5),
      frequency: "monthly",
      amount: 1500,
    });
    expect(created).toMatchObject({
      title: "Aluguel",
      amount: 1500,
      currency: "BRL",
      frequency: "monthly",
      nextDueDate: addDays(today, 5),
      seriesId: null,
      active: true,
      lastNotifiedOn: null,
    });
    rent = created.id;

    const fromSeries = await user.api.reminders.create({ seriesId: recurring.series.id });
    const series = await user.api.series.get(recurring.series.id);
    expect(fromSeries).toMatchObject({
      title: "Academia (novo plano)",
      nextDueDate: series.nextDate,
      frequency: "monthly",
      seriesId: recurring.series.id,
      amount: null,
    });
    await expectApiError(user.api.reminders.create({ seriesId: installments.series.id }), 422, "INVALID_SERIES");
  });

  it("aponta os campos obrigatórios do lembrete avulso", async () => {
    const error = await expectApiError(user.api.reminders.create({}), 400, "VALIDATION_ERROR");
    expect(Object.keys(error.fieldErrors)).toEqual(expect.arrayContaining(["title", "nextDueDate", "frequency"]));
  });

  it("pausa, altera e exclui o lembrete", async () => {
    await expect(user.api.reminders.update(rent, { active: false, amount: null })).resolves.toMatchObject({
      active: false,
      amount: null,
      currency: null,
    });
    await expect(
      user.api.reminders.update(rent, { nextDueDate: addDays(today, 10), frequency: "yearly" }),
    ).resolves.toMatchObject({ nextDueDate: addDays(today, 10), frequency: "yearly" });
    const list = await user.api.reminders.list();
    expect(list.data).toHaveLength(2);

    await expect(user.api.reminders.remove(rent)).resolves.toBeUndefined();
    const after = await user.api.reminders.list();
    expect(after.data.map((r) => r.id)).not.toContain(rent);
    await expectApiError(user.api.reminders.remove(rent), 404);
  });
});

describe("anexos das transações (R24, R25, R76)", () => {
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  // PNG 1×1 transparente.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  /** No Node o FormData leva um File de verdade; no aparelho, `fileForm` usa o formato { uri } do React Native. */
  const form = (bytes: Buffer, name: string, type: string) => {
    const body = new FormData();
    body.append("file", new File([new Uint8Array(bytes)], name, { type }));
    return body;
  };

  let pharmacy: Transaction;
  let nota: Attachment;
  let receipt: Attachment;

  it("anexa um PDF e um comprovante em imagem", async () => {
    pharmacy = await user.api.transactions.create({ type: "expense", amount: 25, description: "Farmácia" });
    nota = await user.api.attachments.upload(pharmacy.id, form(pdf, "nota-fiscal.pdf", "application/pdf"));
    expect(nota).toMatchObject({
      kind: "document",
      fileName: "nota-fiscal.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      createdAt: expect.any(String),
    });
    receipt = await user.api.attachments.upload(pharmacy.id, form(png, "comprovante.png", "image/png"), "receipt");
    expect(receipt).toMatchObject({ kind: "receipt", mimeType: "image/png", sizeBytes: png.length });

    const list = await user.api.attachments.list(pharmacy.id);
    expect(list.data.map((a) => a.id).sort()).toEqual([nota.id, receipt.id].sort());
  });

  it("confere o tipo pelo conteúdo e o tamanho máximo", async () => {
    await expectApiError(
      user.api.attachments.upload(pharmacy.id, form(Buffer.from("só texto"), "falso.pdf", "application/pdf")),
      415,
      "UNSUPPORTED_FILE_TYPE",
    );
    const big = Buffer.concat([pdf, Buffer.alloc(5 * 1024 * 1024)]);
    await expectApiError(
      user.api.attachments.upload(pharmacy.id, form(big, "grande.pdf", "application/pdf")),
      413,
      "FILE_TOO_LARGE",
    );
  });

  it("baixa o arquivo original com autorização", async () => {
    const url = user.api.attachments.contentUrl(pharmacy.id, nota.id);
    const response = await fetch(url, { headers: await authHeaders(user) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("nota-fiscal.pdf");
    expect(Buffer.from(await response.arrayBuffer()).equals(pdf)).toBe(true);

    const anonymous = await fetch(url);
    expect(anonymous.status).toBe(401);
    const intruder = makeClient();
    await registerUser(intruder, "intruso");
    await expectApiError(intruder.api.attachments.list(pharmacy.id), 404);
  });

  it("exclui o anexo e acompanha a exclusão e o desfazer da transação", async () => {
    await expect(user.api.attachments.remove(pharmacy.id, receipt.id)).resolves.toBeUndefined();
    await expect(user.api.attachments.list(pharmacy.id)).resolves.toMatchObject({ data: [{ id: nota.id }] });
    await expectApiError(user.api.attachments.remove(pharmacy.id, receipt.id), 404);

    await user.api.transactions.remove(pharmacy.id);
    await expectApiError(user.api.attachments.list(pharmacy.id), 404);
    await user.api.history.undo();
    await expect(user.api.attachments.list(pharmacy.id)).resolves.toMatchObject({ data: [{ id: nota.id }] });
  });
});
