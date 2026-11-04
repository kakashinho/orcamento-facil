import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { TransactionRunner } from "../../../infrastructure/database/client.js";
import type { DomainEvents } from "../../../infrastructure/events/domain-events.js";
import { errors, fieldIssue } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { addMonths, monthOf, monthRange, monthsBetween, todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { CategoryService } from "../../finance/services/category.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { WalletService } from "../../finance/services/wallet.service.js";
import type { BudgetRepository } from "../repositories/budget.repository.js";
import type {
  BudgetHistoryQueryDto,
  BudgetHistoryResponseDto,
  BudgetListResponseDto,
  BudgetResponseDto,
  BudgetStatusItemDto,
  BudgetStatusQueryDto,
  BudgetStatusResponseDto,
  CreateBudgetRequestDto,
  UpdateBudgetRequestDto,
} from "../schemas/budget.schema.js";
import { type BudgetRecord, budgetState } from "../types/budget.types.js";
import { type CategoryInfo, ExpenseTotals } from "./expense-totals.js";

export interface BudgetServiceDeps {
  budgets: BudgetRepository;
  categories: CategoryService;
  transactions: TransactionService;
  wallets: WalletService;
  users: UserService;
  exchangeRates: ExchangeRateService;
  runner: TransactionRunner;
  clock: Clock;
  /** Opcional: avisa os alertas quando um orçamento muda. */
  events?: DomainEvents;
}

function toBudgetResponseDto(budget: BudgetRecord, category: CategoryInfo): BudgetResponseDto {
  return {
    id: budget.id,
    category,
    period: budget.period,
    amount: fromCents(budget.amountCents),
    currency: budget.currency,
    validFrom: budget.validFrom,
    validTo: budget.validTo,
  };
}

/** Ordem de exibição: mais perto (ou além) do limite primeiro; sem câmbio por último. */
function byPercentDesc(a: BudgetStatusItemDto, b: BudgetStatusItemDto): number {
  return (b.percent ?? -1) - (a.percent ?? -1) || a.category.name.localeCompare(b.category.name, "pt-BR");
}

/**
 * Orçamentos por categoria (R21), limites diários (R74), histórico (R23) e orçado × gasto (R45).
 * Cada orçamento vale de um mês em diante até mudar. O gasto vem das despesas do
 * finance, decifradas e convertidas para a moeda do orçamento.
 */
export class BudgetService {
  private readonly totals: ExpenseTotals;

  constructor(private readonly deps: BudgetServiceDeps) {
    this.totals = new ExpenseTotals(deps);
  }

  private async today(userId: string): Promise<string> {
    const { timezone } = await this.deps.users.getPreferences(userId);
    return todayInTimeZone(this.deps.clock.now(), timezone);
  }

  private changed(userId: string): void {
    this.deps.events?.publish({ type: "planning.changed", userId });
  }

  /** Contrato público para os alertas: atalho para quem não tem orçamento nenhum. */
  hasAny(userId: string): Promise<boolean> {
    return this.deps.budgets.hasAny(userId);
  }

  async list(userId: string, month?: string): Promise<BudgetListResponseDto> {
    const target = month ?? monthOf(await this.today(userId));
    const categories = await this.totals.categoryInfo(userId);
    const data = (await this.deps.budgets.listInForce(userId, target))
      .filter((budget) => categories.has(budget.categoryId))
      .map((budget) => toBudgetResponseDto(budget, categories.get(budget.categoryId)!))
      .sort((a, b) => a.period.localeCompare(b.period) || a.category.name.localeCompare(b.category.name, "pt-BR"));
    return { data };
  }

  async create(userId: string, input: CreateBudgetRequestDto): Promise<BudgetResponseDto> {
    const { budgets, categories, users, runner, clock } = this.deps;
    const category = await categories.assertAssignable(userId, input.categoryId);
    if (category.type === "income") {
      throw errors.unprocessable("CATEGORY_NOT_EXPENSE", "Escolha uma categoria de despesa.", "categoryId");
    }
    const { primaryCurrency } = await users.getPreferences(userId);
    const now = clock.now();
    const record: BudgetRecord = {
      id: randomUUID(),
      userId,
      categoryId: category.id,
      period: input.period,
      amountCents: toCents(input.amount),
      currency: primaryCurrency,
      validFrom: monthOf(await this.today(userId)),
      validTo: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await runner.run(async (tx) => {
        if (await budgets.findActive(userId, category.id, input.period, tx)) this.alreadyExists(input.period);
        await budgets.insert(record, tx);
      });
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.alreadyExists(input.period);
      throw error;
    }
    this.changed(userId);
    return toBudgetResponseDto(record, { id: category.id, name: category.name, predefined: category.userId === null });
  }

  private alreadyExists(period: BudgetRecord["period"]): never {
    const message =
      period === "monthly"
        ? "Esta categoria já tem um orçamento mensal em vigor. Altere o valor dele."
        : "Esta categoria já tem um limite diário em vigor. Altere o valor dele.";
    throw errors.conflict("BUDGET_ALREADY_EXISTS", message, [fieldIssue("categoryId", message)]);
  }

  /**
   * Novo limite a partir do mês atual. Se o orçamento começou neste mês, só muda o valor; senão,
   * a vigência atual termina no mês anterior e uma nova começa agora (o histórico guarda os dois).
   */
  async update(userId: string, budgetId: string, input: UpdateBudgetRequestDto): Promise<BudgetResponseDto> {
    const { budgets, runner, clock } = this.deps;
    const month = monthOf(await this.today(userId));
    const amountCents = toCents(input.amount);
    const result = await runner.run(async (tx) => {
      const current = await budgets.findOwned(userId, budgetId, tx, true);
      if (!current || current.validTo !== null) throw errors.notFound("Orçamento");
      const now = clock.now();
      if (current.validFrom === month) {
        await budgets.updateAmount(current.id, amountCents, now, tx);
        return { ...current, amountCents, updatedAt: now };
      }
      await budgets.close(current.id, addMonths(month, -1), now, tx);
      const next: BudgetRecord = { ...current, id: randomUUID(), amountCents, validFrom: month, createdAt: now, updatedAt: now };
      await budgets.insert(next, tx);
      return next;
    });
    const category = (await this.totals.categoryInfo(userId)).get(result.categoryId);
    this.changed(userId);
    return toBudgetResponseDto(result, category ?? { id: result.categoryId, name: "", predefined: false });
  }

  /** Encerra: deixa de valer a partir do mês atual; meses anteriores ficam no histórico. */
  async remove(userId: string, budgetId: string): Promise<void> {
    const { budgets, runner, clock } = this.deps;
    const month = monthOf(await this.today(userId));
    await runner.run(async (tx) => {
      const current = await budgets.findOwned(userId, budgetId, tx, true);
      if (!current || current.validTo !== null) throw errors.notFound("Orçamento");
      if (current.validFrom === month) await budgets.delete(current.id, tx);
      else await budgets.close(current.id, addMonths(month, -1), clock.now(), tx);
    });
    this.changed(userId);
  }

  /** Limites mensais do mês × gasto do mês; limites diários × gasto do dia (R21, R45, R74). */
  async status(userId: string, query: BudgetStatusQueryDto): Promise<BudgetStatusResponseDto> {
    const today = await this.today(userId);
    const month = query.month ?? monthOf(query.date ?? today);
    const date = query.date ?? today;
    return this.statusFor(userId, month, date);
  }

  /** Contrato público para os alertas (R22, R74). */
  async statusFor(userId: string, month: string, date: string): Promise<BudgetStatusResponseDto> {
    const categories = await this.totals.categoryInfo(userId);
    const monthlyBudgets = (await this.deps.budgets.listInForce(userId, month)).filter(
      (budget) => budget.period === "monthly" && categories.has(budget.categoryId),
    );
    const dailyBudgets = (await this.deps.budgets.listInForce(userId, monthOf(date))).filter(
      (budget) => budget.period === "daily" && categories.has(budget.categoryId),
    );

    const monthly: BudgetStatusItemDto[] = [];
    if (monthlyBudgets.length > 0) {
      const range = monthRange(month);
      const spent = await this.totals.expensesByCategory(userId, range.from, range.to);
      for (const budget of monthlyBudgets) {
        monthly.push(await this.statusItem(budget, categories.get(budget.categoryId)!, spent));
      }
    }
    const daily: BudgetStatusItemDto[] = [];
    if (dailyBudgets.length > 0) {
      const spent = await this.totals.expensesByCategory(userId, date, date);
      for (const budget of dailyBudgets) {
        daily.push(await this.statusItem(budget, categories.get(budget.categoryId)!, spent));
      }
    }
    return { month, date, monthly: monthly.sort(byPercentDesc), daily: daily.sort(byPercentDesc) };
  }

  /** R23: para cada mês, os limites mensais que valiam nele e o gasto real. */
  async history(userId: string, query: BudgetHistoryQueryDto): Promise<BudgetHistoryResponseDto> {
    const categories = await this.totals.categoryInfo(userId);
    const months = monthsBetween(query.fromMonth, query.toMonth);
    const records = (await this.deps.budgets.listInRange(userId, query.fromMonth, query.toMonth)).filter(
      (budget) => budget.period === "monthly" && categories.has(budget.categoryId),
    );
    const byMonth = await this.totals.expensesByMonthAndCategory(
      userId,
      monthRange(query.fromMonth).from,
      monthRange(query.toMonth).to,
    );

    const result: BudgetHistoryResponseDto["months"] = [];
    for (const month of months) {
      const inForce = records.filter((budget) => budget.validFrom <= month && (budget.validTo === null || budget.validTo >= month));
      const items: BudgetStatusItemDto[] = [];
      for (const budget of inForce) {
        items.push(await this.statusItem(budget, categories.get(budget.categoryId)!, byMonth.get(month) ?? new Map()));
      }
      result.push({ month, items: items.sort(byPercentDesc) });
    }
    return { fromMonth: query.fromMonth, toMonth: query.toMonth, months: result };
  }

  private async statusItem(
    budget: BudgetRecord,
    category: CategoryInfo,
    spentByCategory: Map<string, Map<string, number>>,
  ): Promise<BudgetStatusItemDto> {
    const spentCents = await this.totals.convert(spentByCategory.get(budget.categoryId), budget.currency);
    const base = {
      budgetId: budget.id,
      category,
      period: budget.period,
      currency: budget.currency,
      limit: fromCents(budget.amountCents),
    };
    if (spentCents === null) return { ...base, spent: null, remaining: null, percent: null, state: "ok" };
    return {
      ...base,
      spent: fromCents(spentCents),
      remaining: fromCents(budget.amountCents - spentCents),
      percent: Math.round((spentCents / budget.amountCents) * 1000) / 10,
      state: budgetState(spentCents, budget.amountCents),
    };
  }
}
