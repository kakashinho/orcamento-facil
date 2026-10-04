import { randomBytes } from "node:crypto";
import type { InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "../../../src/app.js";
import { type Container, createContainer } from "../../../src/container.js";
import type { App } from "../../../src/http/types.js";
import { MemoryMailer } from "../../../src/infra/mailer.js";
import { FakeExchangeRateProvider, MutableClock, testConfig } from "../../helpers/test-config.js";

export const PASSWORD = "Senha@Forte123";

export interface TestContext {
  app: App;
  container: Container;
  mailer: MemoryMailer;
  rates: FakeExchangeRateProvider;
  clock: MutableClock;
  close(): Promise<void>;
}

export async function createTestApp(configOverrides: Record<string, string> = {}): Promise<TestContext> {
  const mailer = new MemoryMailer();
  const rates = new FakeExchangeRateProvider();
  const clock = new MutableClock();
  const container = createContainer(testConfig(configOverrides), { mailer, exchangeRateProvider: rates, clock });
  const app = await buildApp(container);
  await app.ready();
  return {
    app,
    container,
    mailer,
    rates,
    clock,
    async close() {
      await app.close();
      await container.close();
    },
  };
}

export function unique(prefix = "u"): string {
  return `${prefix}${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

export interface TestUser {
  id: string;
  email: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  defaultWalletId: string;
  api: ApiClient;
}

export interface ApiClient {
  get(url: string, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  post(url: string, payload?: unknown, headers?: Record<string, string>): Promise<LightMyRequestResponse>;
  patch(url: string, payload?: unknown): Promise<LightMyRequestResponse>;
  put(url: string, payload?: unknown): Promise<LightMyRequestResponse>;
  delete(url: string): Promise<LightMyRequestResponse>;
}

export function apiClient(app: App, accessToken?: string): ApiClient {
  const auth: Record<string, string> = accessToken ? { authorization: `Bearer ${accessToken}` } : {};
  const send = (method: InjectOptions["method"], url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method,
      url,
      headers: { ...auth, ...headers },
      ...(payload === undefined ? {} : { payload: payload as InjectOptions["payload"] }),
    });
  return {
    get: (url, headers) => send("GET", url, undefined, headers),
    post: (url, payload, headers) => send("POST", url, payload, headers),
    patch: (url, payload) => send("PATCH", url, payload),
    put: (url, payload) => send("PUT", url, payload),
    delete: (url) => send("DELETE", url),
  };
}

export async function registerUser(
  app: App,
  overrides: { email?: string; username?: string; password?: string; primaryCurrency?: string } = {},
): Promise<TestUser> {
  const username = overrides.username ?? unique("user");
  const email = overrides.email ?? `${username}@teste.com`;
  const password = overrides.password ?? PASSWORD;
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, password, ...(overrides.primaryCurrency ? { primaryCurrency: overrides.primaryCurrency } : {}) },
  });
  if (response.statusCode !== 201) {
    throw new Error(`Falha ao registrar usuário de teste: ${response.statusCode} ${response.body}`);
  }
  const body = response.json();
  const api = apiClient(app, body.tokens.accessToken);
  const wallets = (await api.get("/api/wallets")).json();
  return {
    id: body.user.id,
    email,
    username,
    password,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    defaultWalletId: wallets.data[0].id,
    api,
  };
}

/** Atalho para criar transação via API e devolver o corpo. */
export async function createTransaction(user: TestUser, payload: Record<string, unknown>) {
  const response = await user.api.post("/api/transactions", { type: "expense", description: "Teste", ...payload });
  if (response.statusCode !== 201) {
    throw new Error(`Falha ao criar transação: ${response.statusCode} ${response.body}`);
  }
  return response.json();
}

export async function walletBalance(user: TestUser, walletId: string): Promise<number> {
  return (await user.api.get(`/api/wallets/${walletId}`)).json().balance;
}

export const PREDEFINED = {
  food: "00000000-0000-4000-8000-000000000001",
  transport: "00000000-0000-4000-8000-000000000002",
  leisure: "00000000-0000-4000-8000-000000000003",
  housing: "00000000-0000-4000-8000-000000000004",
  health: "00000000-0000-4000-8000-000000000005",
  salary: "00000000-0000-4000-8000-000000000007",
};
