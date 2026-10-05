import type {
  AuthResult,
  Category,
  Overview,
  Transaction,
  TransactionSummary,
  User,
  Wallet,
  WalletSummary,
  WalletWithConversion,
} from "@/data/api/types";

/** Dados de exemplo no formato exato das respostas da API. */
export const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "joao@orcamentofacil.app",
  username: "joao",
  role: "user",
  primaryCurrency: "BRL",
  timezone: "America/Sao_Paulo",
  theme: "system",
  createdAt: "2026-09-01T12:00:00.000Z",
};

export const authResult: AuthResult = {
  user,
  tokens: {
    tokenType: "Bearer",
    accessToken: "access-1",
    expiresIn: 900,
    refreshToken: "refresh-1",
    refreshTokenExpiresAt: "2026-11-01T12:00:00.000Z",
  },
};

export const categories: Category[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Alimentação",
    type: "expense",
    predefined: true,
    systemKey: "food",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Transporte",
    type: "expense",
    predefined: true,
    systemKey: "transport",
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    name: "Salário",
    type: "income",
    predefined: true,
    systemKey: "salary",
  },
  { id: "00000000-0000-4000-8000-000000000008", name: "Outros", type: null, predefined: true, systemKey: "other" },
];

export const wallet = (overrides: Partial<WalletWithConversion> = {}): WalletWithConversion => ({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Conta corrente",
  type: "checking",
  currency: "BRL",
  isDefault: true,
  balance: 1500,
  initialBalance: 1000,
  balanceInPrimaryCurrency: 1500,
  createdAt: "2026-09-01T12:00:00.000Z",
  updatedAt: "2026-09-01T12:00:00.000Z",
  ...overrides,
});

export const usdWallet = wallet({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Reserva Viagem",
  type: "savings",
  currency: "USD",
  isDefault: false,
  balance: 200,
  initialBalance: 200,
  balanceInPrimaryCurrency: 1084,
});

export const walletSummary = (wallets: WalletWithConversion[] = [wallet(), usdWallet]): WalletSummary => ({
  primaryCurrency: "BRL",
  totalBalance: wallets.reduce((sum, w) => sum + (w.balanceInPrimaryCurrency ?? 0), 0),
  ratesUpdatedAt: "2026-10-04T12:00:00.000Z",
  ratesStale: false,
  wallets,
});

export const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: "44444444-4444-4444-8444-444444444444",
  type: "expense",
  amount: 47.9,
  currency: "BRL",
  date: "2026-10-03",
  description: "Almoço",
  wallet: { id: wallet().id, name: wallet().name, currency: "BRL" },
  category: { id: categories[0].id, name: "Alimentação", predefined: true },
  tags: [{ id: "55555555-5555-4555-8555-555555555555", name: "trabalho" }],
  archived: false,
  createdAt: "2026-10-03T12:00:00.000Z",
  updatedAt: "2026-10-03T12:00:00.000Z",
  ...overrides,
});

export const summary = (overrides: Partial<TransactionSummary> = {}): TransactionSummary => ({
  count: 2,
  totals: [{ currency: "BRL", income: 6800, expense: 2200, net: 4600, count: 2 }],
  primaryCurrency: "BRL",
  converted: { income: 6800, expense: 2200, net: 4600, ratesUpdatedAt: null, ratesStale: false },
  ...overrides,
});

export const overview = (overrides: Partial<Overview> = {}): Overview => ({
  month: "2026-10",
  wallets: walletSummary(),
  monthSummary: summary(),
  topExpenseCategories: [
    {
      category: { id: categories[0].id, name: "Alimentação" },
      count: 3,
      totals: [{ currency: "BRL", total: 600 }],
      convertedTotal: 600,
      share: 60,
    },
  ],
  recentTransactions: [transaction()],
  ...overrides,
});

export function asWallet(w: WalletWithConversion): Wallet {
  const { balanceInPrimaryCurrency: _ignored, ...rest } = w;
  return rest;
}
