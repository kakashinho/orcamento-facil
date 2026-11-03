import type { Clock } from "../../../infrastructure/clock.js";
import { errors } from "../../../shared/errors/app-error.js";
import {
  addMonths,
  datesBetween,
  monthOf,
  monthRange,
  monthsBetween,
  todayInTimeZone,
} from "../../../shared/utils/dates.js";
import { fromCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { CategoryService } from "../../finance/services/category.service.js";
import type { NotificationService } from "../../notifications/services/notification.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { TransferService } from "../../finance/services/transfer.service.js";
import type { WalletService } from "../../finance/services/wallet.service.js";
import type { MovementRange } from "../../finance/types/transaction.types.js";
import type { Wallet } from "../../finance/types/wallet.types.js";
import type {
  BalanceEvolutionQueryDto,
  BalanceEvolutionResponseDto,
  ByCategoryQueryDto,
  ByCategoryResponseDto,
  CashFlowResponseDto,
  ConvertedTotalsDto,
  MonthIndicatorsQueryDto,
  MonthIndicatorsResponseDto,
  MonthlyQueryDto,
  MonthlyResponseDto,
  OverviewQueryDto,
  OverviewResponseDto,
  PeriodQueryDto,
  StatementResponseDto,
} from "../schemas/report.schema.js";
import type { Movement } from "../types/report.types.js";
import { renderStatementPdf } from "./statement-pdf.js";

export interface ReportServiceDeps {
  wallets: WalletService;
  transactions: TransactionService;
  transfers: TransferService;
  users: UserService;
  exchangeRates: ExchangeRateService;
  categories: CategoryService;
  notifications: NotificationService;
  clock: Clock;
}

const OVERVIEW_TOP_CATEGORIES = 5;
const OVERVIEW_RECENT_TRANSACTIONS = 5;
const TOP_EXPENSES = 10;
/** Meses anteriores comparados no valor economizado (R75). */
const SAVINGS_PREVIOUS_MONTHS = 3;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Datas dos pontos da evolução: cada dia, ou o último dia de cada mês (limitado a `to`). */
function evolutionDates(from: string, to: string, granularity: "day" | "month"): string[] {
  if (granularity === "day") return datesBetween(from, to);
  return monthsBetween(monthOf(from), monthOf(to)).map((month) => {
    const end = monthRange(month).to;
    return end > to ? to : end;
  });
}

function byChronology(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time !== 0) return time;
  return a.referenceId < b.referenceId ? -1 : 1;
}

