import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { TransactionRunner } from "../../../infrastructure/database/client.js";
import type { DomainEvents } from "../../../infrastructure/events/domain-events.js";
import { errors, fieldIssue } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { addMonths, monthOf, monthRange, todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ReductionGoalRepository } from "../repositories/reduction-goal.repository.js";
import type {
  CreateReductionGoalRequestDto,
  ReductionGoalListResponseDto,
  ReductionGoalResponseDto,
} from "../schemas/reduction-goal.schema.js";
import { REDUCTION_BASELINE_MONTHS, type ReductionGoalRecord, reductionTarget } from "../types/reduction-goal.types.js";
import { type CategoryInfo, ExpenseTotals, type ExpenseTotalsDeps } from "./expense-totals.js";

export interface ReductionGoalServiceDeps extends ExpenseTotalsDeps {
  goals: ReductionGoalRepository;
  users: UserService;
  runner: TransactionRunner;
  clock: Clock;
  events?: DomainEvents;
}

/**
 * Metas de redução de gastos (R67): "gastar X% menos" numa categoria em relação à média dos 3
 * meses anteriores ao início. A base é calculada uma vez e congelada (D-32), para que lançamentos
 * antigos feitos depois não mudem a meta.
 */
export class ReductionGoalService {
  private readonly totals: ExpenseTotals;

  constructor(private readonly deps: ReductionGoalServiceDeps) {
    this.totals = new ExpenseTotals(deps);
  }

  private async currentMonth(userId: string): Promise<string> {
    const { timezone } = await this.deps.users.getPreferences(userId);
    return monthOf(todayInTimeZone(this.deps.clock.now(), timezone));
  }

  async create(userId: string, input: CreateReductionGoalRequestDto): Promise<ReductionGoalResponseDto> {
    const { goals, categories, users, runner, clock } = this.deps;
    const category = await categories.assertAssignable(userId, input.categoryId);
    if (category.type === "income") {
      throw errors.unprocessable("CATEGORY_NOT_EXPENSE", "Escolha uma categoria de despesa.", "categoryId");
    }
    const month = await this.currentMonth(userId);
    const { primaryCurrency } = await users.getPreferences(userId);
    const spent = await this.totals.expensesByCategory(
      userId,
      monthRange(addMonths(month, -REDUCTION_BASELINE_MONTHS)).from,
      monthRange(addMonths(month, -1)).to,
    );
    const total = await this.totals.convert(spent.get(category.id), primaryCurrency);
    if (total === null) {
      throw errors.serviceUnavailable(
        "EXCHANGE_RATE_UNAVAILABLE",
        "Não foi possível obter as cotações para calcular a média de gastos. Tente novamente em instantes.",
      );
    }
    const baselineCents = Math.round(total / REDUCTION_BASELINE_MONTHS);
    if (baselineCents <= 0) {
      throw errors.unprocessable("NO_BASELINE", "Não há gasto anterior nesta categoria para comparar.", "categoryId");
    }

    const now = clock.now();
    const record: ReductionGoalRecord = {
      id: randomUUID(),
      userId,
      categoryId: category.id,
      percent: input.percent,
      baselineCents,
      currency: primaryCurrency,
      baselineMonths: REDUCTION_BASELINE_MONTHS,
      startMonth: month,
      endMonth: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await runner.run(async (tx) => {
        if (await goals.findActive(userId, category.id, tx)) this.alreadyExists();
        await goals.insert(record, tx);
      });
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.alreadyExists();
      throw error;
    }
    this.deps.events?.publish({ type: "planning.changed", userId });
    const info = { id: category.id, name: category.name, predefined: category.userId === null };
    return this.toDto(record, info, month, await this.totals.expensesByCategory(userId, monthRange(month).from, monthRange(month).to));
  }

  private alreadyExists(): never {
    const message = "Esta categoria já tem uma meta de redução ativa.";
    throw errors.conflict("REDUCTION_GOAL_EXISTS", message, [fieldIssue("categoryId", message)]);
  }

  /** Contrato público para os alertas: atalho para quem não tem meta de redução. */
  hasAny(userId: string): Promise<boolean> {
    return this.deps.goals.hasAny(userId);
  }

  async list(userId: string, month?: string): Promise<ReductionGoalListResponseDto> {
    return { data: await this.statusFor(userId, month ?? (await this.currentMonth(userId))) };
  }

  /** Contrato público para os alertas (R22/R67): metas do mês com gasto e situação. */
  async statusFor(userId: string, month: string): Promise<ReductionGoalResponseDto[]> {
    const goals = await this.deps.goals.listInForce(userId, month);
    if (goals.length === 0) return [];
    const categories = await this.totals.categoryInfo(userId);
    const range = monthRange(month);
    const spent = await this.totals.expensesByCategory(userId, range.from, range.to);
    const result: ReductionGoalResponseDto[] = [];
    for (const goal of goals) {
      const category = categories.get(goal.categoryId);
      if (category) result.push(await this.toDto(goal, category, month, spent));
    }
    return result;
  }

  /** Encerra: deixa de valer a partir do mês atual (no mês de início, a meta é apagada). */
  async remove(userId: string, goalId: string): Promise<void> {
    const { goals, runner, clock } = this.deps;
    const month = await this.currentMonth(userId);
    await runner.run(async (tx) => {
      const goal = await goals.findOwned(userId, goalId, tx);
      if (!goal || goal.endMonth !== null) throw errors.notFound("Meta de redução");
      if (goal.startMonth === month) await goals.delete(goal.id, tx);
      else await goals.close(goal.id, addMonths(month, -1), clock.now(), tx);
    });
    this.deps.events?.publish({ type: "planning.changed", userId });
  }

  private async toDto(
    goal: ReductionGoalRecord,
    category: CategoryInfo,
    month: string,
    spentByCategory: Map<string, Map<string, number>>,
  ): Promise<ReductionGoalResponseDto> {
    const target = reductionTarget(goal.baselineCents, goal.percent);
    const spent = await this.totals.convert(spentByCategory.get(goal.categoryId), goal.currency);
    return {
      id: goal.id,
      category,
      percent: goal.percent,
      currency: goal.currency,
      baseline: fromCents(goal.baselineCents),
      target: fromCents(target),
      month,
      spent: spent === null ? null : fromCents(spent),
      state: spent !== null && spent > target ? "exceeded" : "on_track",
      startMonth: goal.startMonth,
      endMonth: goal.endMonth,
    };
  }
}
