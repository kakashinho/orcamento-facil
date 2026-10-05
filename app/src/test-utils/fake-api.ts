/**
 * Backend falso para os testes: substitui o `fetch` global e responde por rota, registrando
 * cada chamada (método, caminho, query, corpo e cabeçalhos) para as asserções.
 */
export interface FakeRequest {
  /** Servidor de destino (host:porta). */
  host: string;
  method: string;
  path: string;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string>;
}

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

type Handler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

function toPattern(path: string): RegExp {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

function makeResponse(response: FakeResponse) {
  const status = response.status ?? 200;
  const headers = new Map(
    Object.entries({ "content-type": "application/json", ...response.headers }).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const text = response.body === undefined ? "" : JSON.stringify(response.body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

export function apiError(status: number, code: string, message: string, details?: unknown): FakeResponse {
  return { status, body: { statusCode: status, code, message, ...(details !== undefined ? { details } : {}) } };
}

export function createFakeApi() {
  const routes: Route[] = [];
  const calls: FakeRequest[] = [];

  const fetchImpl = jest.fn(
    async (input: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => {
      const url = new URL(input);
      const method = (init.method ?? "GET").toUpperCase();
      const request: FakeRequest = {
        method,
        host: url.host,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body: init.body ? JSON.parse(init.body) : undefined,
        headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      };
      calls.push(request);
      // A rota registrada por último vence (permite sobrescrever respostas padrão no teste).
      const route = [...routes].reverse().find((r) => r.method === method && r.pattern.test(url.pathname));
      if (!route)
        return makeResponse(apiError(404, "ROUTE_NOT_FOUND", `Sem resposta falsa para ${method} ${url.pathname}`));
      return makeResponse(await route.handler(request));
    },
  );

  const api = {
    fetch: fetchImpl,
    calls,
    on(method: string, path: string, handler: Handler | FakeResponse) {
      routes.push({
        method,
        pattern: toPattern(path),
        handler: typeof handler === "function" ? handler : () => handler,
      });
      return api;
    },
    /** Chamadas feitas a uma rota (com `:param` aceito no caminho). */
    callsTo(method: string, path: string): FakeRequest[] {
      const pattern = toPattern(path);
      return calls.filter((c) => c.method === method && pattern.test(c.path));
    },
    lastCall(method: string, path: string): FakeRequest | undefined {
      const list = api.callsTo(method, path);
      return list[list.length - 1];
    },
    install() {
      (globalThis as { fetch: unknown }).fetch = fetchImpl;
      return api;
    },
  };
  return api;
}

export type FakeApi = ReturnType<typeof createFakeApi>;
