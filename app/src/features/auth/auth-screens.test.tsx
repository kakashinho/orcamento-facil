import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import { storageKeys } from "@/core/storage/secure-storage";
import { useSessionStore } from "@/data/session/session-store";
import { apiError } from "@/test-utils/fake-api";
import { authResult, user } from "@/test-utils/fixtures";
import { secureStoreData } from "@/test-utils/native-mocks";
import { renderWithProviders, setupApi } from "@/test-utils/render";
import { LoginScreen } from "./login-screen";
import { ForgotPasswordScreen, ResetPasswordScreen } from "./password-recovery-screens";
import { RegisterScreen } from "./register-screen";

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => mockParams }));

describe("login (R03, R87)", () => {
  it("entra com e-mail e senha e inicia a sessão", async () => {
    const api = setupApi().on("POST", "/api/auth/login", { body: authResult });
    await renderWithProviders(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail ou nome de usuário"), "joao@orcamentofacil.app");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "Senha@Forte123");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("signedIn"));
    expect(api.lastCall("POST", "/api/auth/login")!.body).toEqual({
      email: "joao@orcamentofacil.app",
      password: "Senha@Forte123",
    });
    expect(secureStoreData().get(storageKeys.refreshToken)).toBe("refresh-1");
  });

  it("aceita o nome de usuário no lugar do e-mail", async () => {
    const api = setupApi().on("POST", "/api/auth/login", { body: authResult });
    await renderWithProviders(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail ou nome de usuário"), "joao");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "Senha@Forte123");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/auth/login")).toHaveLength(1));
    expect(api.lastCall("POST", "/api/auth/login")!.body).toEqual({ username: "joao", password: "Senha@Forte123" });
  });

  it("mostra credenciais inválidas no campo de senha", async () => {
    setupApi().on(
      "POST",
      "/api/auth/login",
      apiError(401, "INVALID_CREDENTIALS", "E-mail/usuário ou senha inválidos."),
    );
    await renderWithProviders(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail ou nome de usuário"), "joao");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "errada");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("E-mail/usuário ou senha inválidos.")).toBeOnTheScreen();
    expect(useSessionStore.getState().status).not.toBe("signedIn");
  });

  it("bloqueia com contagem regressiva após várias tentativas (R87)", async () => {
    setupApi().on("POST", "/api/auth/login", {
      ...apiError(423, "ACCOUNT_LOCKED", "Conta bloqueada temporariamente.", { retryAfterSeconds: 90 }),
      headers: { "retry-after": "90" },
    });
    await renderWithProviders(<LoginScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail ou nome de usuário"), "joao");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "errada");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Conta bloqueada")).toBeOnTheScreen();
    expect(screen.getByText("01:30")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Prefiro redefinir a senha" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/forgot-password");
  });

  it("avisa quando a sessão expirou", async () => {
    setupApi();
    useSessionStore.getState().setSignedOut("expired");
    await renderWithProviders(<LoginScreen />);
    expect(screen.getByText("Sua sessão expirou. Entre novamente para continuar.")).toBeOnTheScreen();
  });

  it("orienta a ativar a biometria quando não há credencial no aparelho (R40)", async () => {
    setupApi();
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Entrar com biometria" }));
    expect(
      await screen.findByText("Entre com a senha e ative a biometria em Preferências para usar a digital."),
    ).toBeOnTheScreen();
  });

  it("entra com a digital quando a biometria está ativa (R40)", async () => {
    const api = setupApi()
      .on("POST", "/api/auth/biometric/challenge", {
        body: { credentialId: "cred-1", challenge: "abc", expiresAt: "" },
      })
      .on("POST", "/api/auth/biometric/login", { body: authResult });
    secureStoreData().set(
      storageKeys.biometricCredential,
      JSON.stringify({ credentialId: "cred-1", account: user.email }),
    );
    await renderWithProviders(<LoginScreen />);
    expect(await screen.findByText(user.email)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Entrar com biometria" }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("signedIn"));
    expect(api.lastCall("POST", "/api/auth/biometric/login")!.body).toEqual({
      credentialId: "cred-1",
      challenge: "abc",
      signature: "c2lnbmF0dXJl",
    });
  });
});

