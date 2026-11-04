import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";
import { Linking } from "react-native";
import { useSessionStore } from "@/data/session/session-store";
import { apiError } from "@/test-utils/fake-api";
import { secureStoreData } from "@/test-utils/native-mocks";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { pushStorageKeys } from "../notifications/push-registration";
import { formatHour } from "./notifications-section";
import { PreferencesScreen } from "./preferences-screen";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

// No Jest o ambiente parece o Expo Go (o preset simula o módulo ExpoGo): aqui ele vira um app instalado.
const mockExpoGo = { value: false };
jest.mock("expo", () => ({ ...jest.requireActual("expo"), isRunningInExpoGo: () => mockExpoGo.value }));

const native = jest.mocked(Notifications);

type Permission = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;
const permission = (status: "granted" | "denied" | "undetermined", canAskAgain = true) =>
  ({ status, granted: status === "granted", canAskAgain, expires: "never" }) as Permission;

function withSettings() {
  return setupApi()
    .on("PATCH", "/api/notifications/settings", (req) => ({
      body: {
        dailyReminderEnabled: true,
        dailyReminderHour: 20,
        goalRemindersEnabled: true,
        billRemindersEnabled: true,
        alertsPushEnabled: true,
        ...req.body,
      },
    }))
    .on("POST", "/api/notifications/devices", { status: 201, body: { id: "dev-1" } });
}

async function renderSection() {
  await renderWithProviders(<PreferencesScreen />);
  return screen.findByTestId("notifications-section");
}

beforeEach(() => signIn());

afterEach(() => {
  mockExpoGo.value = false;
  native.getPermissionsAsync.mockImplementation(async () => permission("granted"));
  native.requestPermissionsAsync.mockImplementation(async () => permission("granted"));
});

describe("Preferências › Notificações (R18, R34)", () => {
  it("lê as preferências do servidor e salva cada interruptor (PATCH /settings)", async () => {
    const api = withSettings();
    const section = await renderSection();
    expect(await within(section).findByText("Permitidas neste aparelho")).toBeOnTheScreen();
    const bills = await within(section).findByRole("switch", { name: "Contas a vencer" });
    expect(bills).toBeChecked();
    expect(within(section).getByRole("switch", { name: "Vencimento de metas" })).toBeChecked();
    expect(within(section).getByRole("switch", { name: "Alertas por push" })).toBeChecked();

    await fireEvent.press(bills);
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ billRemindersEnabled: false }),
    );
    expect(within(section).getByRole("switch", { name: "Contas a vencer" })).not.toBeChecked();

    await fireEvent.press(within(section).getByRole("switch", { name: "Alertas por push" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ alertsPushEnabled: false }),
    );
    await fireEvent.press(within(section).getByRole("switch", { name: "Vencimento de metas" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ goalRemindersEnabled: false }),
    );
  });

  it("ajusta a hora do lembrete diário (0–23, dando a volta) e esconde a hora ao desligar", async () => {
    const api = withSettings().on("GET", "/api/notifications/settings", {
      body: {
        dailyReminderEnabled: true,
        dailyReminderHour: 23,
        goalRemindersEnabled: true,
        billRemindersEnabled: true,
        alertsPushEnabled: true,
      },
    });
    const section = await renderSection();
    expect(await within(section).findByTestId("daily-reminder-hour")).toHaveTextContent("23:00");
    await fireEvent.press(within(section).getByRole("button", { name: "Lembrar uma hora mais tarde" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ dailyReminderHour: 0 }),
    );
    expect(within(section).getByTestId("daily-reminder-hour")).toHaveTextContent("00:00");
    await fireEvent.press(within(section).getByRole("button", { name: "Lembrar uma hora mais cedo" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ dailyReminderHour: 23 }),
    );

    await fireEvent.press(within(section).getByRole("switch", { name: "Lembrete diário" }));
    await waitFor(() =>
      expect(api.lastCall("PATCH", "/api/notifications/settings")!.body).toEqual({ dailyReminderEnabled: false }),
    );
    expect(within(section).queryByTestId("daily-reminder-hour")).toBeNull();
    expect(formatHour(7)).toBe("07:00");
  });

  it("se o servidor recusar, volta o interruptor e avisa", async () => {
    withSettings().on(
      "PATCH",
      "/api/notifications/settings",
      apiError(503, "SERVICE_UNAVAILABLE", "Serviço indisponível."),
    );
    const section = await renderSection();
    const goals = await within(section).findByRole("switch", { name: "Vencimento de metas" });
    await fireEvent.press(goals);
    expect(await screen.findByText("Serviço indisponível.")).toBeOnTheScreen();
    await waitFor(() => expect(within(section).getByRole("switch", { name: "Vencimento de metas" })).toBeChecked());
  });

  it("sem permissão ainda, 'Permitir notificações' pede ao sistema e registra o aparelho", async () => {
    let current = permission("undetermined");
    native.getPermissionsAsync.mockImplementation(async () => current);
    native.requestPermissionsAsync.mockImplementation(async () => (current = permission("granted")));
    const api = withSettings();
    const section = await renderSection();
    expect(
      await within(section).findByText("Permita para receber os avisos mesmo com o app fechado"),
    ).toBeOnTheScreen();
    await fireEvent.press(within(section).getByRole("button", { name: "Permitir notificações" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/notifications/devices")).toHaveLength(1));
    expect(await screen.findByText("Notificações ativadas neste aparelho")).toBeOnTheScreen();
    expect(within(section).getByText("Permitidas neste aparelho")).toBeOnTheScreen();
    expect(secureStoreData().get(pushStorageKeys.deviceId)).toBe("dev-1");
  });

  it("bloqueada no sistema, oferece abrir as configurações do Android", async () => {
    native.getPermissionsAsync.mockImplementation(async () => permission("denied", false));
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    withSettings();
    const section = await renderSection();
    expect(await within(section).findByText("Bloqueadas nas configurações do Android")).toBeOnTheScreen();
    await fireEvent.press(within(section).getByRole("button", { name: "Abrir configurações" }));
    expect(openSettings).toHaveBeenCalled();
    openSettings.mockRestore();
  });

  it("no Expo Go avisa que o push só existe no app instalado, mas as preferências continuam editáveis", async () => {
    mockExpoGo.value = true;
    withSettings();
    const section = await renderSection();
    expect(
      await within(section).findByText("Disponível no app instalado (o Expo Go não recebe push)"),
    ).toBeOnTheScreen();
    expect(within(section).queryByRole("button", { name: "Permitir notificações" })).toBeNull();
    expect(await within(section).findByRole("switch", { name: "Lembrete diário" })).toBeEnabled();
  });

  it("'Sair de todos os aparelhos' descadastra este aparelho do push antes do logout geral", async () => {
    secureStoreData().set(pushStorageKeys.deviceId, "dev-7");
    const api = withSettings()
      .on("DELETE", "/api/notifications/devices/:id", { status: 204 })
      .on("POST", "/api/auth/logout-all", { status: 204 })
      .on("POST", "/api/auth/logout", { status: 204 });
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Sair de todos os aparelhos" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Sair de todos" }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("signedOut"));
    const order = api.calls.map((call) => `${call.method} ${call.path}`);
    expect(order.indexOf("DELETE /api/notifications/devices/dev-7")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("DELETE /api/notifications/devices/dev-7")).toBeLessThan(
      order.indexOf("POST /api/auth/logout-all"),
    );
    expect(secureStoreData().has(pushStorageKeys.deviceId)).toBe(false);
  });
});
