import { ApiError, NETWORK_ERROR } from "@/core/http/api-error";
import { createMemoryStorage, storageKeys } from "@/core/storage/secure-storage";
import { authResult, user } from "@/test-utils/fixtures";
import type { AuthTokens } from "../api/types";
import { createSessionManager, type SessionDeps } from "./session-manager";
import { useSessionStore } from "./session-store";

function tokens(n: number, expiresIn = 900): AuthTokens {
  return { ...authResult.tokens, accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn };
}

function setup(overrides: Partial<SessionDeps> = {}, initial: Record<string, string> = {}) {
  let clock = 1_000_000;
  const storage = createMemoryStorage(initial);
  const deps: SessionDeps = {
    storage,
    refreshTokens: jest.fn(async () => tokens(2)),
    revokeRefreshToken: jest.fn(async () => undefined),
    fetchMe: jest.fn(async () => user),
    store: useSessionStore,
    now: () => clock,
    onSignedOut: jest.fn(),
    ...overrides,
  };
  const manager = createSessionManager(deps);
  return { manager, deps, storage, advance: (ms: number) => (clock += ms) };
}

describe("sessão JWT (R03, R87)", () => {
  it("inicia a sessão guardando o refresh token no armazenamento cifrado", async () => {
    const { manager, storage } = setup();
    await manager.begin(authResult);
    expect(useSessionStore.getState()).toMatchObject({ status: "signedIn", user });
    expect(storage.dump()[storageKeys.refreshToken]).toBe("refresh-1");
    await expect(manager.getAccessToken()).resolves.toBe("access-1");
  });

  it("renova antes de vencer e salva o novo refresh token (rotação)", async () => {
    const { manager, deps, storage, advance } = setup();
    await manager.begin(authResult);
    advance(880_000); // faltam 20 s para vencer
    await expect(manager.getAccessToken()).resolves.toBe("access-2");
    expect(deps.refreshTokens).toHaveBeenCalledWith("refresh-1");
    expect(storage.dump()[storageKeys.refreshToken]).toBe("refresh-2");
  });

  it("faz uma única renovação para chamadas simultâneas (o backend trata reuso como roubo)", async () => {
    let resolve!: (t: AuthTokens) => void;
    const refreshTokens = jest.fn(() => new Promise<AuthTokens>((r) => (resolve = r)));
    const { manager, advance } = setup({ refreshTokens });
    await manager.begin(authResult);
    advance(1_000_000);
    const calls = [manager.getAccessToken(), manager.refresh(), manager.getAccessToken()];
    await new Promise((r) => setTimeout(r, 0)); // o refresh lê o armazenamento antes de chamar a API
    resolve(tokens(3));
    await expect(Promise.all(calls)).resolves.toEqual(["access-3", "access-3", "access-3"]);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });

  it("encerra como sessão expirada quando o refresh é recusado", async () => {
    const refreshTokens = jest.fn(async () => {
      throw new ApiError(401, "INVALID_REFRESH_TOKEN", "Sessão inválida.");
    });
    const { manager, deps, storage } = setup({ refreshTokens });
    await manager.begin(authResult);
    await expect(manager.refresh()).resolves.toBeNull();
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "expired" });
    expect(storage.dump()[storageKeys.refreshToken]).toBeUndefined();
    expect(deps.onSignedOut).toHaveBeenCalled();
  });

  it("sem rede, mantém o refresh token para tentar depois", async () => {
    const refreshTokens = jest.fn(async () => {
      throw new ApiError(0, NETWORK_ERROR, "Sem conexão");
    });
    const { manager, storage } = setup({ refreshTokens });
    await manager.begin(authResult);
    await expect(manager.refresh()).rejects.toMatchObject({ code: NETWORK_ERROR });
    expect(storage.dump()[storageKeys.refreshToken]).toBe("refresh-1");
  });

  it("restaura a sessão salva ao abrir o app", async () => {
    const { manager, deps } = setup({}, { [storageKeys.refreshToken]: "refresh-1" });
    await manager.restore();
    expect(deps.refreshTokens).toHaveBeenCalledWith("refresh-1");
    expect(useSessionStore.getState()).toMatchObject({ status: "signedIn", user });
  });

  it("sem sessão salva, vai para o login sem aviso", async () => {
    const { manager, deps } = setup();
    await manager.restore();
    expect(deps.refreshTokens).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: null });
  });

  it("sem rede ao abrir, avisa e preserva a sessão salva", async () => {
    const refreshTokens = jest.fn(async () => {
      throw new ApiError(0, NETWORK_ERROR, "Sem conexão");
    });
    const { manager, storage } = setup({ refreshTokens }, { [storageKeys.refreshToken]: "refresh-1" });
    await manager.restore();
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "offline" });
    expect(storage.dump()[storageKeys.refreshToken]).toBe("refresh-1");
  });

  it("sair revoga o refresh token no servidor e limpa o aparelho", async () => {
    const { manager, deps, storage } = setup();
    await manager.begin(authResult);
    await manager.signOut("logout");
    expect(deps.revokeRefreshToken).toHaveBeenCalledWith("refresh-1");
    expect(storage.dump()[storageKeys.refreshToken]).toBeUndefined();
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "logout" });
    await expect(manager.getAccessToken()).resolves.toBeNull();
  });

  it("sessão revogada pela API volta ao login com aviso de expiração", async () => {
    const { manager } = setup();
    await manager.begin(authResult);
    manager.expire();
    await new Promise((r) => setTimeout(r, 0));
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "expired" });
  });
});
