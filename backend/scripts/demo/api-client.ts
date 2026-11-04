/**
 * Cliente mínimo da API para os scripts de demonstração: autentica, renova o token vencido e devolve o
 * JSON (ou lança um erro com o `code` da API). Usa só o `fetch` do Node, sem depender do código do app.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(`${status} ${code}: ${message}`);
  }
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  form?: FormData;
}

export class ApiClient {
  private tokens: Tokens | null = null;

  constructor(readonly baseUrl: string) {}

  private url(path: string, query?: RequestOptions["query"]): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const qs = params.toString();
    return `${this.baseUrl}${path}${qs ? `?${qs}` : ""}`;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}, retried = false): Promise<T> {
    const headers: Record<string, string> = { ...options.headers };
    if (this.tokens) headers.authorization = `Bearer ${this.tokens.accessToken}`;
    let body: string | FormData | undefined;
    if (options.form) body = options.form;
    else if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetch(this.url(path, options.query), { method, headers, body });
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const error = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
      if (response.status === 401 && error.code === "TOKEN_EXPIRED" && this.tokens && !retried) {
        await this.refresh();
        return this.request<T>(method, path, options, true);
      }
      throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? text.slice(0, 200), error.details);
    }
    return payload as T;
  }

  get<T>(path: string, query?: RequestOptions["query"]) {
    return this.request<T>("GET", path, { query });
  }
  post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("POST", path, { body: body ?? {}, headers });
  }
  patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, { body });
  }
  put<T>(path: string, body: unknown) {
    return this.request<T>("PUT", path, { body });
  }
  delete<T = void>(path: string) {
    return this.request<T>("DELETE", path);
  }

  /** Envia um arquivo (multipart, campo `file`). */
  upload<T>(path: string, query: Record<string, string>, fileName: string, mimeType: string, content: Buffer) {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(content)], fileName, { type: mimeType }));
    return this.request<T>("POST", path, { query, form });
  }

  /** Todas as páginas de uma listagem paginada por cursor (`{ data, nextCursor }`). */
  async listAll<T>(path: string, query: Record<string, string | number | boolean | undefined> = {}, pageSize = 100): Promise<T[]> {
    const items: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<{ data: T[]; nextCursor: string | null }>(path, { ...query, limit: pageSize, cursor });
      items.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return items;
  }

  private async refresh(): Promise<void> {
    if (!this.tokens) return;
    const result = await this.request<{ tokens: Tokens } | Tokens>("POST", "/api/auth/refresh", {
      body: { refreshToken: this.tokens.refreshToken },
    });
    this.tokens = "tokens" in result ? result.tokens : result;
  }

  async register(input: { email: string; username: string; password: string; primaryCurrency: string }) {
    const result = await this.request<{ tokens: Tokens; user: { id: string } }>("POST", "/api/auth/register", { body: input });
    this.tokens = result.tokens;
    return result.user;
  }

  async login(identifier: { email: string }, password: string) {
    this.tokens = null;
    const result = await this.request<{ tokens: Tokens; user: { id: string } }>("POST", "/api/auth/login", {
      body: { ...identifier, password },
    });
    this.tokens = result.tokens;
    return result.user;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
