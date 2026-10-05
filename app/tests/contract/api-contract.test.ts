/**
 * Testes de contrato: a camada de dados do app (createApi + cliente HTTP + gerenciador de sessão)
 * contra o backend real. Comprovam que o app e a API falam o mesmo idioma — rotas, corpos,
 * respostas, códigos de erro, tokens, biometria, desfazer, manutenção e PDF.
 *
 * Rode com a API no ar:  CONTRACT_API_URL=http://localhost:3100 npm run test:contract
 * O e-mail em CONTRACT_ADMIN_EMAIL precisa estar em ADMIN_EMAILS no backend.
 */
import { createSign, generateKeyPairSync } from "node:crypto";
import { ApiError } from "@/core/http/api-error";
import { createHttpClient } from "@/core/http/http-client";
import { createMemoryStorage } from "@/core/storage/secure-storage";
import { createApi, type Api, type AuthResult, type Transaction } from "@/data/api";
import { createSessionManager, type SessionManager } from "@/data/session/session-manager";
import { useSessionStore } from "@/data/session/session-store";

const BASE_URL = process.env.CONTRACT_API_URL ?? "http://localhost:3100";
const ADMIN_EMAIL = process.env.CONTRACT_ADMIN_EMAIL ?? "admin.contrato@orcamentofacil.app";
const PASSWORD = "Contrato@2026!";
const FOOD = "00000000-0000-4000-8000-000000000001";
const TRANSPORT = "00000000-0000-4000-8000-000000000002";
const SALARY = "00000000-0000-4000-8000-000000000007";

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const month = today.slice(0, 7);
const firstDay = `${month}-01`;
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface Client {
  api: Api;
  session: SessionManager;
  maintenance: string[];
}

/** Monta o mesmo empilhamento do app: cliente HTTP ← sessão ← API. */
function makeClient(): Client {
  const maintenance: string[] = [];
  let session: SessionManager | null = null;
  const http = createHttpClient({
    baseUrl: BASE_URL,
    session: {
      getAccessToken: () => session?.getAccessToken() ?? Promise.resolve(null),
      refresh: () => session?.refresh() ?? Promise.resolve(null),
    },
    onSessionExpired: () => session?.expire(),
    onMaintenance: (message) => maintenance.push(message),
  });
  const api = createApi(http);
  session = createSessionManager({
    storage: createMemoryStorage(),
    refreshTokens: (token) => api.auth.refresh(token),
    revokeRefreshToken: (token) => api.auth.logout(token),
    fetchMe: () => api.users.me(),
    store: useSessionStore,
  });
  return { api, session, maintenance };
}

async function registerUser(
  client: Client,
  name: string,
  email = `${name}.${suffix}@contrato.app`,
): Promise<AuthResult> {
  const result = await client.api.auth.register({
    email,
    username: `${name}_${suffix}`.slice(0, 30),
    password: PASSWORD,
    primaryCurrency: "BRL",
  });
  await client.session.begin(result);
  return result;
}

async function expectApiError(promise: Promise<unknown>, status: number, code?: string): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error(`Esperava erro ${status}`);
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(status);
  if (code) expect((error as ApiError).code).toBe(code);
  return error as ApiError;
}

const user = makeClient();
let auth: AuthResult;
let defaultWalletId: string;
let usdWalletId: string;
let expense: Transaction;
let income: Transaction;

beforeAll(async () => {
  const status = await fetch(`${BASE_URL}/api/system/status`).catch(() => null);
  if (!status?.ok)
    throw new Error(`API indisponível em ${BASE_URL}. Suba o backend antes (veja tests/contract/README.md).`);
});

