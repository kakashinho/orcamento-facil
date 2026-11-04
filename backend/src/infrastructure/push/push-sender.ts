import { createSigner } from "fast-jwt";
import type { Clock } from "../clock.js";
import type { Logger } from "../logging/logger.js";

/** Push sem valores em dinheiro: título, texto e dados para o app navegar. */
export interface PushMessage {
  title: string;
  body: string;
  /** O FCM só aceita textos nos dados. */
  data: Record<string, string>;
}

/** `invalid_token` = aparelho desinstalou o app ou o token venceu: deve deixar de receber. */
export type PushResult = "sent" | "invalid_token" | "failed";

export interface PushSender {
  send(token: string, message: PushMessage): Promise<PushResult>;
}

export interface FcmCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TIMEOUT_MS = 5000;
/** Renova o token de acesso 5 minutos antes de vencer. */
const TOKEN_MARGIN_MS = 5 * 60_000;
/** Canal de notificação criado pelo app (Android 8+). */
export const ANDROID_CHANNEL_ID = "avisos";

/**
 * Envio pelo Firebase Cloud Messaging, API HTTP v1 (R18), sem o SDK do Firebase:
 * a conta de serviço assina um JWT (RS256) trocado por um token OAuth 2.0, guardado em cache.
 */
export class FcmPushSender implements PushSender {
  private readonly sign: (payload: Record<string, unknown>) => string;
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly credentials: FcmCredentials,
    private readonly clock: Clock,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Sem `noTimestamp`: essa opção descarta o `iat` do payload, e o Google recusa o JWT sem ele.
    this.sign = createSigner({ key: credentials.privateKey, algorithm: "RS256" });
  }

  private async token(): Promise<string> {
    const now = this.clock.now().getTime();
    if (this.accessToken && this.accessToken.expiresAt - TOKEN_MARGIN_MS > now) return this.accessToken.value;
    const iat = Math.floor(now / 1000);
    const assertion = this.sign({ iss: this.credentials.clientEmail, scope: FCM_SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 });
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Falha ao obter o token do FCM (HTTP ${response.status})`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = { value: body.access_token, expiresAt: now + body.expires_in * 1000 };
    return body.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushResult> {
    try {
      const response = await this.fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.credentials.projectId)}/messages:send`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${await this.token()}`, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: "high", notification: { channel_id: ANDROID_CHANNEL_ID } },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (response.ok) return "sent";
      if (response.status === 404) return "invalid_token";
      if (response.status === 400) {
        const detail = JSON.stringify(await response.json().catch(() => ({})));
        if (/UNREGISTERED|registration token/i.test(detail)) return "invalid_token";
      }
      return "failed";
    } catch {
      return "failed";
    }
  }
}

/** Desenvolvimento sem credencial do Firebase: só registra que haveria um push (sem o texto). */
export class LogPushSender implements PushSender {
  constructor(private readonly logger: Logger) {}

  async send(_token: string, message: PushMessage): Promise<PushResult> {
    this.logger.info({ kind: message.data.kind, notificationId: message.data.notificationId }, "Push (simulado)");
    return "sent";
  }
}

/** Testes: guarda as mensagens e devolve o resultado configurado por token. */
export class FakePushSender implements PushSender {
  readonly sent: Array<{ token: string; message: PushMessage }> = [];
  results = new Map<string, PushResult>();

  async send(token: string, message: PushMessage): Promise<PushResult> {
    const result = this.results.get(token) ?? "sent";
    if (result === "sent") this.sent.push({ token, message });
    return result;
  }
}
