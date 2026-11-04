import { fireEvent, screen, waitFor, within } from "@testing-library/react-native";
import { usdWallet, wallet, walletSummary } from "@/test-utils/fixtures";
import { renderWithProviders, setupApi, signIn } from "@/test-utils/render";
import { parseMinBalance } from "./wallet-form-sheet";
import { WalletsScreen } from "./wallets-screen";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({}) }));

const MIN_LABEL = "Saldo mínimo (BRL, opcional)";

function setup(wallets = [wallet(), usdWallet]) {
  return setupApi()
    .on("GET", "/api/wallets/summary", { body: walletSummary(wallets) })
    .on("GET", "/api/transfers", { body: { data: [], nextCursor: null } })
    .on("POST", "/api/wallets", (req) => ({ status: 201, body: wallet({ id: "nova", ...req.body }) }))
    .on("PATCH", "/api/wallets/:id", (req) => ({ body: wallet(req.body) }));
}

async function openEditor(name: string) {
  await renderWithProviders(<WalletsScreen />, { sheets: true });
  const card = await screen.findByTestId(`wallet-${wallet().id}`);
  expect(within(card).getByText(name)).toBeOnTheScreen();
  await fireEvent.press(within(card).getByRole("button", { name: "Editar" }));
  return screen.findByTestId("wallet-form");
}

beforeEach(() => signIn());

describe("saldo mínimo da carteira (R78)", () => {
  it("interpreta o campo: vazio = sem aviso, aceita negativo e recusa texto inválido", () => {
    expect(parseMinBalance("")).toBeNull();
    expect(parseMinBalance("  ")).toBeNull();
    expect(parseMinBalance("150,50")).toBe(150.5);
    expect(parseMinBalance("-1.000,00")).toBe(-1000);
    expect(parseMinBalance("abc")).toBeUndefined();
  });

  it("cria a carteira com saldo mínimo, inclusive negativo (cartão de crédito)", async () => {
    const api = setup();
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await screen.findByText("R$ 1.500,00");
    await fireEvent.press(screen.getByRole("button", { name: "Criar nova carteira" }));
    const form = await screen.findByTestId("wallet-form");
    await fireEvent.changeText(within(form).getByLabelText("Nome da carteira"), "Cartão");
    await fireEvent.changeText(within(form).getByLabelText(MIN_LABEL), "-500,00");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar carteira" }));
    await waitFor(() =>
      expect(api.lastCall("POST", "/api/wallets")!.body).toEqual({
        name: "Cartão",
        type: "checking",
        currency: "BRL",
        initialBalance: 0,
        isDefault: false,
        minBalance: -500,
      }),
    );
  });

  it("sem o campo, a criação continua igual (não envia minBalance)", async () => {
    const api = setup();
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    await screen.findByText("R$ 1.500,00");
    await fireEvent.press(screen.getByRole("button", { name: "Criar nova carteira" }));
    const form = await screen.findByTestId("wallet-form");
    await fireEvent.changeText(within(form).getByLabelText("Nome da carteira"), "Reserva");
    await fireEvent.press(within(form).getByRole("button", { name: "Criar carteira" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/wallets")).toHaveLength(1));
    expect(api.lastCall("POST", "/api/wallets")!.body).not.toHaveProperty("minBalance");
  });

  it("define o mínimo ao editar e recusa valor inválido sem chamar a API", async () => {
    const api = setup();
    const form = await openEditor("Conta corrente");
    const field = within(form).getByLabelText(MIN_LABEL);
    expect(field).toHaveDisplayValue("");
    await fireEvent.changeText(field, "dez reais");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    expect(await within(form).findByText("Informe um valor válido, com até duas casas decimais.")).toBeOnTheScreen();
    expect(api.callsTo("PATCH", "/api/wallets/:id")).toHaveLength(0);

    await fireEvent.changeText(field, "200,00");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/wallets/:id")!.body).toEqual({ minBalance: 200 }));
    expect(await screen.findByText("Carteira atualizada")).toBeOnTheScreen();
  });

  it("altera e remove o mínimo; sem mudança no campo, ele não é enviado", async () => {
    const api = setup([wallet({ minBalance: 100 }), usdWallet]);
    let form = await openEditor("Conta corrente");
    const field = within(form).getByLabelText(MIN_LABEL);
    expect(field).toHaveDisplayValue("100,00");
    await fireEvent.changeText(within(form).getByLabelText("Nome da carteira"), "Conta principal");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/wallets/:id")!.body).toEqual({ name: "Conta principal" }));

    await fireEvent.press(
      within(await screen.findByTestId(`wallet-${wallet().id}`)).getByRole("button", { name: "Editar" }),
    );
    form = await screen.findByTestId("wallet-form");
    await fireEvent.changeText(within(form).getByLabelText(MIN_LABEL), "250");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/wallets/:id")!.body).toEqual({ minBalance: 250 }));

    await fireEvent.press(
      within(await screen.findByTestId(`wallet-${wallet().id}`)).getByRole("button", { name: "Editar" }),
    );
    form = await screen.findByTestId("wallet-form");
    await fireEvent.changeText(within(form).getByLabelText(MIN_LABEL), "");
    await fireEvent.press(within(form).getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(api.lastCall("PATCH", "/api/wallets/:id")!.body).toEqual({ minBalance: null }));
    expect(api.callsTo("PATCH", "/api/wallets/:id")).toHaveLength(3);
  });

  it("mostra o selo 'Abaixo do mínimo' quando o saldo fica abaixo e o mínimo nas demais", async () => {
    setup([wallet({ balance: 80, minBalance: 100 }), { ...usdWallet, minBalance: 50 }]);
    await renderWithProviders(<WalletsScreen />, { sheets: true });
    const low = await screen.findByTestId(`wallet-${wallet().id}`);
    expect(within(low).getByText("Abaixo do mínimo")).toBeOnTheScreen();
    expect(within(low).getByLabelText("Saldo abaixo do mínimo de R$ 100,00")).toBeOnTheScreen();
    const ok = screen.getByTestId(`wallet-${usdWallet.id}`);
    expect(within(ok).queryByText("Abaixo do mínimo")).toBeNull();
    expect(within(ok).getByText("Mínimo: US$ 50,00")).toBeOnTheScreen();
  });
});