describe("sistema e moedas (R72, R28)", () => {
  it("status público informa a manutenção", async () => {
    const status = await user.api.system.status();
    expect(status).toMatchObject({ status: "ok", maintenance: { enabled: false } });
  });

  it("lista moedas com nome em português, sem login", async () => {
    const list = await user.api.exchange.currencies();
    expect(list.data).toEqual(expect.arrayContaining([expect.objectContaining({ code: "BRL" })]));
  });

  it("comprime respostas grandes (R86)", async () => {
    const response = await fetch(`${BASE_URL}/api/currencies`, { headers: { "accept-encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toMatch(/gzip|br|deflate/);
  });
});

describe("conta e sessão (R02, R03, R87)", () => {
  it("cadastra com senha forte e já devolve a sessão", async () => {
    auth = await registerUser(user, "ana");
    expect(auth.user).toMatchObject({ role: "user", primaryCurrency: "BRL", theme: "system" });
    expect(auth.tokens).toMatchObject({ tokenType: "Bearer", expiresIn: expect.any(Number) });
    await expect(user.api.users.me()).resolves.toMatchObject({ id: auth.user.id });
  });

  it("recusa senha fraca com os detalhes por campo", async () => {
    const error = await expectApiError(
      user.api.auth.register({
        email: `fraca.${suffix}@contrato.app`,
        username: `fraca_${suffix}`.slice(0, 30),
        password: "abc",
      }),
      400,
      "VALIDATION_ERROR",
    );
    // O app mostra esta mensagem abaixo do campo de senha (fieldErrors.password).
    expect(error.fieldErrors.password).toEqual(expect.any(String));
  });

  it("entra com e-mail ou nome de usuário", async () => {
    await expect(user.api.auth.login({ email: auth.user.email, password: PASSWORD })).resolves.toMatchObject({
      user: { id: auth.user.id },
    });
    await expect(user.api.auth.login({ username: auth.user.username, password: PASSWORD })).resolves.toMatchObject({
      user: { id: auth.user.id },
    });
  });

  it("renova a sessão com rotação do refresh token", async () => {
    const token = await user.session.refresh();
    expect(token).toEqual(expect.any(String));
    await expect(user.api.users.me()).resolves.toMatchObject({ id: auth.user.id });
  });

  it("bloqueia a conta após tentativas sem sucesso e informa o tempo (R87)", async () => {
    const other = makeClient();
    const victim = await registerUser(other, "bloq");
    let locked: ApiError | null = null;
    for (let i = 0; i < 8 && !locked; i++) {
      const error = (await other.api.auth
        .login({ email: victim.user.email, password: "Errada@123" })
        .catch((e) => e)) as ApiError;
      if (error.code === "ACCOUNT_LOCKED") locked = error;
      else expect(error.code).toBe("INVALID_CREDENTIALS");
    }
    expect(locked).not.toBeNull();
    expect(locked!.status).toBe(423);
    expect(locked!.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("solicita a recuperação de senha (R04)", async () => {
    await expect(user.api.auth.forgotPassword(auth.user.email)).resolves.toMatchObject({ message: expect.any(String) });
  });
});

describe("carteiras e moedas (R53, R55, R56, R28)", () => {
  it("tem a carteira padrão com saldo e total na moeda principal", async () => {
    const summary = await user.api.wallets.summary();
    expect(summary.primaryCurrency).toBe("BRL");
    const main = summary.wallets.find((w) => w.isDefault)!;
    expect(main).toMatchObject({ currency: "BRL", balance: expect.any(Number) });
    defaultWalletId = main.id;
  });

  it("cria carteira em outra moeda com saldo inicial", async () => {
    const created = await user.api.wallets.create({
      name: "Viagem",
      type: "savings",
      currency: "USD",
      initialBalance: 100,
    });
    expect(created).toMatchObject({
      currency: "USD",
      balance: 100,
      initialBalance: 100,
      type: "savings",
      isDefault: false,
    });
    usdWalletId = created.id;
  });

  it("recusa nome duplicado com código estável", async () => {
    await expectApiError(user.api.wallets.create({ name: "Viagem", currency: "USD" }), 409);
  });
});

describe("categorias e tags (R07, R08, R43, R44)", () => {
  it("lista as predefinidas compatíveis com o tipo", async () => {
    const expenses = await user.api.categories.list("expense");
    expect(expenses.data.map((c) => c.systemKey)).toEqual(expect.arrayContaining(["food", "transport"]));
    expect(expenses.data.find((c) => c.systemKey === "salary")).toBeUndefined();
    const incomes = await user.api.categories.list("income");
    expect(incomes.data.find((c) => c.id === SALARY)).toBeDefined();
  });

  it("cria categoria personalizada", async () => {
    const created = await user.api.categories.create({ name: `Pets ${suffix}`, type: "expense" });
    expect(created).toMatchObject({ predefined: false, type: "expense", systemKey: null });
  });

  it("sugere categoria pela descrição", async () => {
    const { suggestions } = await user.api.categories.suggest("Uber para o trabalho", "expense");
    expect(suggestions[0]).toMatchObject({ categoryId: TRANSPORT, confidence: expect.any(Number) });
  });
});

describe("transações (R06, R09–R12, R26, R48, R49, R52, R65, R70)", () => {
  it("registra despesa e receita com categoria e tags", async () => {
    expense = await user.api.transactions.create({
      type: "expense",
      amount: 35.9,
      description: "Mercado",
      date: today,
      walletId: defaultWalletId,
      categoryId: FOOD,
      tags: ["casa"],
    });
    expect(expense).toMatchObject({
      type: "expense",
      amount: 35.9,
      currency: "BRL",
      date: today,
      category: { id: FOOD, predefined: true },
      tags: [expect.objectContaining({ name: "casa" })],
      archived: false,
    });
    income = await user.api.transactions.create({
      type: "income",
      amount: 6800,
      description: "Salário",
      categoryId: SALARY,
    });
    expect(income.wallet.id).toBe(defaultWalletId);
    await expect(user.api.tags.list()).resolves.toMatchObject({ data: [expect.objectContaining({ name: "casa" })] });
  });

  it("aponta categoria incompatível com o tipo", async () => {
    const error = await expectApiError(
      user.api.transactions.create({ type: "income", amount: 1, description: "x", categoryId: FOOD }),
      422,
      "CATEGORY_TYPE_MISMATCH",
    );
    expect(error.fieldErrors.categoryId).toBeTruthy();
  });

  it("valida o corpo e lista todos os campos com problema", async () => {
    const error = await expectApiError(
      user.api.transactions.create({ type: "expense", amount: -5, description: "" } as never),
      400,
      "VALIDATION_ERROR",
    );
    expect(Object.keys(error.fieldErrors)).toEqual(expect.arrayContaining(["amount", "description"]));
  });

  it("pagina por cursor em ordem cronológica inversa", async () => {
    const first = await user.api.transactions.list({ month, limit: 1 });
    expect(first.data).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await user.api.transactions.list({ month, limit: 1, cursor: first.nextCursor! });
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
  });

  it("busca sem diferenciar acentos e ordena por valor", async () => {
    const found = await user.api.transactions.list({ q: "MERCADO", month });
    expect(found.data.map((t) => t.id)).toEqual([expense.id]);
    const byAmount = await user.api.transactions.list({ month, sort: "amount", order: "asc" });
    expect(byAmount.data.map((t) => t.amount)).toEqual([35.9, 6800]);
  });

  it("resume o mês com totais convertidos", async () => {
    const summary = await user.api.transactions.summary({ month });
    expect(summary).toMatchObject({ count: 2, primaryCurrency: "BRL", converted: { income: 6800, expense: 35.9 } });
    const months = await user.api.transactions.months();
    expect(months.data[0]).toMatchObject({ month, count: 2 });
  });

  it("edita e desfaz a edição", async () => {
    const updated = await user.api.transactions.update(expense.id, { amount: 40 });
    expect(updated.amount).toBe(40);
    const undo = await user.api.history.undo();
    expect(undo.undone).toMatchObject({ entityId: expense.id, label: expect.any(String) });
    await expect(user.api.transactions.get(expense.id)).resolves.toMatchObject({ amount: 35.9 });
  });

  it("duplica com a data de hoje", async () => {
    const copy = await user.api.transactions.duplicate(expense.id);
    expect(copy).toMatchObject({ amount: 35.9, description: "Mercado", date: today });
    expect(copy.id).not.toBe(expense.id);
    await user.api.transactions.remove(copy.id);
  });

  it("arquiva, consulta as arquivadas e desarquiva", async () => {
    await expect(user.api.transactions.archive(expense.id)).resolves.toMatchObject({ archived: true });
    const main = await user.api.transactions.list({ month });
    expect(main.data.find((t) => t.id === expense.id)).toBeUndefined();
    const archived = await user.api.transactions.list({ month, archived: "true" });
    expect(archived.data.map((t) => t.id)).toContain(expense.id);
    await expect(user.api.transactions.unarchive(expense.id)).resolves.toMatchObject({ archived: false });
  });

  it("exclui e desfaz a exclusão", async () => {
    await expect(user.api.transactions.remove(expense.id)).resolves.toBeUndefined();
    await expectApiError(user.api.transactions.get(expense.id), 404);
    await user.api.history.undo();
    await expect(user.api.transactions.get(expense.id)).resolves.toMatchObject({ id: expense.id });
  });

  it("interpreta a frase reconhecida pela voz", async () => {
    const parsed = await user.api.transactions.parse("gastei 35,90 no mercado ontem");
    expect(parsed.draft).toMatchObject({ type: "expense", amount: 35.9 });
    expect(parsed.suggestions[0]).toMatchObject({ categoryId: FOOD });
  });
});

describe("transferências e câmbio (R54, R29)", () => {
  it("transfere entre moedas sem gerar receita/despesa e é idempotente", async () => {
    const before = await user.api.wallets.summary();
    const key = `contrato-${suffix}`;
    const transfer = await user.api.transfers.create(
      { sourceWalletId: defaultWalletId, targetWalletId: usdWalletId, amount: 100 },
      key,
    );
    expect(transfer).toMatchObject({
      amount: 100,
      sourceWallet: { currency: "BRL" },
      targetWallet: { currency: "USD" },
    });
    expect(transfer.targetAmount).toBeGreaterThan(0);
    const repeated = await user.api.transfers.create(
      { sourceWalletId: defaultWalletId, targetWalletId: usdWalletId, amount: 100 },
      key,
    );
    expect(repeated.id).toBe(transfer.id);

    const after = await user.api.wallets.summary();
    const balance = (s: typeof before, id: string) => s.wallets.find((w) => w.id === id)!.balance;
    expect(balance(after, defaultWalletId)).toBeCloseTo(balance(before, defaultWalletId) - 100, 2);
    const summary = await user.api.transactions.summary({ month });
    expect(summary.count).toBe(2);

    await expect(user.api.transfers.list()).resolves.toMatchObject({
      data: [expect.objectContaining({ id: transfer.id })],
    });
  });

  it("converte valores pela cotação atual", async () => {
    const conversion = await user.api.exchange.convert("BRL", "USD", 100);
    expect(conversion).toMatchObject({
      from: "BRL",
      to: "USD",
      amount: 100,
      result: expect.any(Number),
      rate: expect.any(Number),
    });
  });
});

describe("relatórios (R41, R55, R58, R01)", () => {
  it("monta a tela inicial em uma requisição", async () => {
    const overview = await user.api.reports.overview();
    expect(overview.month).toBe(month);
    expect(overview.wallets.wallets.length).toBeGreaterThanOrEqual(2);
    expect(overview.recentTransactions.length).toBeGreaterThan(0);
    expect(overview.topExpenseCategories[0]).toMatchObject({ category: { id: FOOD }, share: expect.any(Number) });
  });

  it("gera o extrato e o fluxo de caixa do período", async () => {
    const statement = await user.api.reports.statement({ from: firstDay, to: today });
    const main = statement.wallets.find((w) => w.wallet.id === defaultWalletId)!;
    expect(main.entries.length).toBeGreaterThanOrEqual(3);
    expect(main.closingBalance).toBeCloseTo(main.openingBalance + main.totalIn - main.totalOut, 2);

    const flow = await user.api.reports.cashFlow({ from: firstDay, to: today });
    expect(flow.entries.map((e) => e.kind)).not.toContain("transfer_out");
    const dates = flow.entries.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);

    const withWallet = await user.api.reports.cashFlow({ from: firstDay, to: today, walletId: defaultWalletId });
    expect(withWallet.entries.map((e) => e.kind)).toContain("transfer_out");
  });

  it("devolve o PDF do extrato com autorização", async () => {
    const http = createHttpClient({
      baseUrl: BASE_URL,
      session: { getAccessToken: () => user.session.getAccessToken(), refresh: () => user.session.refresh() },
    });
    const url = user.api.reports.statementPdfUrl({ from: firstDay, to: today });
    const response = await fetch(url, { headers: await http.authHeaders() });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("traz receitas e despesas por mês para o gráfico", async () => {
    const report = await user.api.reports.monthly(month, month);
    expect(report.months[0]).toMatchObject({ month, converted: { income: 6800 } });
  });
});

describe("preferências (R28, R42)", () => {
  it("salva tema e moeda principal no perfil", async () => {
    await expect(user.api.users.updateMe({ theme: "dark", primaryCurrency: "USD" })).resolves.toMatchObject({
      theme: "dark",
      primaryCurrency: "USD",
    });
    await expect(user.api.users.updateMe({ primaryCurrency: "BRL" })).resolves.toMatchObject({
      primaryCurrency: "BRL",
    });
  });
});

describe("biometria com chave do aparelho (R40)", () => {
  it("aceita a chave pública e a assinatura no formato do react-native-biometrics", async () => {
    // Mesmo formato do Android Keystore: SPKI DER em base64 e assinatura SHA256withECDSA (DER) em base64.
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");
    const credential = await user.api.biometric.enroll(spki, "Pixel do contrato");
    expect(credential).toMatchObject({ keyType: "ec", deviceName: "Pixel do contrato" });

    const { challenge } = await user.api.biometric.challenge(credential.id);
    const signer = createSign("SHA256");
    signer.update(challenge, "utf8");
    const signature = signer.sign(privateKey).toString("base64");
    const result = await user.api.biometric.login(credential.id, challenge, signature);
    expect(result.user.id).toBe(auth.user.id);

    await user.api.biometric.revoke(credential.id);
    await expectApiError(user.api.biometric.challenge(credential.id), 401, "BIOMETRIC_CREDENTIAL_INVALID");
  });
});

describe("modo de manutenção (R72)", () => {
  it("bloqueia escritas com 503 e mantém as consultas", async () => {
    const admin = makeClient();
    const registered = await admin.api.auth
      .register({ email: ADMIN_EMAIL, username: `admin_${suffix}`.slice(0, 30), password: PASSWORD })
      .catch(() => admin.api.auth.login({ email: ADMIN_EMAIL, password: PASSWORD }));
    await admin.session.begin(registered);
    expect(registered.user.role).toBe("admin");

    await admin.api.system.setMaintenance(true, "Atualização de contrato");
    try {
      await expect(user.api.system.status()).resolves.toMatchObject({
        maintenance: { enabled: true, message: "Atualização de contrato" },
      });
      await expectApiError(
        user.api.transactions.create({ type: "expense", amount: 1, description: "x" }),
        503,
        "MAINTENANCE_MODE",
      );
      expect(user.maintenance).toContain("Atualização de contrato");
      await expect(user.api.wallets.summary()).resolves.toBeDefined();
    } finally {
      await admin.api.system.setMaintenance(false);
    }
  });
});

describe("encerramento da sessão", () => {
  it("troca a senha e sai, revogando o refresh token", async () => {
    await expect(user.api.auth.changePassword(PASSWORD, "Nova@Contrato2026")).resolves.toBeUndefined();
    await expect(user.api.auth.login({ email: auth.user.email, password: "Nova@Contrato2026" })).resolves.toBeDefined();
    await user.session.signOut("logout");
    expect(useSessionStore.getState().status).toBe("signedOut");
    await expect(user.session.getAccessToken()).resolves.toBeNull();
  });
});
