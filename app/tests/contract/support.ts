/**
 * Apoio dos testes de contrato: o mesmo empilhamento do app (cliente HTTP ← sessão ← API),
 * cadastro de usuários descartáveis, datas de referência e a conferência dos erros da API.
 */
import { ApiError } from "@/core/http/api-error";
import { createHttpClient } from "@/core/http/http-client";
import { createMemoryStorage } from "@/core/storage/secure-storage";
import { createApi, type Api, type AuthResult } from "@/data/api";
import { createSessionManager, type SessionManager } from "@/data/session/session-manager";
import { useSessionStore } from "@/data/session/session-store";

export const BASE_URL = process.env.CONTRACT_API_URL ?? "http://localhost:3100";
export const PASSWORD = "Contrato@2026!";

/** Categorias predefinidas (ids fixos do backend). */
export const FOOD = "00000000-0000-4000-8000-000000000001";
export const TRANSPORT = "00000000-0000-4000-8000-000000000002";
export const SALARY = "00000000-0000-4000-8000-000000000007";

const pad = (n: number) => String(n).padStart(2, "0");
const now = new Date();
/** Hoje no fuso do aparelho (o mesmo do usuário criado: America/Sao_Paulo). */
export const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const month = today.slice(0, 7);
export const firstDay = `${month}-01`;
/** Sufixo aleatório: cada execução cria usuários novos e pode ser repetida no mesmo banco. */
export const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Soma dias a uma data AAAA-MM-DD (aritmética em UTC, sem efeito do fuso). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Soma meses a um mês AAAA-MM. */
export function addMonths(value: string, months: number): string {
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
}

export interface Client {
  api: Api;
  session: SessionManager;
  maintenance: string[];
}

/** Monta o mesmo empilhamento do app: cliente HTTP ← sessão ← API. */
export function makeClient(): Client {
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

export async function registerUser(
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

/** Cabeçalho de autorização da sessão do cliente, como o app usa nos downloads de arquivo. */
export function authHeaders(client: Client): Promise<Record<string, string>> {
  const http = createHttpClient({
    baseUrl: BASE_URL,
    session: { getAccessToken: () => client.session.getAccessToken(), refresh: () => client.session.refresh() },
  });
  return http.authHeaders();
}

export async function expectApiError(promise: Promise<unknown>, status: number, code?: string): Promise<ApiError> {
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

/** Falha cedo, com uma mensagem clara, se a API não estiver no ar. */
export async function requireApi(): Promise<void> {
  const status = await fetch(`${BASE_URL}/api/system/status`).catch(() => null);
  if (!status?.ok)
    throw new Error(`API indisponível em ${BASE_URL}. Suba o backend antes (veja tests/contract/README.md).`);
}

/** Repete a consulta até a condição valer (efeitos assíncronos: alertas disparados por eventos). */
export async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!accept(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    value = await read();
  }
  return value;
}
