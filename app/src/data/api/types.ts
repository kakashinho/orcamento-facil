/**
 * Contrato da API (DTOs), espelhando os schemas Zod do backend em
 * backend/src/modules/<módulo>/schemas. Valores monetários são números com até 2 casas
 * decimais na moeda da carteira; datas no formato AAAA-MM-DD; instantes em ISO 8601 (UTC).
 */

// ---------- comum ----------

export type TransactionType = "income" | "expense";
export type ThemePreference = "system" | "light" | "dark";
export type WalletType = "checking" | "savings" | "cash" | "investment" | "credit_card" | "other";
export type ArchivedFilter = "false" | "true" | "all";
export type SortKey = "date" | "amount" | "category";
export type SortOrder = "asc" | "desc";
export type Frequency = "weekly" | "monthly" | "yearly";

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface DataList<T> {
  data: T[];
}

export interface MessageResponse {
  message: string;
}

// ---------- autenticação e usuário ----------

export interface User {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  primaryCurrency: string;
  timezone: string;
  theme: ThemePreference;
  createdAt: string;
}

export interface AuthTokens {
  tokenType: "Bearer";
  accessToken: string;
  /** Validade do access token, em segundos. */
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResult {
  user: User;
  tokens: AuthTokens;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  primaryCurrency?: string;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface UpdateProfileRequest {
  username?: string;
  primaryCurrency?: string;
  timezone?: string;
  theme?: ThemePreference;
}

export interface BiometricCredential {
  id: string;
  deviceName: string;
  keyType: "rsa" | "ec";
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BiometricChallenge {
  credentialId: string;
  challenge: string;
  expiresAt: string;
}

// ---------- carteiras ----------

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  currency: string;
  isDefault: boolean;
  /** Saldo atual na moeda da carteira (R55). */
  balance: number;
  initialBalance: number;
  /** Avisar quando o saldo ficar abaixo deste valor (R78); null = sem aviso. */
  minBalance: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletWithConversion extends Wallet {
  balanceInPrimaryCurrency: number | null;
}

export interface WalletSummary {
  primaryCurrency: string;
  totalBalance: number | null;
  ratesUpdatedAt: string | null;
  ratesStale: boolean;
  wallets: WalletWithConversion[];
}

export interface CreateWalletRequest {
  name: string;
  type?: WalletType;
  currency?: string;
  initialBalance?: number;
  isDefault?: boolean;
  minBalance?: number | null;
}

export interface UpdateWalletRequest {
  name?: string;
  type?: WalletType;
  currency?: string;
  initialBalance?: number;
  isDefault?: true;
  minBalance?: number | null;
}

// ---------- categorias e tags ----------

export interface Category {
  id: string;
  name: string;
  /** null = aceita receitas e despesas. */
  type: TransactionType | null;
  predefined: boolean;
  systemKey: string | null;
  /** true = some dos gráficos e listas por categoria (R46). */
  hiddenInReports: boolean;
}

export interface CreateCategoryRequest {
  name: string;
  type?: TransactionType | null;
}

export interface CategorySuggestion {
  categoryId: string;
  name: string;
  confidence: number;
  reasons: string[];
}

export interface Tag {
  id: string;
  name: string;
  transactionCount: number;
}

// ---------- transações ----------

export type SeriesKind = "recurring" | "installment";

/** Recorrência (R37) ou parcelamento (R62) que gerou a transação. */
export interface TransactionSeriesInfo {
  id: string;
  kind: SeriesKind;
  frequency: Frequency;
  /** Número da ocorrência ou parcela (1, 2, …). */
  occurrence: number;
  /** Total de parcelas; null na recorrência. */
  total: number | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  description: string;
  /** Observações (R57). */
  notes: string | null;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string; predefined: boolean } | null;
  tags: { id: string; name: string }[];
  archived: boolean;
  series: TransactionSeriesInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  amount: number;
  description: string;
  date?: string;
  walletId?: string;
  categoryId?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface UpdateTransactionRequest {
  type?: TransactionType;
  amount?: number;
  description?: string;
  date?: string;
  walletId?: string;
  categoryId?: string | null;
  tags?: string[];
  notes?: string | null;
  archived?: boolean;
}

export interface TransactionFilters {
  q?: string;
  categoryId?: string;
  walletId?: string;
  type?: TransactionType;
  tag?: string;
  from?: string;
  to?: string;
  month?: string;
  archived?: ArchivedFilter;
}

export interface ListTransactionsQuery extends TransactionFilters {
  sort?: SortKey;
  order?: SortOrder;
  limit?: number;
  cursor?: string;
}

export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

export interface TransactionSummary {
  count: number;
  totals: CurrencyTotals[];
  primaryCurrency: string;
  converted: {
    income: number;
    expense: number;
    net: number;
    ratesUpdatedAt: string | null;
    ratesStale: boolean;
  } | null;
}

export interface TransactionMonth {
  month: string;
  count: number;
}

export interface ParsedTransaction {
  draft: { type: TransactionType; amount: number | null; date: string; description: string };
  suggestions: { categoryId: string; name: string; confidence: number }[];
}

// ---------- transferências ----------

export interface Transfer {
  id: string;
  sourceWallet: { id: string; name: string; currency: string };
  targetWallet: { id: string; name: string; currency: string };
  amount: number;
  targetAmount: number;
  exchangeRate: number | null;
  date: string;
  description: string | null;
  createdAt: string;
}

export interface CreateTransferRequest {
  sourceWalletId: string;
  targetWalletId: string;
  amount: number;
  targetAmount?: number;
  date?: string;
  description?: string;
}

// ---------- câmbio ----------

export interface Currency {
  code: string;
  name: string;
}

export interface CurrencyList {
  data: Currency[];
  updatedAt: string;
  stale: boolean;
}

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
  source: string;
  stale: boolean;
}

export interface Conversion {
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
  updatedAt: string;
  stale: boolean;
}

// ---------- histórico (desfazer) ----------

export interface HistoryEntry {
  id: string;
  action: string;
  label: string;
  entityType: "transaction" | "transfer" | "series";
  entityId: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoable: boolean;
}

export interface UndoResult {
  undone: Omit<HistoryEntry, "undoneAt" | "undoable">;
  message: string;
}

// ---------- relatórios ----------

export type MovementKind = "income" | "expense" | "transfer_in" | "transfer_out";

export interface CategoryTotals {
  category: { id: string; name: string } | null;
  count: number;
  totals: { currency: string; total: number }[];
  convertedTotal: number | null;
  share: number | null;
}

export interface Overview {
  month: string;
  wallets: WalletSummary;
  monthSummary: TransactionSummary;
  topExpenseCategories: CategoryTotals[];
  recentTransactions: Transaction[];
  /** Notificações não lidas (sino). */
  unreadNotifications: number;
}

export interface PeriodQuery {
  from: string;
  to: string;
  walletId?: string;
}

export interface StatementEntry {
  date: string;
  kind: MovementKind;
  referenceId: string;
  description: string;
  category: { id: string; name: string } | null;
  /** Com sinal: positivo entra, negativo sai. */
  amount: number;
  balance: number;
}

export interface Statement {
  from: string;
  to: string;
  generatedAt: string;
  wallets: {
    wallet: { id: string; name: string; currency: string; type: string };
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    closingBalance: number;
    entries: StatementEntry[];
  }[];
}

export interface CashFlowEntry {
  date: string;
  kind: MovementKind;
  referenceId: string;
  description: string;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string } | null;
  /** Com sinal: positivo entra, negativo sai. */
  amount: number;
}

export interface CashFlow {
  from: string;
  to: string;
  walletId: string | null;
  primaryCurrency: string;
  entries: CashFlowEntry[];
  totals: { currency: string; inflow: number; outflow: number; net: number }[];
  convertedTotal: {
    currency: string;
    inflow: number;
    outflow: number;
    net: number;
    ratesUpdatedAt: string | null;
    ratesStale: boolean;
  } | null;
}

export interface MonthlyReport {
  fromMonth: string;
  toMonth: string;
  primaryCurrency: string;
  months: {
    month: string;
    totals: { currency: string; income: number; expense: number; net: number }[];
    converted: { income: number; expense: number; net: number } | null;
  }[];
}

export interface ByCategoryQuery {
  from: string;
  to: string;
  type?: TransactionType;
  includeHidden?: boolean;
}

/** Totais por categoria (R13, R50); as ocultas (R46) ficam de fora e são contadas em `hidden`. */
export interface ByCategoryReport {
  from: string;
  to: string;
  type: TransactionType;
  primaryCurrency: string;
  convertedTotal: number | null;
  categories: CategoryTotals[];
  hidden: { count: number; convertedTotal: number | null };
}

export type Granularity = "day" | "month";

export interface BalanceEvolutionQuery {
  from: string;
  to: string;
  walletId?: string;
  granularity?: Granularity;
}

/** Evolução do saldo (R14). */
export interface BalanceEvolution {
  from: string;
  to: string;
  granularity: Granularity;
  currency: string;
  walletId: string | null;
  points: { date: string; balance: number | null }[];
  ratesStale: boolean;
}

/** Saldo médio diário (R35), economia do mês (R75) e as 10 maiores despesas (R36). */
export interface MonthIndicators {
  month: string;
  currency: string;
  days: number;
  averageDailyBalance: number | null;
  ratesStale: boolean;
  savings: {
    saved: number | null;
    previousAverage: number | null;
    previousMonths: string[];
    difference: number | null;
    differencePercent: number | null;
  };
  topExpenses: { transaction: Transaction; convertedAmount: number | null }[];
}

/** Projeção do saldo pelos lançamentos fixos (R63). */
export interface Projection {
  currency: string;
  startBalance: number | null;
  ratesStale: boolean;
  months: {
    month: string;
    openingBalance: number | null;
    expectedIncome: number | null;
    expectedExpense: number | null;
    closingBalance: number | null;
    items: {
      seriesId: string;
      description: string;
      kind: SeriesKind;
      type: TransactionType;
      date: string;
      amount: number | null;
    }[];
  }[];
}

// ---------- recorrências e parcelamentos (R37, R62) ----------

export type SeriesStatus = "active" | "ended" | "cancelled";

export interface Series {
  id: string;
  kind: SeriesKind;
  type: TransactionType;
  frequency: Frequency;
  description: string;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string } | null;
  /** Valor de cada ocorrência (no parcelamento, o das parcelas depois da 1ª). */
  amount: number;
  totalAmount: number | null;
  installments: number | null;
  startDate: string;
  endDate: string | null;
  nextDate: string | null;
  generatedCount: number;
  remaining: number | null;
  status: SeriesStatus;
  createdAt: string;
}

