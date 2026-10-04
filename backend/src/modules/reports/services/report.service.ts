import type { Clock } from "../../../infrastructure/clock.js";
import { errors } from "../../../shared/errors/app-error.js";
import { monthOf, monthRange, monthsBetween } from "../../../shared/utils/dates.js";
import { fromCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { TransferService } from "../../finance/services/transfer.service.js";
import type { WalletService } from "../../finance/services/wallet.service.js";
import type { MovementRange } from "../../finance/types/transaction.types.js";
import type { Wallet } from "../../finance/types/wallet.types.js";
import type {
  ByCategoryQueryDto,
  ByCategoryResponseDto,
  CashFlowResponseDto,
  ConvertedTotalsDto,
  MonthlyQueryDto,
  MonthlyResponseDto,
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
  clock: Clock;
}

const MAX_PERIOD_DAYS = 366 * 5;

function byChronology(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time !== 0) return time;
  return a.referenceId < b.referenceId ? -1 : 1;
}

/**
 * Consultas e relatórios: extrato (R41), fluxo de caixa (R58) e agregações para gráficos.
 * Não acessa tabelas: consulta os dados pelos services públicos do finance e do auth.
 */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  private assertPeriod(from: string, to: string): void {
    if (from > to) throw errors.validation("A data inicial deve ser anterior ou igual à final.");
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_PERIOD_DAYS) {
      throw errors.validation("O período máximo de um relatório é de 5 anos.");
    }
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
    this.assertPeriod(query.from, query.to);
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
    this.assertPeriod(query.from, query.to);
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

  /** Totais por categoria no período — base para gráfico de pizza. */
  async byCategory(userId: string, query: ByCategoryQueryDto): Promise<ByCategoryResponseDto> {
    this.assertPeriod(query.from, query.to);
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

    const rows: ByCategoryResponseDto["categories"] = [];
    let grandTotal: number | null = 0;
    for (const group of groups.values()) {
      const converted = await this.deps.exchangeRates.tryConvertMany(
        [...group.perCurrency.entries()].map(([currency, cents]) => ({ cents, currency })),
        primaryCurrency,
      );
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
    };
  }

  /** Receitas × despesas por mês — base para gráfico de evolução. */
  async monthly(userId: string, query: MonthlyQueryDto): Promise<MonthlyResponseDto> {
    if (query.fromMonth > query.toMonth) throw errors.validation("O mês inicial deve ser anterior ou igual ao final.");
    const months = monthsBetween(query.fromMonth, query.toMonth);
    if (months.length > 36) throw errors.validation("O período máximo é de 36 meses.");
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
