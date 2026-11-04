import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { TransactionRunner } from "../../../infrastructure/database/client.js";
import { errors, fieldIssue } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { addDays, daysBetween, todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { CategoryService } from "../../finance/services/category.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { ContributionSource } from "../../finance/types/transaction.types.js";
import type { NotificationService } from "../../notifications/services/notification.service.js";
import type { GoalContributionRepository } from "../repositories/goal-contribution.repository.js";
import type { GoalRepository } from "../repositories/goal.repository.js";
import type {
  ContributionsByTransactionResponseDto,
  CreateContributionRequestDto,
  CreateContributionResponseDto,
  CreateGoalRequestDto,
  GoalDetailResponseDto,
  GoalListResponseDto,
  GoalResponseDto,
  ListGoalsQueryDto,
  UpdateGoalRequestDto,
} from "../schemas/goal.schema.js";
import type { ContributionRecord, GoalChanges, GoalRecord, GoalStatus } from "../types/goal.types.js";
import type { CategoryInfo } from "./expense-totals.js";

/** Lembretes de prazo (R18): 7 dias e 1 dia antes da data limite. */
const DEADLINE_REMINDER_DAYS = [7, 1] as const;

export interface GoalServiceDeps {
  goals: GoalRepository;
  contributions: GoalContributionRepository;
  categories: CategoryService;
  transactions: TransactionService;
  users: UserService;
  exchangeRates: ExchangeRateService;
  notifications: NotificationService;
  runner: TransactionRunner;
  clock: Clock;
}

interface Progress {
  savedCents: number | null;
  counted: Map<string, number>;
}

/**
 * Metas de economia (R15), progresso (R16), receitas destinadas (R17) e meta atingida (R68).
 * O dinheiro continua na carteira: a meta só registra quanto de cada receita foi destinado,
 * e o acumulado é calculado na leitura — editar, excluir ou desfazer a receita
 * muda o progresso sem acoplar o finance ao planning.
 */
export class GoalService {
  constructor(private readonly deps: GoalServiceDeps) {}

  private async today(userId: string): Promise<string> {
    const { timezone } = await this.deps.users.getPreferences(userId);
    return todayInTimeZone(this.deps.clock.now(), timezone);
  }

  private async categoryInfo(userId: string, categoryId: string): Promise<CategoryInfo> {
    const category = await this.deps.categories.findAssignable(userId, categoryId);
    return category
      ? { id: category.id, name: category.name, predefined: category.userId === null }
      : { id: categoryId, name: "Categoria excluída", predefined: false };
  }

  /** Categoria da meta: disponível e não exclusiva de receitas. */
  private async assertGoalCategory(userId: string, categoryId: string) {
    const category = await this.deps.categories.assertAssignable(userId, categoryId);
    if (category.type === "income") {
      throw errors.unprocessable(
        "CATEGORY_TYPE_MISMATCH",
        `A categoria "${category.name}" é de receitas. Escolha uma categoria de despesa para a meta.`,
        "categoryId",
      );
    }
    return category;
  }

  /** Acumulado: cada vínculo conta no máximo o valor atual da receita, se ela existir e for receita. */
  private async progress(goal: GoalRecord, contributions: ContributionRecord[], sources: Map<string, ContributionSource>): Promise<Progress> {
    const counted = new Map<string, number>();
    const perCurrency = new Map<string, number>();
    for (const contribution of contributions) {
      const source = sources.get(contribution.transactionId);
      const value = source && !source.deleted && source.type === "income" ? Math.min(contribution.amountCents, source.amountCents) : 0;
      counted.set(contribution.id, value);
      if (source && value > 0) perCurrency.set(source.currency, (perCurrency.get(source.currency) ?? 0) + value);
    }
    if (perCurrency.size === 0) return { savedCents: 0, counted };
    const converted = await this.deps.exchangeRates.tryConvertMany(
      [...perCurrency.entries()].map(([currency, cents]) => ({ cents, currency })),
      goal.currency,
    );
    return { savedCents: converted?.total ?? null, counted };
  }

  private async load(userId: string, goals: GoalRecord[]) {
    const contributions = await this.deps.contributions.listByGoals(goals.map((goal) => goal.id));
    const sources = new Map(
      (
        await this.deps.transactions.listContributionSources(
          userId,
          [...new Set(contributions.map((contribution) => contribution.transactionId))],
        )
      ).map((source) => [source.id, source]),
    );
    const byGoal = new Map<string, ContributionRecord[]>();
    for (const contribution of contributions) {
      byGoal.set(contribution.goalId, [...(byGoal.get(contribution.goalId) ?? []), contribution]);
    }
    return { byGoal, sources };
  }

  private toDto(goal: GoalRecord, category: CategoryInfo, progress: Progress, today: string): GoalResponseDto {
    const saved = progress.savedCents;
    return {
      id: goal.id,
      name: goal.name,
      category,
      targetAmount: fromCents(goal.targetCents),
      currency: goal.currency,
      deadline: goal.deadline,
      status: goal.status,
      achievedAt: goal.achievedAt ? goal.achievedAt.toISOString() : null,
      saved: saved === null ? null : fromCents(saved),
      percent: saved === null ? null : Math.round((saved / goal.targetCents) * 10_000) / 100,
      remaining: saved === null ? null : fromCents(Math.max(goal.targetCents - saved, 0)),
      daysLeft: Math.max(daysBetween(today, goal.deadline), 0),
    };
  }

  private async describe(userId: string, goal: GoalRecord): Promise<GoalResponseDto> {
    const { byGoal, sources } = await this.load(userId, [goal]);
    const progress = await this.progress(goal, byGoal.get(goal.id) ?? [], sources);
    return this.toDto(goal, await this.categoryInfo(userId, goal.categoryId), progress, await this.today(userId));
  }

  async list(userId: string, query: ListGoalsQueryDto): Promise<GoalListResponseDto> {
    const statuses: GoalStatus[] = query.status === "all" ? ["active", "achieved", "cancelled"] : [query.status];
    const goals = await this.deps.goals.list(userId, statuses);
    const { byGoal, sources } = await this.load(userId, goals);
    const today = await this.today(userId);
    const data: GoalResponseDto[] = [];
    for (const goal of goals) {
      const progress = await this.progress(goal, byGoal.get(goal.id) ?? [], sources);
      data.push(this.toDto(goal, await this.categoryInfo(userId, goal.categoryId), progress, today));
    }
    return { data };
  }

  async get(userId: string, goalId: string): Promise<GoalDetailResponseDto> {
    const goal = await this.deps.goals.findOwned(userId, goalId);
    if (!goal) throw errors.notFound("Meta");
    const { byGoal, sources } = await this.load(userId, [goal]);
    const contributions = byGoal.get(goal.id) ?? [];
    const progress = await this.progress(goal, contributions, sources);
    const base = this.toDto(goal, await this.categoryInfo(userId, goal.categoryId), progress, await this.today(userId));
    return {
      ...base,
      contributions: contributions
        .filter((contribution) => sources.has(contribution.transactionId))
        .map((contribution) => {
          const source = sources.get(contribution.transactionId)!;
          return {
            id: contribution.id,
            transaction: {
              id: source.id,
              date: source.date,
              description: source.description,
              amount: fromCents(source.amountCents),
              currency: source.currency,
            },
            amount: fromCents(contribution.amountCents),
            counted: fromCents(progress.counted.get(contribution.id) ?? 0),
          };
        }),
    };
  }

  async create(userId: string, input: CreateGoalRequestDto): Promise<GoalResponseDto> {
    const today = await this.today(userId);
    if (input.deadline < today) {
      throw errors.unprocessable("INVALID_DEADLINE", "A data limite não pode estar no passado.", "deadline");
    }
    const category = await this.assertGoalCategory(userId, input.categoryId);
    const { primaryCurrency } = await this.deps.users.getPreferences(userId);
    const now = this.deps.clock.now();
    const goal: GoalRecord = {
      id: randomUUID(),
      userId,
      name: input.name,
      categoryId: category.id,
      targetCents: toCents(input.targetAmount, "targetAmount"),
      currency: primaryCurrency,
      deadline: input.deadline,
      status: "active",
      achievedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.goals.insert(goal);
    return this.toDto(goal, { id: category.id, name: category.name, predefined: category.userId === null }, { savedCents: 0, counted: new Map() }, today);
  }

  async update(userId: string, goalId: string, input: UpdateGoalRequestDto): Promise<GoalResponseDto> {
    const goal = await this.deps.goals.findOwned(userId, goalId);
    if (!goal) throw errors.notFound("Meta");
    if (goal.status === "cancelled") this.notActive();
    const changes: GoalChanges = { updatedAt: this.deps.clock.now() };
    if (input.name !== undefined) changes.name = input.name;
    if (input.targetAmount !== undefined) changes.targetCents = toCents(input.targetAmount, "targetAmount");
    if (input.deadline !== undefined) {
      if (input.deadline < (await this.today(userId))) {
        throw errors.unprocessable("INVALID_DEADLINE", "A data limite não pode estar no passado.", "deadline");
      }
      changes.deadline = input.deadline;
    }
    if (input.categoryId !== undefined) changes.categoryId = (await this.assertGoalCategory(userId, input.categoryId)).id;
    await this.deps.goals.update(goal.id, changes);
    await this.markAchievedIfComplete(userId, goal.id);
    return this.describe(userId, (await this.deps.goals.findOwned(userId, goal.id))!);
  }

  async cancel(userId: string, goalId: string): Promise<void> {
    const goal = await this.deps.goals.findOwned(userId, goalId);
    if (!goal) throw errors.notFound("Meta");
    if (goal.status !== "cancelled") await this.deps.goals.setStatus(goal.id, "cancelled", goal.achievedAt, this.deps.clock.now());
  }

  private notActive(): never {
    throw errors.conflict("GOAL_NOT_ACTIVE", "Esta meta foi cancelada e não pode ser alterada.");
  }

  /** R17: destina uma receita (toda ou parte) à meta. A soma dos vínculos não passa do valor dela. */
  async addContribution(userId: string, goalId: string, input: CreateContributionRequestDto): Promise<CreateContributionResponseDto> {
    const { goals, contributions, transactions, runner, clock } = this.deps;
    const [source] = await transactions.listContributionSources(userId, [input.transactionId]);
    if (!source || source.deleted) throw errors.notFound("Transação");
    if (source.type !== "income") {
      throw errors.unprocessable("CONTRIBUTION_NOT_INCOME", "Só receitas podem ser destinadas a uma meta.", "transactionId");
    }

    const record = await (async () => {
      try {
        return await runner.run(async (tx) => {
          const goal = await goals.findOwned(userId, goalId, tx, true);
          if (!goal) throw errors.notFound("Meta");
          if (goal.status === "cancelled") this.notActive();
          const existing = await contributions.listByTransaction(userId, source.id, tx);
          if (existing.some((contribution) => contribution.goalId === goal.id)) this.contributionExists();
          const available = source.amountCents - existing.reduce((sum, contribution) => sum + contribution.amountCents, 0);
          const amountCents = input.amount === undefined ? available : toCents(input.amount);
          if (available <= 0 || amountCents > available) {
            const message =
              available <= 0
                ? "Esta receita já foi toda destinada a outras metas."
                : `O valor passa do que resta da receita (${fromCents(available).toFixed(2)}).`;
            throw errors.unprocessable("CONTRIBUTION_EXCEEDS_TRANSACTION", message, "amount");
          }
          const contribution: ContributionRecord = {
            id: randomUUID(),
            goalId: goal.id,
            userId,
            transactionId: source.id,
            amountCents,
            createdAt: clock.now(),
          };
          await contributions.insert(contribution, tx);
          return contribution;
        });
      } catch (error) {
        if (error instanceof DuplicateEntryError) this.contributionExists();
        throw error;
      }
    })();

    const achieved = await this.markAchievedIfComplete(userId, goalId);
    const goal = (await goals.findOwned(userId, goalId))!;
    return {
      contribution: {
        id: record.id,
        goalId,
        transactionId: record.transactionId,
        amount: fromCents(record.amountCents),
        currency: source.currency,
        createdAt: record.createdAt.toISOString(),
      },
      goal: await this.describe(userId, goal),
      achievedNow: achieved.includes(goalId),
    };
  }

  private contributionExists(): never {
    const message = "Esta receita já está vinculada a esta meta.";
    throw errors.conflict("CONTRIBUTION_EXISTS", message, [fieldIssue("transactionId", message)]);
  }

  async removeContribution(userId: string, goalId: string, contributionId: string): Promise<void> {
    if (!(await this.deps.contributions.delete(userId, goalId, contributionId))) throw errors.notFound("Vínculo");
  }

  /** Para os detalhes da transação: a quais metas a receita foi destinada. */
  async contributionsByTransaction(userId: string, transactionId: string): Promise<ContributionsByTransactionResponseDto> {
    const list = await this.deps.contributions.listByTransaction(userId, transactionId);
    const data: ContributionsByTransactionResponseDto["data"] = [];
    for (const contribution of list) {
      const goal = await this.deps.goals.findOwned(userId, contribution.goalId);
      if (goal) data.push({ id: contribution.id, goal: { id: goal.id, name: goal.name }, amount: fromCents(contribution.amountCents) });
    }
    return { data };
  }

  /**
   * R68: marca como atingidas as metas ativas que chegaram a 100% e avisa uma única vez.
   * Chamado depois de cada vínculo e, pelos alertas, depois de mudanças no finance. Devolve os
   * ids das metas recém-atingidas.
   */
  async markAchievedIfComplete(userId: string, goalId?: string): Promise<string[]> {
    const active = (await this.deps.goals.list(userId, ["active"])).filter((goal) => goalId === undefined || goal.id === goalId);
    if (active.length === 0) return [];
    const { byGoal, sources } = await this.load(userId, active);
    const achieved: string[] = [];
    for (const goal of active) {
      const { savedCents } = await this.progress(goal, byGoal.get(goal.id) ?? [], sources);
      if (savedCents === null || savedCents < goal.targetCents) continue;
      const now = this.deps.clock.now();
      await this.deps.goals.setStatus(goal.id, "achieved", now, now);
      achieved.push(goal.id);
      await this.deps.notifications.notify({
        userId,
        kind: "goal_achieved",
        title: "Meta atingida!",
        body: `Você completou a meta “${goal.name}”.`,
        entityType: "savings_goal",
        entityId: goal.id,
        dedupeKey: `goal:${goal.id}:achieved`,
      });
    }
    return achieved;
  }

  /** Contrato público para os alertas: atalho para quem não tem meta ativa. */
  async hasActive(userId: string): Promise<boolean> {
    return (await this.deps.goals.list(userId, ["active"])).length > 0;
  }

  /**
   * R18 (vencimento de metas): avisa 7 dias e 1 dia antes da data limite das metas ativas.
   * Tarefa agendada; idempotente pela chave de deduplicação. Respeita a preferência do usuário.
   */
  async remindDeadlines(now: Date): Promise<{ processed: number }> {
    const { goals, users, notifications } = this.deps;
    // Fusos diferentes: considera as datas de hoje ± 1 dia e confere no fuso de cada dono.
    const utcToday = now.toISOString().slice(0, 10);
    const candidates = new Set<string>();
    for (const days of DEADLINE_REMINDER_DAYS) {
      for (const shift of [-1, 0, 1]) candidates.add(addDays(utcToday, days + shift));
    }
    const due = await goals.listActiveByDeadlines([...candidates]);
    const settings = await notifications.getSettingsMany([...new Set(due.map((goal) => goal.userId))]);
    let processed = 0;
    for (const goal of due) {
      if (!settings.get(goal.userId)?.goalRemindersEnabled) continue;
      const { timezone } = await users.getPreferences(goal.userId);
      const left = daysBetween(todayInTimeZone(now, timezone), goal.deadline);
      if (!DEADLINE_REMINDER_DAYS.includes(left as (typeof DEADLINE_REMINDER_DAYS)[number])) continue;
      const created = await notifications.notify({
        userId: goal.userId,
        kind: "goal_deadline",
        title: "Meta perto do prazo",
        body: left === 1 ? `A meta “${goal.name}” vence amanhã.` : `Faltam ${left} dias para a meta “${goal.name}”.`,
        entityType: "savings_goal",
        entityId: goal.id,
        data: { daysLeft: left },
        dedupeKey: `goal-deadline:${goal.id}:${left}`,
      });
      if (created) processed += 1;
    }
    return { processed };
  }
}