export interface SeriesDetail extends Series {
  occurrences: { occurrence: number; transactionId: string; date: string; amount: number }[];
}

export interface CreateRecurringRequest extends CreateTransactionRequest {
  frequency: Frequency;
  endDate?: string;
}

export interface CreateInstallmentsRequest {
  totalAmount: number;
  installments: number;
  date: string;
  description: string;
  walletId?: string;
  categoryId?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface UpdateSeriesRequest {
  amount?: number;
  description?: string;
  categoryId?: string | null;
  walletId?: string;
  endDate?: string | null;
}

export interface CreateSeriesResult {
  series: Series;
  /** Ocorrências já vencidas, criadas agora. */
  transactions: Transaction[];
}

// ---------- orçamentos e metas (R15–R17, R21, R23, R45, R67, R74) ----------

export type BudgetPeriod = "monthly" | "daily";
export type BudgetState = "ok" | "warning" | "exceeded";
export type CategoryRef = { id: string; name: string; predefined: boolean };

export interface Budget {
  id: string;
  category: CategoryRef;
  period: BudgetPeriod;
  amount: number;
  currency: string;
  validFrom: string;
  validTo: string | null;
}

export interface BudgetStatus {
  budgetId: string;
  category: CategoryRef;
  period: BudgetPeriod;
  currency: string;
  limit: number;
  spent: number | null;
  remaining: number | null;
  percent: number | null;
  state: BudgetState;
}

export interface BudgetStatusReport {
  month: string;
  date: string;
  monthly: BudgetStatus[];
  daily: BudgetStatus[];
}

export interface BudgetHistory {
  fromMonth: string;
  toMonth: string;
  months: { month: string; items: BudgetStatus[] }[];
}

export interface CreateBudgetRequest {
  categoryId: string;
  period: BudgetPeriod;
  amount: number;
}

export interface ReductionGoal {
  id: string;
  category: CategoryRef;
  percent: number;
  currency: string;
  baseline: number;
  target: number;
  month: string;
  spent: number | null;
  state: "on_track" | "exceeded";
  startMonth: string;
  endMonth: string | null;
}

export type GoalStatus = "active" | "achieved" | "cancelled";

export interface Goal {
  id: string;
  name: string;
  category: CategoryRef;
  targetAmount: number;
  currency: string;
  deadline: string;
  status: GoalStatus;
  achievedAt: string | null;
  saved: number | null;
  percent: number | null;
  remaining: number | null;
  daysLeft: number;
}

export interface GoalDetail extends Goal {
  contributions: {
    id: string;
    transaction: { id: string; date: string; description: string; amount: number; currency: string };
    amount: number;
    counted: number;
  }[];
}

export interface CreateGoalRequest {
  name: string;
  targetAmount: number;
  deadline: string;
  categoryId: string;
}

export type UpdateGoalRequest = Partial<CreateGoalRequest>;

export interface ContributionResult {
  contribution: {
    id: string;
    goalId: string;
    transactionId: string;
    amount: number;
    currency: string;
    createdAt: string;
  };
  goal: Goal;
  /** true = este vínculo completou a meta (o app celebra — R68). */
  achievedNow: boolean;
}

export interface TransactionContribution {
  id: string;
  goal: { id: string; name: string };
  amount: number;
}

// ---------- notificações e lembretes (R18, R22, R34, R47, R68, R78) ----------

export type NotificationKind =
  | "budget_warning"
  | "budget_exceeded"
  | "daily_limit_exceeded"
  | "reduction_exceeded"
  | "unusual_transaction"
  | "low_balance"
  | "goal_achieved"
  | "goal_deadline"
  | "daily_reminder"
  | "bill_reminder";

export type NotificationEntityType =
  "budget" | "reduction_goal" | "savings_goal" | "wallet" | "transaction" | "reminder";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Para onde o app navega ao tocar no aviso. */
  entityType: NotificationEntityType | null;
  entityId: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationSettings {
  dailyReminderEnabled: boolean;
  dailyReminderHour: number;
  goalRemindersEnabled: boolean;
  billRemindersEnabled: boolean;
  alertsPushEnabled: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  amount: number | null;
  currency: string | null;
  frequency: Frequency;
  nextDueDate: string;
  seriesId: string | null;
  active: boolean;
  lastNotifiedOn: string | null;
  createdAt: string;
}

export interface CreateReminderRequest {
  title?: string;
  nextDueDate?: string;
  frequency?: Frequency;
  amount?: number;
  /** Nasce de uma despesa recorrente: título, valor e vencimento vêm dela. */
  seriesId?: string;
}

export interface UpdateReminderRequest {
  title?: string;
  nextDueDate?: string;
  frequency?: Frequency;
  amount?: number | null;
  active?: boolean;
}

// ---------- anexos (R24, R25, R76) ----------

export type AttachmentKind = "photo" | "document" | "receipt";
export type AttachmentMimeType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  fileName: string;
  mimeType: AttachmentMimeType;
  sizeBytes: number;
  createdAt: string;
}

// ---------- sistema ----------

export interface SystemStatus {
  status: "ok";
  version: string;
  time: string;
  maintenance: { enabled: boolean; message: string | null };
}

export interface MaintenanceState {
  enabled: boolean;
  message: string | null;
  forced: boolean;
  updatedAt: string | null;
}
