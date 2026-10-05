import { isApiError } from "@/core/http/api-error";
import type { SessionTokens } from "@/core/http/http-client";
import type { Logger } from "@/core/logging/logger";
import { storageKeys, type KeyValueStore } from "@/core/storage/secure-storage";
import type { AuthResult, AuthTokens, User } from "../api/types";
import type { SessionState, SignedOutReason } from "./session-store";

export interface SessionDeps {
  storage: KeyValueStore;
  refreshTokens: (refreshToken: string) => Promise<AuthTokens>;
  revokeRefreshToken: (refreshToken: string) => Promise<void>;
  fetchMe: () => Promise<User>;
  store: { getState: () => SessionState };
  logger?: Logger;
  now?: () => number;
  /** Chamado ao encerrar a sessão (limpa o cache de dados do usuário). */
  onSignedOut?: () => void;
}

export interface SessionManager extends SessionTokens {
  /** Inicia a sessão com o resultado do login/cadastro/biometria. */
  begin(result: AuthResult): Promise<void>;
  /** Restaura a sessão salva ao abrir o app. */
  restore(): Promise<void>;
  /** Sai da conta; `reason` define o aviso exibido no login. */
  signOut(reason?: SignedOutReason): Promise<void>;
  /** A API recusou a sessão (revogada/expirada): volta ao login sem chamar o servidor. */
  expire(): void;
}

/** Renova o access token quando faltar menos que isso para vencer. */
const REFRESH_MARGIN_MS = 30_000;

/**
 * Sessão JWT (R03, R87):
 * - access token só em memória; refresh token cifrado no Keystore (SecureStore);
 * - renovação antecipada e em voo único — o backend rotaciona o refresh token e trata reuso
 *   como roubo (encerra a sessão), então duas renovações simultâneas não podem acontecer.
 */
export function createSessionManager(deps: SessionDeps): SessionManager {
  const now = deps.now ?? (() => Date.now());
  let accessToken: string | null = null;
  let expiresAt = 0;
  let inflight: Promise<string | null> | null = null;

  function applyTokens(tokens: AuthTokens) {
    accessToken = tokens.accessToken;
    expiresAt = now() + tokens.expiresIn * 1000;
  }

  async function clearLocal(reason: SignedOutReason) {
    accessToken = null;
    expiresAt = 0;
    await deps.storage.deleteItem(storageKeys.refreshToken).catch(() => undefined);
    const state = deps.store.getState();
    if (state.status !== "signedOut" || reason !== state.signedOutReason) state.setSignedOut(reason);
    deps.onSignedOut?.();
  }

  async function doRefresh(): Promise<string | null> {
    const stored = await deps.storage.getItem(storageKeys.refreshToken);
    if (!stored) return null;
    try {
      const tokens = await deps.refreshTokens(stored);
      applyTokens(tokens);
      await deps.storage.setItem(storageKeys.refreshToken, tokens.refreshToken);
      deps.logger?.info("auth.session_refreshed");
      return tokens.accessToken;
    } catch (error) {
      // Sem rede: mantém a sessão para tentar de novo depois.
      if (isApiError(error) && error.isNetworkError) throw error;
      deps.logger?.warn("auth.refresh_failed", { code: isApiError(error) ? error.code : "UNKNOWN" });
      await clearLocal("expired");
      return null;
    }
  }

  const manager: SessionManager = {
    refresh() {
      inflight ??= doRefresh().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    async getAccessToken() {
      if (inflight) return inflight;
      if (accessToken && now() < expiresAt - REFRESH_MARGIN_MS) return accessToken;
      if (deps.store.getState().status === "signedOut") return null;
      return manager.refresh();
    },

    async begin(result) {
      applyTokens(result.tokens);
      await deps.storage.setItem(storageKeys.refreshToken, result.tokens.refreshToken);
      deps.store.getState().setSignedIn(result.user);
      deps.logger?.info("auth.signed_in", { userId: result.user.id });
    },

    async restore() {
      const stored = await deps.storage.getItem(storageKeys.refreshToken);
      if (!stored) {
        deps.store.getState().setSignedOut(null);
        return;
      }
      try {
        const token = await manager.refresh();
        if (!token) return; // refresh recusado: clearLocal já marcou "expired"
        const user = await deps.fetchMe();
        deps.store.getState().setSignedIn(user);
        deps.logger?.info("auth.session_restored", { userId: user.id });
      } catch (error) {
        deps.logger?.warn("auth.restore_failed", { code: isApiError(error) ? error.code : "UNKNOWN" });
        if (isApiError(error) && error.isNetworkError) {
          // Sem conexão: mantém o refresh token salvo para a próxima tentativa.
          accessToken = null;
          deps.store.getState().setSignedOut("offline");
        } else {
          await clearLocal("expired");
        }
      }
    },

    async signOut(reason = "logout") {
      const stored = await deps.storage.getItem(storageKeys.refreshToken);
      if (stored && reason === "logout") {
        await deps
          .revokeRefreshToken(stored)
          .catch((error) =>
            deps.logger?.warn("auth.logout_remote_failed", { code: isApiError(error) ? error.code : "UNKNOWN" }),
          );
      }
      await clearLocal(reason);
      deps.logger?.info("auth.signed_out", { reason });
    },

    expire() {
      if (deps.store.getState().status !== "signedIn") return;
      void clearLocal("expired");
    },
  };
  return manager;
}
