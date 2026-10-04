import { and, asc, desc, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { categories, transactions, users, wallets } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { monthRange, monthsBetween, monthOf } from "../../shared/dates.js";
import { errors } from "../../shared/errors.js";
import { fromCents } from "../../shared/money.js";
import type { ExchangeRateService } from "../exchange-rates/exchange-rate.service.js";
import type { TransferService } from "../transfers/transfer.service.js";
import type { WalletType } from "../wallets/wallet.service.js";

export type MovementKind = "income" | "expense" | "transfer_in" | "transfer_out";

interface Movement {
  kind: MovementKind;
  referenceId: string;
  date: string;
  createdAt: Date;
  description: string;
  walletId: string;
  /** Efeito com sinal no saldo da carteira, em centavos. */
  cents: number;
  category: { id: string; name: string } | null;
}

interface WalletInfo {
  id: string;
  name: string;
  currency: string;
  type: WalletType;
  initialCents: number;
}

export interface StatementEntry {
  date: string;
  kind: MovementKind;
  referenceId: string;
  description: string;
  category: { id: string; name: string } | null;
  amount: number;
  balance: number;
}

export interface WalletStatement {
  wallet: { id: string; name: string; currency: string; type: WalletType };
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  entries: StatementEntry[];
}

export interface StatementReport {
  from: string;
  to: string;
  generatedAt: string;
  wallets: WalletStatement[];
}

export interface ConvertedTotals {
  currency: string;
  inflow: number;
  outflow: number;
  net: number;
  ratesUpdatedAt: string | null;
  ratesStale: boolean;
}

export interface CashFlowReport {
  from: string;
  to: string;
  walletId: string | null;
  primaryCurrency: string;
  entries: Array<{
    date: string;
    kind: MovementKind;
    referenceId: string;
    description: string;
    wallet: { id: string; name: string; currency: string };
    category: { id: string; name: string } | null;
    amount: number;
  }>;
  totals: Array<{ currency: string; inflow: number; outflow: number; net: number }>;
  convertedTotal: ConvertedTotals | null;
}

export interface CategoryReport {
  from: string;
  to: string;
  type: "income" | "expense";
  primaryCurrency: string;
  convertedTotal: number | null;
  categories: Array<{
    category: { id: string; name: string } | null;
    count: number;
    totals: Array<{ currency: string; total: number }>;
    convertedTotal: number | null;
    share: number | null;
  }>;
}

export interface MonthlyReport {
  fromMonth: string;
  toMonth: string;
  primaryCurrency: string;
  months: Array<{
    month: string;
    totals: Array<{ currency: string; income: number; expense: number; net: number }>;
    converted: { income: number; expense: number; net: number } | null;
  }>;
}

function byChronology(a: Movement, b: Movement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time !== 0) return time;
  return a.referenceId < b.referenceId ? -1 : 1;
}

