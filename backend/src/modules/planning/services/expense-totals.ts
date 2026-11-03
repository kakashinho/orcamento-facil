import { monthOf } from "../../../shared/utils/dates.js";
import type { CategoryService } from "../../finance/services/category.service.js";
import type { ExchangeRateService } from "../../finance/services/exchange-rate.service.js";
import type { TransactionService } from "../../finance/services/transaction.service.js";
import type { WalletService } from "../../finance/services/wallet.service.js";

export interface CategoryInfo {
  id: string;
  name: string;
  predefined: boolean;
}

/** Centavos por moeda: despesas em carteiras de moedas diferentes só se somam depois de converter. */
export type CurrencyTotals = Map<string, number>;

export interface ExpenseTotalsDeps {
  categories: CategoryService;
  transactions: TransactionService;
  wallets: WalletService;
  exchangeRates: ExchangeRateService;
}

/**
 * Gasto por categoria a partir das despesas do finance (decifradas no repository dele), para
 * orçamentos e metas de redução. Inclui arquivadas (arquivar não apaga o gasto) e exclui as
 * excluídas, como os relatórios.
 */
export class ExpenseTotals {
  constructor(private readonly deps: ExpenseTotalsDeps) {}

  /** Categorias que o usuário enxerga (predefinidas + suas, sem as excluídas). */
  async categoryInfo(userId: string): Promise<Map<string, CategoryInfo>> {
    const { data } = await this.deps.categories.list(userId);
    return new Map(data.map((category) => [category.id, { id: category.id, name: category.name, predefined: category.predefined }]));
  }

  private async expenses(userId: string, from: string, to: string) {
    const currencyOf = new Map((await this.deps.wallets.listForReports(userId)).map((wallet) => [wallet.id, wallet.currency]));
    const movements = await this.deps.transactions.listMovements(userId, { from, to, type: "expense" });
    return movements
      .filter((movement) => movement.category !== null)
      .map((movement) => ({
        month: monthOf(movement.date),
        categoryId: movement.category!.id,
        currency: currencyOf.get(movement.walletId)!,
        cents: movement.amountCents,
      }));
  }

  /** Despesas do período por categoria e moeda. */
  async expensesByCategory(userId: string, from: string, to: string): Promise<Map<string, CurrencyTotals>> {
    const result = new Map<string, CurrencyTotals>();
    for (const expense of await this.expenses(userId, from, to)) {
      const totals = result.get(expense.categoryId) ?? new Map<string, number>();
      totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.cents);
      result.set(expense.categoryId, totals);
    }
    return result;
  }

  /** Despesas do período por mês "AAAA-MM", categoria e moeda — uma leitura para o histórico inteiro. */
  async expensesByMonthAndCategory(userId: string, from: string, to: string): Promise<Map<string, Map<string, CurrencyTotals>>> {
    const result = new Map<string, Map<string, CurrencyTotals>>();
    for (const expense of await this.expenses(userId, from, to)) {
      const byCategory = result.get(expense.month) ?? new Map<string, CurrencyTotals>();
      const totals = byCategory.get(expense.categoryId) ?? new Map<string, number>();
      totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.cents);
      byCategory.set(expense.categoryId, totals);
      result.set(expense.month, byCategory);
    }
    return result;
  }

  /** Soma convertida para `target`, em centavos; sem gasto = 0; null se faltar câmbio. */
  async convert(totals: CurrencyTotals | undefined, target: string): Promise<number | null> {
    if (!totals || totals.size === 0) return 0;
    const converted = await this.deps.exchangeRates.tryConvertMany(
      [...totals.entries()].map(([currency, cents]) => ({ cents, currency })),
      target,
    );
    return converted?.total ?? null;
  }
}
