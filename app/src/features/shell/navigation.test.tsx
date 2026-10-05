import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { storageKeys } from "@/core/storage/secure-storage";
import { useSessionStore } from "@/data/session/session-store";
import { authResult, user } from "@/test-utils/fixtures";
import { secureStoreData } from "@/test-utils/native-mocks";
import { setupApi } from "@/test-utils/render";
import { ThemeProvider } from "@/ui";
import RootLayout from "../../app/_layout";
import AppLayout from "../../app/(app)/_layout";
import HomeRoute from "../../app/(app)/index";
import PreferencesRoute from "../../app/(app)/preferences";
import TransactionsRoute from "../../app/(app)/transactions";
import WalletsRoute from "../../app/(app)/wallets";
import AuthLayout from "../../app/(auth)/_layout";
import ForgotRoute from "../../app/(auth)/forgot-password";
import LoginRoute from "../../app/(auth)/login";
import RegisterRoute from "../../app/(auth)/register";
import ResetRoute from "../../app/reset-password";
import { AppNavigation } from "./navigation";

const routes = {
  _layout: RootLayout,
  "(auth)/_layout": AuthLayout,
  "(auth)/login": LoginRoute,
  "(auth)/register": RegisterRoute,
  "(auth)/forgot-password": ForgotRoute,
  "(app)/_layout": AppLayout,
  "(app)/index": HomeRoute,
  "(app)/transactions": TransactionsRoute,
  "(app)/wallets": WalletsRoute,
  "(app)/preferences": PreferencesRoute,
  "reset-password": ResetRoute,
};

const secureStore = secureStoreData;

describe("rotas protegidas (R03)", () => {
  afterEach(() => jest.useRealTimers());

  it("sem sessão salva, abre no login", async () => {
    setupApi();
    const router = renderRouter(routes, { initialUrl: "/" });
    await router;
    expect(await screen.findByText("Entre para acompanhar suas finanças.")).toBeOnTheScreen();
    expect(router.getPathname()).toBe("/login");
  });

  it("com sessão salva, restaura e abre o início com a navegação principal", async () => {
    secureStore().set(storageKeys.refreshToken, "refresh-0");
    const api = setupApi()
      .on("POST", "/api/auth/refresh", { body: authResult.tokens })
      .on("GET", "/api/users/me", { body: user })
      .on("GET", "/api/transactions", { body: { data: [], nextCursor: null } });
    const router = renderRouter(routes, { initialUrl: "/" });
    await router;
    expect(await screen.findByText("Suas finanças")).toBeOnTheScreen();
    expect(useSessionStore.getState().status).toBe("signedIn");
    expect(api.lastCall("POST", "/api/auth/refresh")!.body).toEqual({ refreshToken: "refresh-0" });
    expect(secureStore().get(storageKeys.refreshToken)).toBe("refresh-1");

    await fireEvent.press(screen.getByRole("tab", { name: "Transações" }));
    await waitFor(() => expect(router.getPathname()).toBe("/transactions"));
    expect(await screen.findByRole("tab", { name: "Histórico" })).toBeOnTheScreen();
  });

  it("refresh recusado leva ao login com aviso de sessão expirada (R87)", async () => {
    secureStore().set(storageKeys.refreshToken, "refresh-velho");
    setupApi().on("POST", "/api/auth/refresh", {
      status: 401,
      body: { statusCode: 401, code: "INVALID_REFRESH_TOKEN", message: "Sessão inválida." },
    });
    const router = renderRouter(routes, { initialUrl: "/" });
    await router;
    expect(await screen.findByTestId("session-expired")).toBeOnTheScreen();
    expect(router.getPathname()).toBe("/login");
  });
});

describe("navegação responsiva (R82)", () => {
  function props(navigate = jest.fn()) {
    return {
      state: {
        index: 0,
        routes: ["index", "transactions", "wallets", "preferences"].map((name) => ({ key: `${name}-key`, name })),
      },
      navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate },
      descriptors: {},
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
    } as never;
  }

  async function renderNav(wide: boolean, navigate = jest.fn()) {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 400, height: 800 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <ThemeProvider scheme="light">
          <AppNavigation {...(props(navigate) as object as Parameters<typeof AppNavigation>[0])} wide={wide} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  }

  it("mostra os quatro destinos do protótipo e marca o ativo", async () => {
    await renderNav(false);
    for (const label of ["Início", "Transações", "Carteiras", "Preferências"]) {
      expect(screen.getByRole("tab", { name: label })).toBeOnTheScreen();
    }
    expect(screen.getByRole("tab", { name: "Início" })).toBeSelected();
    expect(screen.getByTestId("navigation-bar")).toBeOnTheScreen();
  });

  it("navega ao tocar em um destino", async () => {
    const navigate = jest.fn();
    await renderNav(false, navigate);
    await fireEvent.press(screen.getByRole("tab", { name: "Carteiras" }));
    expect(navigate).toHaveBeenCalledWith("wallets");
  });

  it("vira trilho lateral em telas largas", async () => {
    await renderNav(true);
    expect(screen.getByTestId("navigation-rail")).toHaveStyle({ width: 88 });
    expect(screen.queryByTestId("navigation-bar")).toBeNull();
  });
});
