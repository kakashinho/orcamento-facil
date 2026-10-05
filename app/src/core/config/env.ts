import Constants from "expo-constants";

/**
 * Configuração de ambiente. A URL da API vem de EXPO_PUBLIC_API_URL (embutida no build); sem ela,
 * em desenvolvimento, usa o IP do computador que serve o Metro (porta 3000); por fim, o
 * localhost do computador visto pelo emulador Android (10.0.2.2).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string | null };

/** Aceita "192.168.0.10:3000" (sem protocolo) e remove a barra final. */
export function normalizeApiUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

/** Em desenvolvimento, o computador que serve o Metro (Expo Go ou build de dev) também roda a API. */
function devServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? null;
  const host = hostUri?.split(":")[0];
  return host && host !== "localhost" && host !== "127.0.0.1" ? host : null;
}

function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL || extra.apiUrl;
  if (configured) return normalizeApiUrl(configured);
  const host = devServerHost();
  if (host) return `http://${host}:3000`;
  return "http://10.0.2.2:3000";
}

export const env = {
  apiUrl: resolveApiUrl(),
  appVersion: Constants.expoConfig?.version ?? "1.0.0",
  /** Intervalo de consulta do status do servidor (manutenção — R72). */
  statusPollMs: 60_000,
};
