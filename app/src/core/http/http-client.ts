import { ApiError, NETWORK_ERROR, TIMEOUT } from "./api-error";

/**
 * Cliente HTTP da API (TypeScript puro, sem dependências do React Native — por isso também
 * roda nos testes de contrato em Node).
 *
 * - Autenticação JWT (R03): envia `Authorization: Bearer`; ao receber 401 TOKEN_EXPIRED,
 *   renova a sessão uma única vez e repete a requisição (R87: tokens expiram).
 * - Manutenção (R72): 503 MAINTENANCE_MODE avisa o app pelo callback `onMaintenance`.
 * - Erros sempre como `ApiError` com o `code` estável da API.
 * - Compressão (R86): no Android o OkHttp já envia `Accept-Encoding: gzip` e descompacta a
 *   resposta. Definir o cabeçalho manualmente desligaria essa descompactação automática,
 *   por isso o cliente não o define.
 */

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface SessionTokens {
  /** Access token válido (renovando antes, se estiver para vencer), ou null sem sessão. */
  getAccessToken(): Promise<string | null>;
  /** Renova a sessão com o refresh token; devolve o novo access token ou null. */
  refresh(): Promise<string | null>;
}

export interface HttpLogger {
  info(event: string, context?: Record<string, unknown>): void;
  warn(event: string, context?: Record<string, unknown>): void;
  error(event: string, error?: unknown, context?: Record<string, unknown>): void;
}

export interface HttpClientOptions {
  /** URL da API; pode ser uma função, para mudar em tempo de execução (endereço escolhido no login). */
  baseUrl: string | (() => string);
  fetch?: typeof fetch;
  timeoutMs?: number;
  session?: SessionTokens;
  /** Sessão inválida e impossível de renovar: o app volta ao login. */
  onSessionExpired?: (error: ApiError) => void;
  /** API em manutenção (503 MAINTENANCE_MODE). */
  onMaintenance?: (message: string) => void;
  logger?: HttpLogger;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** false para rotas públicas (login, cadastro...). Padrão: true. */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface HttpClient {
  readonly baseUrl: string;
  request<T>(method: HttpMethod, path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>;
  /** URL absoluta com query string (downloads de arquivo). */
  url(path: string, query?: Query): string;
  /** Cabeçalho de autorização atualizado (downloads feitos fora do fetch). */
  authHeaders(): Promise<Record<string, string>>;
}

/** Monta a query string ignorando valores vazios (filtros não preenchidos). */
export function buildQuery(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/** 401 que significam "sessão não serve mais" (não adianta renovar). */
const SESSION_GONE = new Set(["INVALID_TOKEN", "SESSION_REVOKED", "UNAUTHORIZED"]);

async function parseError(response: Response): Promise<ApiError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  type ErrorPayload = { code?: unknown; message?: unknown; details?: unknown };
  let payload: ErrorPayload | null;
  try {
    payload = (await response.json()) as ErrorPayload | null;
  } catch {
    payload = null;
  }
  const code = typeof payload?.code === "string" ? payload.code : `HTTP_${response.status}`;
  const message =
    typeof payload?.message === "string" && payload.message
      ? payload.message
      : response.status >= 500
        ? "O servidor está indisponível no momento. Tente novamente em instantes."
        : "Não foi possível concluir a operação.";
  let details = payload?.details;
  const retryAfter = response.headers.get("retry-after");
  if (response.status === 423 && retryAfter && (details === undefined || details === null)) {
    details = { retryAfterSeconds: Number(retryAfter) };
  }
  return new ApiError(response.status, code, message, details, requestId);
}

async function parseBody<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("json") ? JSON.parse(text) : text) as T;
}

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const baseUrlOf = () =>
    (typeof options.baseUrl === "function" ? options.baseUrl() : options.baseUrl).replace(/\/+$/, "");
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 20_000;
  const { session, logger } = options;

  const url = (path: string, query?: Query) => `${baseUrlOf()}${path}${buildQuery(query)}`;

  async function send<T>(method: HttpMethod, path: string, opts: RequestOptions, retried: boolean): Promise<T> {
    const useAuth = opts.auth !== false;
    const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (useAuth && session) {
      const token = await session.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort);

    let response: Response;
    try {
      response = await doFetch(url(path, opts.query), {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      const error = timedOut
        ? new ApiError(0, TIMEOUT, "O servidor demorou para responder. Tente novamente.")
        : new ApiError(0, NETWORK_ERROR, "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
      if (!opts.signal?.aborted)
        logger?.warn("http.network_error", { method, path, code: error.code, cause: String(cause) });
      throw error;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }

    if (response.ok) return parseBody<T>(response);

    const error = await parseError(response);

    if (response.status === 401 && useAuth && session) {
      if (error.code === "TOKEN_EXPIRED" && !retried) {
        const renewed = await session.refresh();
        if (renewed) return send<T>(method, path, opts, true);
        options.onSessionExpired?.(error);
        throw error;
      }
      if (SESSION_GONE.has(error.code) || error.code === "TOKEN_EXPIRED") {
        options.onSessionExpired?.(error);
      }
    }

    if (response.status === 503 && error.code === "MAINTENANCE_MODE") {
      options.onMaintenance?.(error.message);
    }

    const context = { method, path, status: error.status, code: error.code, requestId: error.requestId };
    if (error.status >= 500) logger?.error("http.server_error", error, context);
    else logger?.info("http.request_rejected", context);
    throw error;
  }

  const client: HttpClient = {
    get baseUrl() {
      return baseUrlOf();
    },
    request: (method, path, opts = {}) => send(method, path, opts, false),
    get: (path, opts) => client.request("GET", path, opts),
    post: (path, body, opts) => client.request("POST", path, { ...opts, body }),
    patch: (path, body, opts) => client.request("PATCH", path, { ...opts, body }),
    put: (path, body, opts) => client.request("PUT", path, { ...opts, body }),
    delete: (path, opts) => client.request("DELETE", path, opts),
    url,
    async authHeaders(): Promise<Record<string, string>> {
      const token = session ? await session.getAccessToken() : null;
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    },
  };
  return client;
}
