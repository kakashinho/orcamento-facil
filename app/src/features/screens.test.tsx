import * as Biometrics from "@sbaiahmed1/react-native-biometrics";
import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { useSessionStore } from "@/data/session/session-store";
import { useMaintenanceStore } from "@/data/system/maintenance-store";
import { overview, transaction, usdWallet, user, wallet, walletSummary } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { HomeScreen } from "./home/home-screen";
import { useThemePreference } from "./preferences/theme-preference";
import { PreferencesScreen } from "./preferences/preferences-screen";
import { WalletsScreen } from "./wallets/wallets-screen";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

describe("início (R55, R83)", () => {
  beforeEach(() => signIn());

  it("mostra patrimônio, resumo do mês, carteiras, maiores despesas e atividade recente em uma requisição", async () => {
    const api = setupApi();
    await renderWithProviders(<HomeScreen />, { sheets: true });
    expect(await screen.findByText("R$ 2.584,00")).toBeOnTheScreen();
    expect(screen.getByText("Olá, joao 👋")).toBeOnTheScreen();
    expect(screen.getByText("R$ 6.800,00")).toBeOnTheScreen();
    expect(screen.getByText("R$ 2.200,00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Conta corrente: saldo R$ 1.500,00. Toque para transferir.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Reserva Viagem: saldo US$ 200,00. Toque para transferir.")).toBeOnTheScreen();
    expect(within(screen.getByTestId("top-categories")).getByText("60%")).toBeOnTheScreen();
    expect(screen.getByText("Almoço")).toBeOnTheScreen();
    expect(api.callsTo("GET", "/api/reports/overview")).toHaveLength(1);
  });

  it("abre o formulário de registro pelo atalho", async () => {
    setupApi();
    await renderWithProviders(<HomeScreen />, { sheets: true });
    await screen.findByText("R$ 2.584,00");
    await fireEvent.press(screen.getByRole("button", { name: "Registrar transação" }));
    expect(await screen.findByText("Nova transação")).toBeOnTheScreen();
  });

  it("avisa a manutenção e bloqueia os atalhos de escrita (R72)", async () => {
    setupApi();
    useMaintenanceStore.getState().setFromStatus(true, "Atualização em andamento.");
    await renderWithProviders(<HomeScreen />, { sheets: true });
    expect(await screen.findByTestId("maintenance-banner")).toBeOnTheScreen();
    expect(screen.getByText(/Atualização em andamento\./)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Registrar transação" })).toBeDisabled();
  });

  it("mostra a lista vazia de forma amigável", async () => {
    setupApi().on("GET", "/api/reports/overview", {
      body: overview({ recentTransactions: [], topExpenseCategories: [] }),
    });
    await renderWithProviders(<HomeScreen />, { sheets: true });
    expect(await screen.findByText("Nada por aqui ainda")).toBeOnTheScreen();
  });
});

describe("carteiras (R53, R54, R55, R56, R29)", () => {
  beforeEach(() => signIn());

  it("lista o saldo de cada carteira e o valor convertido", async () => {
    setupApi().on("GET", "/api/transfers", { body: { data: [], nextCursor: null } });
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    expect(await screen.findByText("R$ 1.500,00")).toBeOnTheScreen();
    expect(screen.getByText("US$ 200,00")).toBeOnTheScreen();
    expect(screen.getByText("≈ R$ 1.084,00")).toBeOnTheScreen();
    expect(screen.getByText("Dólar americano")).toBeOnTheScreen();
  });

  it("cria carteira com tipo, moeda própria e saldo inicial", async () => {
    const api = setupApi()
      .on("GET", "/api/transfers", { body: { data: [], nextCursor: null } })
      .on("POST", "/api/wallets", { status: 201, body: wallet({ id: "novo" }) });
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await screen.findByText("R$ 1.500,00");
    await fireEvent.press(screen.getByRole("button", { name: "Criar nova carteira" }));
    const form = await screen.findByTestId("wallet-form");
    await fireEvent.changeText(within(form).getByLabelText("Nome da carteira"), "Viagem Europa");
    await fireEvent.press(within(form).getByRole("button", { name: "Poupança" }));
    await fireEvent.press(within(form).getByRole("button", { name: "€ EUR" }));
    await fireEvent.changeText(within(form).getByLabelText("Saldo inicial (EUR)"), "250,00");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar carteira" }));
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/wallets")!.body).toEqual({
        name: "Viagem Europa",
        type: "savings",
        currency: "EUR",
        initialBalance: 250,
        isDefault: false,
      }),
    );
    expect(await screen.findByText("Carteira criada")).toBeOnTheScreen();
  });

  it("transfere entre carteiras de moedas diferentes com conversão e chave de idempotência", async () => {
    const api = setupApi()
      .on("GET", "/api/transfers", { body: { data: [], nextCursor: null } })
      .on("GET", "/api/exchange-rates/convert", (req) => ({
        body: {
          from: req.query.from,
          to: req.query.to,
          amount: Number(req.query.amount),
          result: 18.45,
          rate: 0.1845,
          updatedAt: "2026-10-04T12:00:00.000Z",
          stale: false,
        },
      }))
      .on("POST", "/api/transfers", { status: 201, body: {} });
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await screen.findByText("R$ 1.500,00");
    await fireEvent.press(screen.getAllByRole("button", { name: "Transferir" })[0]);
    const form = await screen.findByTestId("transfer-form");
    await fireEvent.changeText(within(form).getByLabelText("Valor a transferir"), "100");
    expect(await within(form).findByText("US$ 18,45", {}, { timeout: 2000 })).toBeOnTheScreen();
    await fireEvent.press(within(form).getByRole("button", { name: "Transferir" }));

    await waitFor(() => expect(api.callsTo("POST", "/api/transfers")).toHaveLength(1));
    const call = api.lastCall("POST", "/api/transfers")!;
    expect(call.body).toEqual({ sourceWalletId: wallet().id, targetWalletId: usdWallet.id, amount: 100 });
    expect(call.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText("Transferência realizada!")).toBeOnTheScreen();
  });

  it("converte valores entre moedas com a cotação do servidor (R29)", async () => {
    setupApi()
      .on("GET", "/api/transfers", { body: { data: [], nextCursor: null } })
      .on("GET", "/api/exchange-rates/convert", {
        body: {
          from: "BRL",
          to: "USD",
          amount: 100,
          result: 18.45,
          rate: 0.1845,
          updatedAt: "2026-10-04T12:00:00.000Z",
          stale: false,
        },
      });
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await fireEvent.press(await screen.findByRole("button", { name: "Converter" }));
    const dialog = await screen.findByTestId("converter");
    await waitFor(() => expect(within(dialog).getByTestId("converter-result")).toHaveTextContent("US$ 18,45"), {
      timeout: 2000,
    });
    expect(within(dialog).getByText(/1 BRL = 0,1845 USD/)).toBeOnTheScreen();
  });

  it("exclui transferência com confirmação e oferece desfazer", async () => {
    const api = setupApi()
      .on("GET", "/api/transfers", {
        body: {
          data: [
            {
              id: "tr-1",
              sourceWallet: { id: wallet().id, name: "Conta corrente", currency: "BRL" },
              targetWallet: { id: usdWallet.id, name: "Reserva Viagem", currency: "USD" },
              amount: 100,
              targetAmount: 18.45,
              exchangeRate: 0.1845,
              date: "2026-10-03",
              description: null,
              createdAt: "",
            },
          ],
          nextCursor: null,
        },
      })
      .on("DELETE", "/api/transfers/:id", { status: 204 });
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await fireEvent.press(
      await screen.findByRole("button", { name: "Excluir transferência de Conta corrente para Reserva Viagem" }),
    );
    await fireEvent.press(await screen.findByRole("button", { name: "Excluir" }));
    await waitFor(() => expect(api.callsTo("DELETE", "/api/transfers/:id")).toHaveLength(1));
    expect(await screen.findByText("Transferência excluída")).toBeOnTheScreen();
  });
});