/** Relatórios: extrato (R41), fluxo de caixa (R58) e agregações para gráficos (R01/R83). */
export class ReportService {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly exchangeRates: ExchangeRateService,
    private readonly transfers: TransferService,
  ) {}

  private async primaryCurrency(userId: string): Promise<string> {
    const [user] = await this.db.select({ currency: users.primaryCurrency }).from(users).where(eq(users.id, userId));
    if (!user) throw errors.notFound("Usuário");
    return user.currency;
  }

  private async loadWallets(userId: string, walletId?: string): Promise<WalletInfo[]> {
    const rows = await this.db
      .select()
      .from(wallets)
      .where(walletId ? and(eq(wallets.userId, userId), eq(wallets.id, walletId)) : eq(wallets.userId, userId))
      .orderBy(desc(wallets.isDefault), asc(wallets.createdAt), asc(wallets.id));
    if (walletId && rows.length === 0) throw errors.notFound("Carteira");
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency,
      type: row.type as WalletType,
      initialCents: this.cipher.decryptAmount(row.initialBalance, aad.walletInitialBalance(row.id)),
    }));
  }

  /**
   * Transações ativas (inclusive arquivadas: arquivar só tira da lista principal, o
   * movimento financeiro continua existindo) com valores decifrados.
   */
  private async loadTransactionMovements(
    userId: string,
    range: { from?: string; to?: string; before?: string; walletId?: string; type?: "income" | "expense" },
  ): Promise<Movement[]> {
    const conditions: SQL[] = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
    if (range.from) conditions.push(gte(transactions.date, range.from));
    if (range.to) conditions.push(lte(transactions.date, range.to));
    if (range.before) conditions.push(sql`${transactions.date} < ${range.before}`);
    if (range.walletId) conditions.push(eq(transactions.walletId, range.walletId));
    if (range.type) conditions.push(eq(transactions.type, range.type));
    const rows = await this.db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        date: transactions.date,
        createdAt: transactions.createdAt,
        description: transactions.description,
        walletId: transactions.walletId,
        categoryId: categories.id,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(...conditions));
    return rows.map((row) => {
      const cents = this.cipher.decryptAmount(row.amount, aad.transactionAmount(row.id));
      return {
        kind: row.type === "income" ? "income" : "expense",
        referenceId: row.id,
        date: row.date,
        createdAt: row.createdAt,
        description: row.description,
        walletId: row.walletId,
        cents: row.type === "income" ? cents : -cents,
        category: row.categoryId && row.categoryName ? { id: row.categoryId, name: row.categoryName } : null,
      };
    });
  }

  private async loadTransferMovements(
    userId: string,
    range: { from?: string; to?: string; before?: string },
    walletIds: Set<string>,
  ): Promise<Movement[]> {
    const list = await this.transfers.loadForReports(userId, range);
    const movements: Movement[] = [];
    for (const transfer of list) {
      const description = transfer.description ?? "Transferência entre carteiras";
      if (walletIds.has(transfer.sourceWalletId)) {
        movements.push({
          kind: "transfer_out",
          referenceId: transfer.id,
          date: transfer.date,
          createdAt: transfer.createdAt,
          description,
          walletId: transfer.sourceWalletId,
          cents: -transfer.sourceCents,
          category: null,
        });
      }
      if (walletIds.has(transfer.targetWalletId)) {
        movements.push({
          kind: "transfer_in",
          referenceId: transfer.id,
          date: transfer.date,
          createdAt: transfer.createdAt,
          description,
          walletId: transfer.targetWalletId,
          cents: transfer.targetCents,
          category: null,
        });
      }
    }
    return movements;
  }

  /** R41: extrato por carteira com saldo inicial, movimentos em ordem cronológica e saldo corrente. */
  async statement(userId: string, query: { from: string; to: string; walletId?: string | undefined }): Promise<StatementReport> {
    if (query.from > query.to) throw errors.validation("A data inicial deve ser anterior ou igual à final.");
    const walletList = await this.loadWallets(userId, query.walletId);
    const walletIds = new Set(walletList.map((wallet) => wallet.id));

    const before = [
      ...(await this.loadTransactionMovements(userId, { before: query.from, ...(query.walletId ? { walletId: query.walletId } : {}) })),
      ...(await this.loadTransferMovements(userId, { before: query.from }, walletIds)),
    ];
    const period = [
      ...(await this.loadTransactionMovements(userId, { from: query.from, to: query.to, ...(query.walletId ? { walletId: query.walletId } : {}) })),
      ...(await this.loadTransferMovements(userId, { from: query.from, to: query.to }, walletIds)),
    ].sort(byChronology);

    const sections = walletList.map((wallet) => {
      const opening =
        wallet.initialCents +
        before.filter((movement) => movement.walletId === wallet.id).reduce((sum, movement) => sum + movement.cents, 0);
      let running = opening;
      let totalIn = 0;
      let totalOut = 0;
      const entries: StatementEntry[] = [];
      for (const movement of period) {
        if (movement.walletId !== wallet.id) continue;
        running += movement.cents;
        if (movement.cents >= 0) totalIn += movement.cents;
        else totalOut += -movement.cents;
        entries.push({
          date: movement.date,
          kind: movement.kind,
          referenceId: movement.referenceId,
          description: movement.description,
          category: movement.category,
          amount: fromCents(movement.cents),
          balance: fromCents(running),
        });
      }
      return {
        wallet: { id: wallet.id, name: wallet.name, currency: wallet.currency, type: wallet.type },
        openingBalance: fromCents(opening),
        totalIn: fromCents(totalIn),
        totalOut: fromCents(totalOut),
        closingBalance: fromCents(running),
        entries,
      };
    });

    return { from: query.from, to: query.to, generatedAt: this.clock.now().toISOString(), wallets: sections };
  }

  private async convertTotals(
    perCurrency: Map<string, { inflow: number; outflow: number }>,
    target: string,
  ): Promise<ConvertedTotals | null> {
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
        const quoteIn = await this.exchangeRates.convert(totals.inflow, currency, target);
        const quoteOut = await this.exchangeRates.convert(totals.outflow, currency, target);
        inflow += quoteIn.cents;
        outflow += quoteOut.cents;
        updatedAt = quoteIn.quote.updatedAt;
        stale ||= quoteIn.quote.stale;
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
   * R58: fluxo de caixa — todas as entradas e saídas do período em ordem cronológica.
   * Sem carteira definida, transferências internas ficam de fora (não são receita nem despesa).
   */
  async cashFlow(userId: string, query: { from: string; to: string; walletId?: string | undefined }): Promise<CashFlowReport> {
    if (query.from > query.to) throw errors.validation("A data inicial deve ser anterior ou igual à final.");
    const walletList = await this.loadWallets(userId, query.walletId);
    const walletById = new Map(walletList.map((wallet) => [wallet.id, wallet]));
    const movements = [
      ...(await this.loadTransactionMovements(userId, { from: query.from, to: query.to, ...(query.walletId ? { walletId: query.walletId } : {}) })),
      ...(query.walletId
        ? await this.loadTransferMovements(userId, { from: query.from, to: query.to }, new Set([query.walletId]))
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

    const primaryCurrency = await this.primaryCurrency(userId);
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
      convertedTotal: perCurrency.size === 0
        ? { currency: primaryCurrency, inflow: 0, outflow: 0, net: 0, ratesUpdatedAt: null, ratesStale: false }
        : await this.convertTotals(perCurrency, primaryCurrency),
    };
  }

  /** Totais por categoria no período — base para gráfico de pizza. */
  async byCategory(
    userId: string,
    query: { from: string; to: string; type: "income" | "expense" },
  ): Promise<CategoryReport> {
    if (query.from > query.to) throw errors.validation("A data inicial deve ser anterior ou igual à final.");
    const walletList = await this.loadWallets(userId);
    const currencyOf = new Map(walletList.map((wallet) => [wallet.id, wallet.currency]));
    const movements = await this.loadTransactionMovements(userId, { from: query.from, to: query.to, type: query.type });
    const primaryCurrency = await this.primaryCurrency(userId);

    const groups = new Map<string, { category: { id: string; name: string } | null; count: number; perCurrency: Map<string, number> }>();
    for (const movement of movements) {
      const key = movement.category?.id ?? "none";
      const group = groups.get(key) ?? { category: movement.category, count: 0, perCurrency: new Map<string, number>() };
      const currency = currencyOf.get(movement.walletId)!;
      group.count += 1;
      group.perCurrency.set(currency, (group.perCurrency.get(currency) ?? 0) + Math.abs(movement.cents));
      groups.set(key, group);
    }

    const rows: CategoryReport["categories"] = [];
    let grandTotal: number | null = 0;
    for (const group of groups.values()) {
      const converted = await this.exchangeRates.tryConvertMany(
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
      for (const row of rows) {
        row.share = Number((((row.convertedTotal ?? 0) * 100) / fromCents(grandTotal)).toFixed(2));
      }
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

  /** Receitas x despesas por mês — base para gráfico de evolução. */
  async monthly(userId: string, query: { fromMonth: string; toMonth: string }): Promise<MonthlyReport> {
    if (query.fromMonth > query.toMonth) throw errors.validation("O mês inicial deve ser anterior ou igual ao final.");
    const months = monthsBetween(query.fromMonth, query.toMonth);
    if (months.length > 36) throw errors.validation("O período máximo é de 36 meses.");
    const walletList = await this.loadWallets(userId);
    const currencyOf = new Map(walletList.map((wallet) => [wallet.id, wallet.currency]));
    const movements = await this.loadTransactionMovements(userId, {
      from: monthRange(query.fromMonth).from,
      to: monthRange(query.toMonth).to,
    });
    const primaryCurrency = await this.primaryCurrency(userId);

    const perMonth = new Map<string, Map<string, { income: number; expense: number }>>();
    for (const movement of movements) {
      const month = monthOf(movement.date);
      const currency = currencyOf.get(movement.walletId)!;
      const byCurrency = perMonth.get(month) ?? new Map<string, { income: number; expense: number }>();
      const totals = byCurrency.get(currency) ?? { income: 0, expense: 0 };
      if (movement.kind === "income") totals.income += movement.cents;
      else totals.expense += -movement.cents;
      byCurrency.set(currency, totals);
      perMonth.set(month, byCurrency);
    }

    const result: MonthlyReport["months"] = [];
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
