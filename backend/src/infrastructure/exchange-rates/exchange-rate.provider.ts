export interface RateTable {
  base: string;
  rates: Record<string, number>;
  /** Momento da cotação informado pelo provedor. */
  updatedAt: Date;
  source: string;
}

export interface ExchangeRateProvider {
  fetchLatest(base: string): Promise<RateTable>;
}

interface OpenErApiResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
  provider?: string;
  "error-type"?: string;
}

/**
 * ExchangeRate-API, endpoint de acesso aberto e gratuito (https://open.er-api.com/v6/latest/{BASE}),
 * conforme R29. Não exige chave; o provedor atualiza as taxas uma vez por dia e pede cache.
 */
export class OpenExchangeRateApiProvider implements ExchangeRateProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async fetchLatest(base: string): Promise<RateTable> {
    const response = await fetch(`${this.apiUrl}/${encodeURIComponent(base)}`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Provedor de câmbio respondeu HTTP ${response.status}`);
    }
    const body = (await response.json()) as OpenErApiResponse;
    if (body.result !== "success" || !body.rates || !body.base_code) {
      throw new Error(`Provedor de câmbio retornou erro: ${body["error-type"] ?? "resposta inválida"}`);
    }
    return {
      base: body.base_code,
      rates: body.rates,
      updatedAt: body.time_last_update_unix ? new Date(body.time_last_update_unix * 1000) : new Date(),
      source: "ExchangeRate-API (open.er-api.com)",
    };
  }
}
