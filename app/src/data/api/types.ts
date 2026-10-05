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
}

export interface UpdateWalletRequest {
  name?: string;
  type?: WalletType;
  currency?: string;
  initialBalance?: number;
  isDefault?: true;
}

// ---------- categorias e tags ----------

export interface Category {
  id: string;
  name: string;
  /** null = aceita receitas e despesas. */
  type: TransactionType | null;
  predefined: boolean;
  systemKey: string | null;
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

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string;
  description: string;
  wallet: { id: string; name: string; currency: string };
  category: { id: string; name: string; predefined: boolean } | null;
  tags: { id: string; name: string }[];
  archived: boolean;
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
}

export interface UpdateTransactionRequest {
  type?: TransactionType;
  amount?: number;
  description?: string;
  date?: string;
  walletId?: string;
  categoryId?: string | null;
  tags?: string[];
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
  entityType: "transaction" | "transfer";
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