/**
 * Consultas e relatórios: visão geral da tela inicial, extrato (R41), fluxo de caixa (R58) e
 * agregações para gráficos. Não acessa tabelas: consulta os dados pelos services públicos do
 * finance e do auth. Os períodos já chegam validados pelos DTOs (ordem e tamanho máximo).
 */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  /** Tela inicial (R55, R83, R86): tudo o que ela mostra em uma única requisição. */
  async overview(userId: string, query: OverviewQueryDto): Promise<OverviewResponseDto> {
    const { users, wallets, transactions, clock } = this.deps;
    const { timezone } = await users.getPreferences(userId);
    const month = query.month ?? monthOf(todayInTimeZone(clock.now(), timezone));
    const range = monthRange(month);
    const [walletSummary, monthSummary, expenses, recent, unreadNotifications] = await Promise.all([
      wallets.summary(userId),
      transactions.summary(userId, { month, archived: "all" }),
      this.byCategory(userId, { from: range.from, to: range.to, type: "expense", includeHidden: "false" }),
      transactions.list(userId, { sort: "date", order: "desc", limit: OVERVIEW_RECENT_TRANSACTIONS, archived: "false" }),
      this.deps.notifications.countUnread(userId),
    ]);
    return {
      month,
      wallets: walletSummary,
      monthSummary,
      topExpenseCategories: expenses.categories.slice(0, OVERVIEW_TOP_CATEGORIES),
      recentTransactions: recent.data,
      unreadNotifications,
    };
  }

  private async walletsOf(userId: string, walletId?: string): Promise<Wallet[]> {
    const all = await this.deps.wallets.listForReports(userId);
    if (!walletId) return all;
    const wallet = all.find((item) => item.id === walletId);
    if (!wallet) throw errors.notFound("Carteira");
    return [wallet];
  }

  private async transactionMovements(userId: string, range: MovementRange): Promise<Movement[]> {
    const rows = await this.deps.transactions.listMovements(userId, range);
    return rows.map((row) => ({
      kind: row.type,
      referenceId: row.id,
      date: row.date,
      createdAt: row.createdAt,
      description: row.description,
      walletId: row.walletId,
      cents: row.type === "income" ? row.amountCents : -row.amountCents,
      category: row.category,
    }));
  }

  /** Transferências viram uma saída na origem e uma entrada no destino. */
  private async transferMovements(
    userId: string,
    range: Pick<MovementRange, "from" | "to" | "before">,
    walletIds: Set<string>,
  ): Promise<Movement[]> {
    const movements: Movement[] = [];
    for (const transfer of await this.deps.transfers.listForReports(userId, range)) {
      const description = transfer.description ?? "Transferência entre carteiras";
      const base = { referenceId: transfer.id, date: transfer.date, createdAt: transfer.createdAt, description, category: null };
      if (walletIds.has(transfer.sourceWalletId)) {
        movements.push({ ...base, kind: "transfer_out", walletId: transfer.sourceWalletId, cents: -transfer.sourceCents });
      }
      if (walletIds.has(transfer.targetWalletId)) {
        movements.push({ ...base, kind: "transfer_in", walletId: transfer.targetWalletId, cents: transfer.targetCents });
      }
    }
    return movements;
  }

  /** R41: por carteira, saldo inicial, movimentos em ordem cronológica e saldo corrente. */
  async statement(userId: string, query: PeriodQueryDto): Promise<StatementResponseDto> {
    const wallets = await this.walletsOf(userId, query.walletId);
    const walletIds = new Set(wallets.map((wallet) => wallet.id));
    const walletFilter = query.walletId ? { walletId: query.walletId } : {};

    const before = [
      ...(await this.transactionMovements(userId, { before: query.from, ...walletFilter })),
      ...(await this.transferMovements(userId, { before: query.from }, walletIds)),
    ];
    const period = [
      ...(await this.transactionMovements(userId, { from: query.from, to: query.to, ...walletFilter })),
      ...(await this.transferMovements(userId, { from: query.from, to: query.to }, walletIds)),
    ].sort(byChronology);

    return {
      from: query.from,
      to: query.to,
      generatedAt: this.deps.clock.now().toISOString(),
      wallets: wallets.map((wallet) => {
        const opening =
          wallet.initialBalanceCents +
          before.filter((movement) => movement.walletId === wallet.id).reduce((sum, movement) => sum + movement.cents, 0);
        let running = opening;
        let totalIn = 0;
        let totalOut = 0;
        const entries = period
          .filter((movement) => movement.walletId === wallet.id)
          .map((movement) => {
            running += movement.cents;
            if (movement.cents >= 0) totalIn += movement.cents;
            else totalOut += -movement.cents;
            return {
              date: movement.date,
              kind: movement.kind,
              referenceId: movement.referenceId,
              description: movement.description,
              category: movement.category,
              amount: fromCents(movement.cents),
              balance: fromCents(running),
            };
          });
        return {
          wallet: { id: wallet.id, name: wallet.name, currency: wallet.currency, type: wallet.type },
          openingBalance: fromCents(opening),
          totalIn: fromCents(totalIn),
          totalOut: fromCents(totalOut),
          closingBalance: fromCents(running),
          entries,
        };
      }),
    };
  }

  /** R41: o mesmo extrato em PDF, com nome de arquivo para download. */
  async statementPdf(userId: string, query: PeriodQueryDto): Promise<{ pdf: Buffer; filename: string }> {
    const report = await this.statement(userId, query);
    const { username, timezone } = await this.deps.users.getPreferences(userId);
    const generatedAtLabel = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(
      this.deps.clock.now(),
    );
    return {
      pdf: await renderStatementPdf(report, { holder: username, generatedAtLabel }),
      filename: `extrato-${query.from}_${query.to}.pdf`,
    };
  }

  private async convertTotals(
    perCurrency: Map<string, { inflow: number; outflow: number }>,
    target: string,
  ): Promise<ConvertedTotalsDto | null> {
    let inflow = 0;
    let outflow = 0;
    let updatedAt: Date | null = null;
    let stale = false;
    try {
      for (const [currency, totals] of perCurrency) {
        if (currency === target) {
          inflow += totals.inflow;
          outflow += totals.outflow;
          continue;
        }
        const convertedIn = await this.deps.exchangeRates.convert(totals.inflow, currency, target);
        const convertedOut = await this.deps.exchangeRates.convert(totals.outflow, currency, target);
        inflow += convertedIn.cents;
        outflow += convertedOut.cents;
        updatedAt = convertedIn.quote.updatedAt;
        stale ||= convertedIn.quote.stale;
      }
    } catch {
      return null;
    }
    return {
      currency: target,
      inflow: fromCents(inflow),
      outflow: fromCents(outflow),
      net: fromCents(inflow - outflow),
      ratesUpdatedAt: updatedAt ? updatedAt.toISOString() : null,
      ratesStale: stale,
    };
  }

  /**
   * R58: todas as entradas e saídas do período em ordem cronológica. Sem carteira definida,
   * transferências internas ficam de fora (não são receita nem despesa).
   */
  async cashFlow(userId: string, query: PeriodQueryDto): Promise<CashFlowResponseDto> {
    const wallets = await this.walletsOf(userId, query.walletId);
    const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
    const movements = [
      ...(await this.transactionMovements(userId, {
        from: query.from,
        to: query.to,
        ...(query.walletId ? { walletId: query.walletId } : {}),
      })),
      ...(query.walletId
        ? await this.transferMovements(userId, { from: query.from, to: query.to }, new Set([query.walletId]))
        : []),
    ].sort(byChronology);

    const perCurrency = new Map<string, { inflow: number; outflow: number }>();
    const entries = movements.map((movement) => {
      const wallet = walletById.get(movement.walletId)!;
      const totals = perCurrency.get(wallet.currency) ?? { inflow: 0, outflow: 0 };
      if (movement.cents >= 0) totals.inflow += movement.cents;
      else totals.outflow += -movement.cents;
      perCurrency.set(wallet.currency, totals);
      return {
        date: movement.date,
        kind: movement.kind,
        referenceId: movement.referenceId,
        description: movement.description,
        wallet: { id: wallet.id, name: wallet.name, currency: wallet.currency },
        category: movement.category,
        amount: fromCents(movement.cents),
      };
    });

    const { primaryCurrency } = await this.deps.users.getPreferences(userId);
    return {
      from: query.from,
      to: query.to,
      walletId: query.walletId ?? null,
      primaryCurrency,
      entries,
      totals: [...perCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, totals]) => ({
          currency,
          inflow: fromCents(totals.inflow),
          outflow: fromCents(totals.outflow),
          net: fromCents(totals.inflow - totals.outflow),
        })),
      convertedTotal:
        perCurrency.size === 0
          ? { currency: primaryCurrency, inflow: 0, outflow: 0, net: 0, ratesUpdatedAt: null, ratesStale: false }
          : await this.convertTotals(perCurrency, primaryCurrency),
    };
  }

  /**
   * Saldo de fim de dia de cada carteira em cada data pedida (crescente), em centavos: saldo
   * inicial + movimentos (transações e transferências) até a data. Base de R14 e R35.
   */
  private async balanceSeries(userId: string, wallets: Wallet[], from: string, dates: string[]): Promise<Map<string, number[]>> {
    const series = new Map(wallets.map((wallet) => [wallet.id, [] as number[]]));
    const last = dates[dates.length - 1];
    if (last === undefined) return series;
    const walletIds = new Set(wallets.map((wallet) => wallet.id));
    const walletFilter = wallets.length === 1 ? { walletId: wallets[0]!.id } : {};

    const running = new Map(wallets.map((wallet) => [wallet.id, wallet.initialBalanceCents]));
    const apply = (movement: Movement) => {
      if (walletIds.has(movement.walletId)) running.set(movement.walletId, running.get(movement.walletId)! + movement.cents);
    };
    const before = [
      ...(await this.transactionMovements(userId, { before: from, ...walletFilter })),
      ...(await this.transferMovements(userId, { before: from }, walletIds)),
    ];
    before.forEach(apply);
    const period = [
      ...(await this.transactionMovements(userId, { from, to: last, ...walletFilter })),
      ...(await this.transferMovements(userId, { from, to: last }, walletIds)),
    ].sort(byChronology);

    let next = 0;
    for (const date of dates) {
      while (next < period.length && period[next]!.date <= date) apply(period[next++]!);
      for (const wallet of wallets) series.get(wallet.id)!.push(running.get(wallet.id)!);
    }
    return series;
  }

  /** Soma os saldos das carteiras no ponto `index`, convertidos para `target`; null se faltar câmbio. */
  private convertPoint(wallets: Wallet[], series: Map<string, number[]>, index: number, target: string) {
    const perCurrency = new Map<string, number>();
    for (const wallet of wallets) {
      perCurrency.set(wallet.currency, (perCurrency.get(wallet.currency) ?? 0) + series.get(wallet.id)![index]!);
    }
    return this.deps.exchangeRates.tryConvertMany(
      [...perCurrency.entries()].map(([currency, cents]) => ({ cents, currency })),
      target,
    );
  }

  /** R14: saldo de fim de dia (ou de mês) no período, de uma carteira ou consolidado. */
  async balanceEvolution(userId: string, query: BalanceEvolutionQueryDto): Promise<BalanceEvolutionResponseDto> {
    const wallets = await this.walletsOf(userId, query.walletId);
    const dates = evolutionDates(query.from, query.to, query.granularity);
    const series = await this.balanceSeries(userId, wallets, query.from, dates);
    const { primaryCurrency } = await this.deps.users.getPreferences(userId);

    let ratesStale = false;
    const points: BalanceEvolutionResponseDto["points"] = [];
    for (const [index, date] of dates.entries()) {
      if (query.walletId) {
        points.push({ date, balance: fromCents(series.get(query.walletId)![index]!) });
        continue;
      }
      const converted = await this.convertPoint(wallets, series, index, primaryCurrency);
      ratesStale ||= converted?.stale ?? false;
      points.push({ date, balance: converted ? fromCents(converted.total) : null });
    }
    return {
      from: query.from,
      to: query.to,
      granularity: query.granularity,
      currency: query.walletId ? wallets[0]!.currency : primaryCurrency,
      walletId: query.walletId ?? null,
      points,
      ratesStale,
    };
  }

  /** R35, R75 e R36 numa ida ao servidor, para a tela de análises. */
  async monthIndicators(userId: string, query: MonthIndicatorsQueryDto): Promise<MonthIndicatorsResponseDto> {
    const { users, clock, exchangeRates, transactions } = this.deps;
    const { timezone, primaryCurrency } = await users.getPreferences(userId);
    const today = todayInTimeZone(clock.now(), timezone);
    const currentMonth = monthOf(today);
    const month = query.month ?? currentMonth;
    if (month > currentMonth) {
      throw errors.unprocessable("MONTH_IN_FUTURE", "Escolha o mês atual ou um mês anterior.", "month");
    }
    const range = monthRange(month);
    const wallets = await this.walletsOf(userId);

    // R35: média dos saldos de fim de dia (dias sem movimento repetem o saldo anterior).
    const dates = datesBetween(range.from, month === currentMonth ? today : range.to);
    const series = await this.balanceSeries(userId, wallets, range.from, dates);
    let total = 0;
    let missingRate = false;
    let ratesStale = false;
    for (const index of dates.keys()) {
      const converted = await this.convertPoint(wallets, series, index, primaryCurrency);
      if (!converted) {
        missingRate = true;
        break;
      }
      total += converted.total;
      ratesStale ||= converted.stale;
    }
    const averageDailyBalance = missingRate ? null : fromCents(Math.round(total / dates.length));

    // R75: receitas − despesas do mês × média dos meses anteriores que tiveram movimento.
    const monthly = await this.monthly(userId, { fromMonth: addMonths(month, -SAVINGS_PREVIOUS_MONTHS), toMonth: month });
    const current = monthly.months[monthly.months.length - 1]!;
    const previous = monthly.months
      .slice(0, -1)
      .filter((entry) => entry.totals.some((totals) => totals.income > 0 || totals.expense > 0))
      .reverse();
    const saved = current.converted?.net ?? null;
    const previousAverage =
      previous.length === 0 || previous.some((entry) => entry.converted === null)
        ? null
        : round2(previous.reduce((sum, entry) => sum + entry.converted!.net, 0) / previous.length);
    const difference = saved !== null && previousAverage !== null ? round2(saved - previousAverage) : null;
    const differencePercent =
      difference !== null && previousAverage ? round2((difference / Math.abs(previousAverage)) * 100) : null;

    // R36: as maiores despesas do mês pelo valor na moeda principal.
    const currencyOf = new Map(wallets.map((wallet) => [wallet.id, wallet.currency]));
    const expenses = await this.transactionMovements(userId, { from: range.from, to: range.to, type: "expense" });
    const ranked: Array<{ movement: Movement; converted: number | null }> = [];
    for (const movement of expenses) {
      const converted = await exchangeRates.tryConvertMany(
        [{ cents: Math.abs(movement.cents), currency: currencyOf.get(movement.walletId)! }],
        primaryCurrency,
      );
      ranked.push({ movement, converted: converted?.total ?? null });
    }
    ranked.sort(
      (a, b) =>
        (b.converted ?? -1) - (a.converted ?? -1) ||
        (a.movement.date === b.movement.date ? 0 : a.movement.date < b.movement.date ? 1 : -1) ||
        (a.movement.referenceId < b.movement.referenceId ? -1 : 1),
    );
    const top = ranked.slice(0, TOP_EXPENSES);
    const details = await transactions.getMany(userId, top.map((item) => item.movement.referenceId));

    return {
      month,
      currency: primaryCurrency,
      days: dates.length,
      averageDailyBalance,
      ratesStale,
      savings: {
        saved,
        previousAverage,
        previousMonths: previous.map((entry) => entry.month),
        difference,
        differencePercent,
      },
      topExpenses: details.map((transaction, index) => ({
        transaction,
        convertedAmount: top[index]!.converted === null ? null : fromCents(top[index]!.converted!),
      })),
    };
  }

  /** Totais por categoria no período — base para gráfico de pizza. */
  async byCategory(userId: string, query: ByCategoryQueryDto): Promise<ByCategoryResponseDto> {
    const currencyOf = new Map((await this.walletsOf(userId)).map((wallet) => [wallet.id, wallet.currency]));
    const movements = await this.transactionMovements(userId, { from: query.from, to: query.to, type: query.type });
    const { primaryCurrency } = await this.deps.users.getPreferences(userId);

    const groups = new Map<string, { category: { id: string; name: string } | null; count: number; perCurrency: Map<string, number> }>();
    for (const movement of movements) {
      const key = movement.category?.id ?? "none";
      const group = groups.get(key) ?? { category: movement.category, count: 0, perCurrency: new Map<string, number>() };
      const currency = currencyOf.get(movement.walletId)!;
      group.count += 1;
      group.perCurrency.set(currency, (group.perCurrency.get(currency) ?? 0) + Math.abs(movement.cents));
      groups.set(key, group);
    }

    // R46: categorias ocultas saem do gráfico; o percentual é recalculado sobre as exibidas.
    const hiddenIds = query.includeHidden === "true" ? new Set<string>() : await this.deps.categories.hiddenIds(userId);
    const hidden: { count: number; total: number | null } = { count: 0, total: 0 };

    const rows: ByCategoryResponseDto["categories"] = [];
    let grandTotal: number | null = 0;
    for (const group of groups.values()) {
      const converted = await this.deps.exchangeRates.tryConvertMany(
        [...group.perCurrency.entries()].map(([currency, cents]) => ({ cents, currency })),
        primaryCurrency,
      );
      if (group.category && hiddenIds.has(group.category.id)) {
        hidden.count += 1;
        hidden.total = converted === null || hidden.total === null ? null : hidden.total + converted.total;
        continue;
      }
      if (converted === null) grandTotal = null;
      else if (grandTotal !== null) grandTotal += converted.total;
      rows.push({
        category: group.category,
        count: group.count,
        totals: [...group.perCurrency.entries()].map(([currency, cents]) => ({ currency, total: fromCents(cents) })),
        convertedTotal: converted ? fromCents(converted.total) : null,
        share: null,
      });
    }
    if (grandTotal !== null && grandTotal > 0) {
      for (const row of rows) row.share = Number((((row.convertedTotal ?? 0) * 100) / fromCents(grandTotal)).toFixed(2));
    }
    rows.sort((a, b) => (b.convertedTotal ?? 0) - (a.convertedTotal ?? 0));

    return {
      from: query.from,
      to: query.to,
      type: query.type,
      primaryCurrency,
      convertedTotal: grandTotal === null ? null : fromCents(grandTotal),
      categories: rows,
      hidden: { count: hidden.count, convertedTotal: hidden.total === null ? null : fromCents(hidden.total) },
    };
  }

  /** Receitas × despesas por mês — base para gráfico de evolução. */
  async monthly(userId: string, query: MonthlyQueryDto): Promise<MonthlyResponseDto> {
    const months = monthsBetween(query.fromMonth, query.toMonth);
    const currencyOf = new Map((await this.walletsOf(userId)).map((wallet) => [wallet.id, wallet.currency]));
    const movements = await this.transactionMovements(userId, {
      from: monthRange(query.fromMonth).from,
      to: monthRange(query.toMonth).to,
    });
    const { primaryCurrency } = await this.deps.users.getPreferences(userId);

    const perMonth = new Map<string, Map<string, { income: number; expense: number }>>();
    for (const movement of movements) {
      const byCurrency = perMonth.get(monthOf(movement.date)) ?? new Map<string, { income: number; expense: number }>();
      const currency = currencyOf.get(movement.walletId)!;
      const totals = byCurrency.get(currency) ?? { income: 0, expense: 0 };
      if (movement.kind === "income") totals.income += movement.cents;
      else totals.expense += -movement.cents;
      byCurrency.set(currency, totals);
      perMonth.set(monthOf(movement.date), byCurrency);
    }

    const result: MonthlyResponseDto["months"] = [];
    for (const month of months) {
      const byCurrency = perMonth.get(month) ?? new Map<string, { income: number; expense: number }>();
      const converted = await this.convertTotals(
        new Map([...byCurrency.entries()].map(([currency, totals]) => [currency, { inflow: totals.income, outflow: totals.expense }])),
        primaryCurrency,
      );
      result.push({
        month,
        totals: [...byCurrency.entries()].map(([currency, totals]) => ({
          currency,
          income: fromCents(totals.income),
          expense: fromCents(totals.expense),
          net: fromCents(totals.income - totals.expense),
        })),
        converted: converted ? { income: converted.inflow, expense: converted.outflow, net: converted.net } : null,
      });
    }
    return { fromMonth: query.fromMonth, toMonth: query.toMonth, primaryCurrency, months: result };
  }
}
