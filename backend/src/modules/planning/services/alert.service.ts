import type { Clock } from "../../../infrastructure/clock.js";
import type { FinanceChangedEvent, PlanningChangedEvent } from "../../../infrastructure/events/domain-events.js";
import { addDays, monthOf, todayInTimeZone } from "../../../shared/utils/dates.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
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
  transactions: TransactionService;
  exchangeRates: ExchangeRateService;
  notifications: NotificationService;
  users: UserService;
  clock: Clock;
}

/** Transação incomum: histórico mínimo e janela. */
const UNUSUAL_MIN_SAMPLES = 5;
const UNUSUAL_WINDOW_DAYS = 90;

/**
 * Alertas de risco (R22, R74, R67, R78, R47) e meta atingida (R68). Assina os eventos do finance
 * e do planning e reavalia o usuário depois de cada mudança. É idempotente: cada
 * aviso tem uma chave de deduplicação, então reavaliar nunca repete a notificação.
 */
export class AlertService {
  constructor(private readonly deps: AlertServiceDeps) {}

  async onFinanceChanged(event: FinanceChangedEvent): Promise<void> {
    await this.evaluateBudgets(event.userId);
    await this.evaluateLowBalance(event.userId, event.walletIds);
    if (event.cause === "transaction.created" && event.origin === "user" && event.transactionId) {
      await this.evaluateUnusual(event.userId, event.transactionId);
    }
    // R68: uma receita vinculada pode ter sido editada ou restaurada e completado a meta.
    if (await this.deps.goals.hasActive(event.userId)) await this.deps.goals.markAchievedIfComplete(event.userId);
  }

  async onPlanningChanged(event: PlanningChangedEvent): Promise<void> {
    await this.evaluateBudgets(event.userId);
  }

  /**
   * R47: despesa registrada pelo usuário muito acima do habitual da categoria — maior que o dobro
   * da média e que média + 2 desvios-padrão das despesas dos 90 dias anteriores, com ao menos 5
   * amostras, tudo na moeda principal. Parcelas e ocorrências geradas não entram aqui.
   */
  async evaluateUnusual(userId: string, transactionId: string): Promise<void> {
    const { transactions, wallets, exchangeRates, users, notifications } = this.deps;
    const [transaction] = await transactions.getMany(userId, [transactionId]);
    if (!transaction || transaction.type !== "expense" || !transaction.category) return;
    const categoryId = transaction.category.id;

    const history = (
      await transactions.listMovements(userId, {
        from: addDays(transaction.date, -UNUSUAL_WINDOW_DAYS),
        to: addDays(transaction.date, -1),
        type: "expense",
      })
    ).filter((movement) => movement.category?.id === categoryId);
    if (history.length < UNUSUAL_MIN_SAMPLES) return;

    const { primaryCurrency } = await users.getPreferences(userId);
    const currencyOf = new Map((await wallets.listForReports(userId)).map((wallet) => [wallet.id, wallet.currency]));
    const toPrimary = async (cents: number, currency: string) =>
      (await exchangeRates.tryConvertMany([{ cents, currency }], primaryCurrency))?.total ?? null;

    const samples: number[] = [];
    for (const movement of history) {
      const value = await toPrimary(movement.amountCents, currencyOf.get(movement.walletId)!);
      if (value === null) return;
      samples.push(value);
    }
    const value = await toPrimary(Math.round(transaction.amount * 100), transaction.currency);
    if (value === null) return;

    const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
    const deviation = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / samples.length);
    if (value <= 2 * mean || value <= mean + 2 * deviation) return;

    await notifications.notify({
      userId,
      kind: "unusual_transaction",
      ...alertMessages.unusualTransaction(transaction.category.name),
      entityType: "transaction",
      entityId: transaction.id,
      data: { categoryId },
      dedupeKey: `unusual:${transaction.id}`,
    });
  }

  /** R78: carteira abaixo do saldo mínimo — no máximo um aviso por carteira por dia. */
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
