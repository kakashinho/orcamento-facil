import type { Clock } from "../../../infrastructure/clock.js";
import type { FinanceChangedEvent, PlanningChangedEvent } from "../../../infrastructure/events/domain-events.js";
import { monthOf, todayInTimeZone } from "../../../shared/utils/dates.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { WalletService } from "../../finance/services/wallet.service.js";
import type { NotificationService } from "../../notifications/services/notification.service.js";
import { BUDGET_WARNING_PERCENT } from "../types/budget.types.js";
import { alertMessages } from "./alert-messages.js";
import type { BudgetService } from "./budget.service.js";
import type { GoalService } from "./goal.service.js";
import type { ReductionGoalService } from "./reduction-goal.service.js";

export interface AlertServiceDeps {
  budgets: BudgetService;
  reductions: ReductionGoalService;
  goals: GoalService;
  wallets: WalletService;
  notifications: NotificationService;
  users: UserService;
  clock: Clock;
}

/**
 * Alertas de risco (R22, R74, R67). Assina os eventos do finance e do planning (ADR-S2-003) e
 * reavalia os orçamentos do usuário depois de cada mudança. É idempotente: cada limiar tem uma
 * chave de deduplicação por orçamento e período, então reavaliar nunca repete o aviso (D-31).
 */
export class AlertService {
  constructor(private readonly deps: AlertServiceDeps) {}

  async onFinanceChanged(event: FinanceChangedEvent): Promise<void> {
    await this.evaluateBudgets(event.userId);
    await this.evaluateLowBalance(event.userId, event.walletIds);
    // R68: uma receita vinculada pode ter sido editada ou restaurada e completado a meta.
    if (await this.deps.goals.hasActive(event.userId)) await this.deps.goals.markAchievedIfComplete(event.userId);
  }

  async onPlanningChanged(event: PlanningChangedEvent): Promise<void> {
    await this.evaluateBudgets(event.userId);
  }

  /** R78: carteira abaixo do saldo mínimo — no máximo um aviso por carteira por dia (D-34). */
  async evaluateLowBalance(userId: string, walletIds: string[]): Promise<void> {
    const below = await this.deps.wallets.listBelowMinimum(userId, walletIds.length > 0 ? walletIds : undefined);
    if (below.length === 0) return;
    const { timezone } = await this.deps.users.getPreferences(userId);
    const today = todayInTimeZone(this.deps.clock.now(), timezone);
    for (const wallet of below) {
      await this.deps.notifications.notify({
        userId,
        kind: "low_balance",
        ...alertMessages.lowBalance(wallet.name),
        entityType: "wallet",
        entityId: wallet.id,
        data: { date: today },
        dedupeKey: `low-balance:${wallet.id}:${today}`,
      });
    }
  }

  /** R22 (80% e 100% do mês), R74 (limite do dia) e R67 (alvo de redução do mês). */
  async evaluateBudgets(userId: string): Promise<void> {
    const { budgets, reductions, notifications, users, clock } = this.deps;
    const [hasBudgets, hasReductions] = await Promise.all([budgets.hasAny(userId), reductions.hasAny(userId)]);
    if (!hasBudgets && !hasReductions) return;

    const { timezone } = await users.getPreferences(userId);
    const today = todayInTimeZone(clock.now(), timezone);
    const month = monthOf(today);

    if (hasBudgets) {
      const status = await budgets.statusFor(userId, month, today);
      for (const item of status.monthly) {
        if (item.percent === null) continue;
        const data = { month, categoryId: item.category.id, percent: item.percent };
        if (item.percent >= BUDGET_WARNING_PERCENT) {
          await notifications.notify({
            userId,
            kind: "budget_warning",
            ...alertMessages.budgetWarning(item.category.name),
            entityType: "budget",
            entityId: item.budgetId,
            data,
            dedupeKey: `budget:${item.budgetId}:${month}:80`,
          });
        }
        if (item.state === "exceeded") {
          await notifications.notify({
            userId,
            kind: "budget_exceeded",
            ...alertMessages.budgetExceeded(item.category.name),
            entityType: "budget",
            entityId: item.budgetId,
            data,
            dedupeKey: `budget:${item.budgetId}:${month}:100`,
          });
        }
      }
      for (const item of status.daily) {
        if (item.state !== "exceeded") continue;
        await notifications.notify({
          userId,
          kind: "daily_limit_exceeded",
          ...alertMessages.dailyLimitExceeded(item.category.name),
          entityType: "budget",
          entityId: item.budgetId,
          data: { date: today, categoryId: item.category.id, percent: item.percent },
          dedupeKey: `daily:${item.budgetId}:${today}`,
        });
      }
    }

    if (hasReductions) {
      for (const goal of await reductions.statusFor(userId, month)) {
        if (goal.state !== "exceeded") continue;
        await notifications.notify({
          userId,
          kind: "reduction_exceeded",
          ...alertMessages.reductionExceeded(goal.category.name),
          entityType: "reduction_goal",
          entityId: goal.id,
          data: { month, categoryId: goal.category.id, percent: goal.percent },
          dedupeKey: `reduction:${goal.id}:${month}`,
        });
      }
    }
  }
}