describe("preferências (R28, R40, R42, R52, R72)", () => {
  it("troca o tema e salva no perfil (R42)", async () => {
    await signIn();
    const api = setupApi().on("PATCH", "/api/users/me", (req) => ({ body: { ...user, ...req.body } }));
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("tab", { name: "Escuro" }));
    expect(useThemePreference.getState().preference).toBe("dark");
    await waitFor(() => expect(api.lastCall("PATCH", "/api/users/me")!.body).toEqual({ theme: "dark" }));
  });

  it("troca a moeda principal (R28)", async () => {
    await signIn();
    const api = setupApi().on("PATCH", "/api/users/me", (req) => ({ body: { ...user, ...req.body } }));
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "US$ USD" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/users/me")!.body).toEqual({ primaryCurrency: "USD" }));
    await waitFor(() => expect(useSessionStore.getState().user?.primaryCurrency).toBe("USD"));
  });

  it("ativa a biometria cadastrando a chave pública do aparelho (R40)", async () => {
    await signIn();
    const api = setupApi().on("POST", "/api/auth/biometric/credentials", {
      status: 201,
      body: { id: "cred-1", deviceName: "Pixel de Teste", keyType: "ec", createdAt: "", lastUsedAt: null },
    });
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("switch", { name: "Entrar com biometria" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/auth/biometric/credentials")).toHaveLength(1));
    expect(Biometrics.createKeys).toHaveBeenCalled();
    expect(await screen.findByText("Biometria ativada neste aparelho")).toBeOnTheScreen();
  });

  it("arquiva transações antigas em lote (R52)", async () => {
    await signIn();
    const api = setupApi().on("POST", "/api/transactions/archive", { body: { archived: 12 } });
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Arquivar transações antigas" }));
    await fireEvent.press(await screen.findByRole("button", { name: "Arquivar" }));
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/transactions/archive")!.body).toEqual({
        before: expect.stringMatching(/^\d{4}-01-01$/),
      }),
    );
    expect(await screen.findByText("12 transações arquivadas")).toBeOnTheScreen();
  });

  it("só administradores veem o modo manutenção e podem ligá-lo (R72)", async () => {
    await signIn();
    setupApi();
    const { unmount } = await renderWithProviders(<PreferencesScreen />);
    expect(screen.queryByRole("switch", { name: "Modo manutenção" })).toBeNull();
    await unmount();

    await signIn({ role: "admin" });
    const api = setupApi().on("PUT", "/api/admin/maintenance", {
      body: { enabled: true, message: null, forced: false, updatedAt: null },
    });
    await renderWithProviders(<PreferencesScreen />);
    await fireEvent.press(screen.getByRole("switch", { name: "Modo manutenção" }));
    await waitFor(() => expect(api.lastCall("PUT", "/api/admin/maintenance")!.body).toEqual({ enabled: true }));
    await waitFor(() => expect(useMaintenanceStore.getState().enabled).toBe(true));
  });
});

describe("transações recentes (fixture)", () => {
  it("usa dados coerentes com a API", () => {
    expect(walletSummary().totalBalance).toBe(2584);
    expect(transaction().currency).toBe("BRL");
  });
});
