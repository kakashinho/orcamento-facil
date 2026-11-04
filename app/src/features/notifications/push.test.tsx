import { act, fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { logger } from "@/core/logging/logger";
import { session } from "@/data/client";
import { useSessionStore } from "@/data/session/session-store";
import { transaction } from "@/test-utils/fixtures";
import { apiError } from "@/test-utils/fake-api";
import { secureStoreData } from "@/test-utils/native-mocks";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { AppBar } from "../shell/app-bar";
import { isPushAvailable, showNotificationsInForeground } from "./native-notifications";
import { PushNotifications } from "./push-notifications";
import { pushStorageKeys, registerPushDevice } from "./push-registration";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

// No Jest o ambiente parece o Expo Go (o preset simula o módulo ExpoGo): aqui ele vira um app instalado.
const mockExpoGo = { value: false };
jest.mock("expo", () => ({ ...jest.requireActual("expo"), isRunningInExpoGo: () => mockExpoGo.value }));

const native = jest.mocked(Notifications);

type Permission = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
const permission = (status: "granted" | "denied" | "undetermined", canAskAgain = true) =>
  ({ status, granted: status === "granted", canAskAgain, expires: "never" }) as Permission;
const granted = permission("granted");

/** Resposta de toque como o expo-notifications entrega para uma mensagem direta do FCM. */
const response = (data: Record<string, string>, identifier: string, where: "content" | "trigger" = "content") =>
  ({
    actionIdentifier: "expo.modules.notifications.actions.DEFAULT",
    notification: {
      date: 0,
      request: {
        identifier,
        content: { title: "Aviso", body: "Abra o app", data: where === "content" ? data : null },
        trigger: { type: "push", remoteMessage: where === "trigger" ? { data } : undefined },
      },
    },
  }) as unknown as Notifications.NotificationResponse;

/** Deixa terminar as promessas encadeadas do registro (permissão → token → API → SecureStore). */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

function withDevices() {
  return setupApi()
    .on("POST", "/api/notifications/devices", (req) => ({
      status: 201,
      body: { id: req.body.token === "fcm-token-de-teste" ? "dev-1" : "dev-2" },
    }))
    .on("DELETE", "/api/notifications/devices/:id", { status: 204 })
    .on("POST", "/api/notifications/:id/read", { body: {} })
    .on("POST", "/api/auth/logout", { status: 204 });
}

beforeEach(() => signIn());

afterEach(() => {
  mockExpoGo.value = false;
  native.getPermissionsAsync.mockImplementation(async () => granted);
  native.requestPermissionsAsync.mockImplementation(async () => granted);
});

describe("registro do aparelho para push (R18)", () => {
  it("ao entrar, cria o canal, registra o token do FCM com o modelo e guarda só o id no SecureStore", async () => {
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(secureStoreData().get(pushStorageKeys.deviceId)).toBe("dev-1"));
    expect(api.lastCall("POST", "/api/notifications/devices")!.body).toEqual({
      token: "fcm-token-de-teste",
      deviceName: "Pixel de Teste",
    });
    expect(native.setNotificationChannelAsync).toHaveBeenCalledWith(
      "avisos",
      expect.objectContaining({ name: "Avisos", importance: native.AndroidImportance.HIGH }),
    );
    expect([...secureStoreData().values()]).not.toContain("fcm-token-de-teste");
    expect(JSON.stringify(logger.entries())).not.toContain("fcm-token-de-teste");
    expect(screen.queryByText("Quer receber lembretes e alertas?")).toBeNull();
  });

  it("registra de novo quando o FCM troca o token", async () => {
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(1));
    const onToken = native.addPushTokenListener.mock.calls[0][0];
    await act(async () => onToken({ type: "android", data: "token-renovado" }));
    await waitFor(() => expect(secureStoreData().get(pushStorageKeys.deviceId)).toBe("dev-2"));
    expect(api.lastCall("POST", "/api/notifications/devices")!.body.token).toBe("token-renovado");
  });

  it("sem permissão não registra; na primeira vez explica e, ao permitir, cria o canal antes do pedido", async () => {
    let current = permission("undetermined");
    native.getPermissionsAsync.mockImplementation(async () => current);
    native.requestPermissionsAsync.mockImplementation(async () => (current = granted));
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    const dialog = await screen.findByTestId("push-permission-offer");
    expect(within(dialog).getByText("Quer receber lembretes e alertas?")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(0);

    await fireEvent.press(within(dialog).getByRole("button", { name: "Permitir" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(1));
    expect(native.setNotificationChannelAsync.mock.invocationCallOrder[0]).toBeLessThan(
      native.requestPermissionsAsync.mock.invocationCallOrder[0],
    );
    expect(secureStoreData().get(pushStorageKeys.permissionOffered)).toBe("1");
    await waitFor(() => expect(screen.queryByText("Quer receber lembretes e alertas?")).toBeNull());
  });

  it("'Agora não' não pede ao sistema e o convite não volta na próxima entrada", async () => {
    native.getPermissionsAsync.mockImplementation(async () => permission("undetermined"));
    const api = withDevices();
    const first = await renderWithProviders(<PushNotifications />, { sheets: true });
    await fireEvent.press(await screen.findByRole("button", { name: "Agora não" }));
    await waitFor(() => expect(secureStoreData().get(pushStorageKeys.permissionOffered)).toBe("1"));
    await first.unmount();

    await renderWithProviders(<PushNotifications />, { sheets: true });
    await flush();
    expect(screen.queryByText("Quer receber lembretes e alertas?")).toBeNull();
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(0);
  });

  it("permissão bloqueada no sistema não mostra o convite nem registra", async () => {
    native.getPermissionsAsync.mockImplementation(async () => permission("denied", false));
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await flush();
    expect(screen.queryByText("Quer receber lembretes e alertas?")).toBeNull();
    expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(0);
    await expect(registerPushDevice()).resolves.toBeNull();
  });

  it("no Expo Go o push fica indisponível: nada é pedido nem registrado", async () => {
    mockExpoGo.value = true;
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await flush();
    expect(isPushAvailable()).toBe(false);
    expect(native.getPermissionsAsync).not.toHaveBeenCalled();
    expect(native.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(native.addPushTokenListener).not.toHaveBeenCalled();
    expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(0);
    showNotificationsInForeground();
    expect(native.setNotificationHandler).not.toHaveBeenCalled();
  });
});

describe("saída da conta com push (R18)", () => {
  it("no 'Sair', descadastra o aparelho antes de revogar a sessão e apaga o id local", async () => {
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(secureStoreData().get(pushStorageKeys.deviceId)).toBe("dev-1"));

    await act(() => session.signOut("logout"));
    const order = api.calls.map((call) => `${call.method} ${call.path}`);
    expect(order).toContain("DELETE /api/notifications/devices/dev-1");
    expect(order.indexOf("DELETE /api/notifications/devices/dev-1")).toBeLessThan(
      order.indexOf("POST /api/auth/logout"),
    );
    expect(api.lastCall("DELETE", "/api/notifications/devices/:id")!.headers.authorization).toMatch(/^Bearer /);
    expect(secureStoreData().has(pushStorageKeys.deviceId)).toBe(false);
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "logout" });
  });

  it("se o descadastro falhar, a saída continua normalmente", async () => {
    const api = withDevices().on(
      "DELETE",
      "/api/notifications/devices/:id",
      apiError(500, "INTERNAL_ERROR", "Erro interno."),
    );
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(secureStoreData().get(pushStorageKeys.deviceId)).toBe("dev-1"));

    await act(() => session.signOut("logout"));
    expect(api.callsTo("DELETE", "/api/notifications/devices/:id")).toHaveLength(1);
    expect(api.callsTo("POST", "/api/auth/logout")).toHaveLength(1);
    expect(secureStoreData().has(pushStorageKeys.deviceId)).toBe(false);
    expect(useSessionStore.getState()).toMatchObject({ status: "signedOut", signedOutReason: "logout" });
  });

  it("sem aparelho registrado, o 'Sair' não chama o descadastro", async () => {
    native.getPermissionsAsync.mockImplementation(async () => permission("denied", false));
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await flush();
    await act(() => session.signOut("logout"));
    expect(api.callsTo("DELETE", "/api/notifications/devices/:id")).toHaveLength(0);
    expect(useSessionStore.getState().status).toBe("signedOut");
  });
});