describe("endereço do servidor (demonstração)", () => {
  it("troca o servidor pela tela de login, guarda no aparelho e passa a usá-lo", async () => {
    const api = setupApi().on("POST", "/api/auth/login", { body: authResult });
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByTestId("server-address-button"));
    await fireEvent.changeText(screen.getByTestId("server-address-input"), "192.168.0.99");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));

    expect(secureStoreData().get(storageKeys.serverAddress)).toBe("http://192.168.0.99");
    expect(await screen.findByText("Servidor: 192.168.0.99")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("E-mail ou nome de usuário"), "joao");
    await fireEvent.changeText(screen.getByLabelText("Senha"), "Senha@Forte123");
    await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(api.callsTo("POST", "/api/auth/login")).toHaveLength(1));
    expect(api.lastCall("POST", "/api/auth/login")!.host).toBe("192.168.0.99");
  });

  it("recusa endereço inválido e volta ao padrão", async () => {
    setupApi();
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByTestId("server-address-button"));
    await fireEvent.changeText(screen.getByTestId("server-address-input"), "192.168 .0.1");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText(/Endereço inválido/)).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId("server-address-input"), "10.1.1.1");
    await fireEvent.press(screen.getByRole("button", { name: "Salvar" }));
    await fireEvent.press(screen.getByTestId("server-address-button"));
    await fireEvent.press(screen.getByRole("button", { name: "Usar o padrão" }));
    expect(secureStoreData().has(storageKeys.serverAddress)).toBe(false);
  });
});

describe("cadastro (R02)", () => {
  async function fill(password: string) {
    await fireEvent.changeText(screen.getByLabelText("Nome de usuário"), "ana.silva");
    await fireEvent.changeText(screen.getByLabelText("E-mail"), "ana@ex.com");
    await fireEvent.changeText(screen.getByLabelText("Senha"), password);
  }

  it("barra senha fraca antes de chamar a API e mostra a força", async () => {
    const api = setupApi();
    await renderWithProviders(<RegisterScreen />);
    await fill("abc");
    expect(screen.getByText("Força da senha: muito fraca")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
    expect(screen.getByText("A senha deve ter pelo menos 8 caracteres.")).toBeOnTheScreen();
    expect(api.callsTo("POST", "/api/auth/register")).toHaveLength(0);
  });

  it("mostra o erro do servidor no campo indicado em `details`", async () => {
    setupApi().on(
      "POST",
      "/api/auth/register",
      apiError(409, "EMAIL_TAKEN", "E-mail já cadastrado.", [
        { location: "body", path: "email", message: "E-mail já cadastrado." },
      ]),
    );
    await renderWithProviders(<RegisterScreen />);
    await fill("Senha@Forte123");
    await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("E-mail já cadastrado.")).toBeOnTheScreen();
  });

  it("cria a conta com a moeda escolhida e entra ao tocar em Começar", async () => {
    const api = setupApi().on("POST", "/api/auth/register", { status: 201, body: authResult });
    await renderWithProviders(<RegisterScreen />);
    await fill("Senha@Forte123");
    await fireEvent.press(screen.getByRole("button", { name: "US$ USD" }));
    await fireEvent.press(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByText("Conta criada!")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/auth/register")!.body).toEqual({
      username: "ana.silva",
      email: "ana@ex.com",
      password: "Senha@Forte123",
      primaryCurrency: "USD",
    });
    expect(useSessionStore.getState().status).not.toBe("signedIn");
    await fireEvent.press(screen.getByRole("button", { name: "Começar" }));
    await waitFor(() => expect(useSessionStore.getState().status).toBe("signedIn"));
  });
});

describe("recuperação de senha (R04)", () => {
  it("envia o link e orienta a verificar o e-mail", async () => {
    const api = setupApi().on("POST", "/api/auth/password/forgot", { status: 202, body: { message: "ok" } });
    await renderWithProviders(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText("E-mail"), "ana@ex.com");
    await fireEvent.press(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    expect(await screen.findByText("Verifique seu e-mail")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/auth/password/forgot")!.body).toEqual({ email: "ana@ex.com" });
  });

  it("redefine a senha com o token do link", async () => {
    mockParams = { token: "token-do-link" };
    const api = setupApi().on("POST", "/api/auth/password/reset", { status: 204 });
    await renderWithProviders(<ResetPasswordScreen />);
    expect(screen.getByDisplayValue("token-do-link")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText("Nova senha"), "Nova@Senha2026");
    await fireEvent.changeText(screen.getByLabelText("Confirmar nova senha"), "Nova@Senha2026");
    await fireEvent.press(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(await screen.findByText("Tudo certo!")).toBeOnTheScreen();
    expect(api.lastCall("POST", "/api/auth/password/reset")!.body).toEqual({
      token: "token-do-link",
      password: "Nova@Senha2026",
    });
    mockParams = {};
  });

  it("aponta link vencido no campo do código", async () => {
    setupApi().on(
      "POST",
      "/api/auth/password/reset",
      apiError(400, "INVALID_RESET_TOKEN", "Link inválido ou vencido."),
    );
    await renderWithProviders(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByLabelText("Código do link"), "velho");
    await fireEvent.changeText(screen.getByLabelText("Nova senha"), "Nova@Senha2026");
    await fireEvent.changeText(screen.getByLabelText("Confirmar nova senha"), "Nova@Senha2026");
    await fireEvent.press(screen.getByRole("button", { name: "Redefinir senha" }));
    expect(await screen.findByText("Link inválido ou vencido.")).toBeOnTheScreen();
  });
});