describe("toque e chegada de notificações (R18)", () => {
  it("o toque marca como lida e abre a tela da entidade, uma vez só", async () => {
    const api = withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(native.addNotificationResponseReceivedListener).toHaveBeenCalled());
    const onResponse = native.addNotificationResponseReceivedListener.mock.calls[0][0];
    const tap = response({ notificationId: "n-1", kind: "low_balance", entityType: "wallet", entityId: "w-1" }, "p-1");

    await act(async () => onResponse(tap));
    expect(mockRouter.navigate).toHaveBeenCalledWith("/wallets");
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/notifications/:id/read")!.path).toBe("/api/notifications/n-1/read"),
    );
    await act(async () => onResponse(tap));
    expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
  });

  it("o toque num aviso de orçamento abre Planejamento › Orçamentos", async () => {
    withDevices();
    await renderWithProviders(<PushNotifications />, { sheets: true });
    await waitFor(() => expect(native.addNotificationResponseReceivedListener).toHaveBeenCalled());
    const onResponse = native.addNotificationResponseReceivedListener.mock.calls[0][0];
    await act(async () =>
      onResponse(
        response({ notificationId: "", kind: "budget_exceeded", entityType: "budget", entityId: "b-1" }, "p-2"),
      ),
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith({ pathname: "/planning", params: { section: "budgets" } });
  });

  it("o toque que abriu o app fechado mostra os detalhes da transação", async () => {
    const tx = transaction({ id: "tx-push", description: "Compra de madrugada" });
    native.getLastNotificationResponseAsync.mockResolvedValueOnce(
      response(
        { notificationId: "n-3", kind: "unusual_transaction", entityType: "transaction", entityId: tx.id },
        "p-3",
        "trigger",
      ),
    );
    const api = withDevices().on("GET", "/api/transactions/:id", { body: tx });
    await renderWithProviders(<PushNotifications />, { sheets: true });
    const details = await screen.findByTestId("transaction-details");
    expect(within(details).getByText("Compra de madrugada")).toBeOnTheScreen();
    expect(api.lastCall("GET", "/api/transactions/:id")!.path).toBe("/api/transactions/tx-push");
  });

  it("com o app aberto, o push aparece como banner e atualiza o sino", async () => {
    showNotificationsInForeground();
    const handler = native.setNotificationHandler.mock.calls[0][0]!;
    await expect(handler.handleNotification({} as Notifications.Notification)).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });

    let unread = 0;
    withDevices().on("GET", "/api/notifications/unread-count", () => ({ body: { count: unread } }));
    await renderWithProviders(
      <>
        <AppBar />
        <PushNotifications />
      </>,
      { sheets: true },
    );
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeOnTheScreen();
    await waitFor(() => expect(native.addNotificationReceivedListener).toHaveBeenCalled());
    unread = 1;
    await act(async () => native.addNotificationReceivedListener.mock.calls[0][0]({} as Notifications.Notification));
    expect(await screen.findByRole("button", { name: "Notificações, 1 não lida" })).toBeOnTheScreen();
  });
});
