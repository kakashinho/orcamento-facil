import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiClient, createTestApp, PASSWORD, registerUser, type TestContext, unique } from "./support/test-app.js";

describe("autenticação (R02, R03, R04, R87)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ MAX_FAILED_LOGIN_ATTEMPTS: "3", LOGIN_LOCKOUT_MINUTES: "15" });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const login = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: "POST", url: "/api/auth/login", payload });

  describe("cadastro (R02)", () => {
    it("cria a conta, devolve tokens e uma carteira padrão", async () => {
      const username = unique("maria");
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: `${username.toUpperCase()}@Exemplo.com`, username, password: PASSWORD },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user).toMatchObject({ email: `${username}@exemplo.com`, username, role: "user", primaryCurrency: "BRL" });
      expect(body.tokens).toMatchObject({ tokenType: "Bearer", expiresIn: 900 });
      expect(body.user).not.toHaveProperty("passwordHash");

      const wallets = (await apiClient(ctx.app, body.tokens.accessToken).get("/api/wallets")).json();
      expect(wallets.data).toHaveLength(1);
      expect(wallets.data[0]).toMatchObject({ isDefault: true, currency: "BRL", balance: 0 });
    });

    it("exige senha forte e explica o que falta", async () => {
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: `${unique()}@x.com`, username: unique(), password: "fraca123" },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().details.password).toEqual(
        expect.arrayContaining([
          "A senha deve conter pelo menos uma letra maiúscula.",
          "A senha deve conter pelo menos um caractere especial.",
        ]),
      );
    });

    it("recusa e-mail ou nome de usuário já usados, sem diferenciar maiúsculas", async () => {
      const user = await registerUser(ctx.app);
      const sameEmail = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: user.email.toUpperCase(), username: unique(), password: PASSWORD },
      });
      expect(sameEmail.statusCode).toBe(409);
      expect(sameEmail.json().code).toBe("EMAIL_ALREADY_REGISTERED");

      const sameUsername = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/register",
        payload: { email: `${unique()}@x.com`, username: user.username.toUpperCase(), password: PASSWORD },
      });
      expect(sameUsername.statusCode).toBe(409);
      expect(sameUsername.json().code).toBe("USERNAME_TAKEN");
    });
  });

  describe("login e sessão (R03)", () => {
    it("autentica por e-mail ou nome de usuário", async () => {
      const user = await registerUser(ctx.app);
      expect((await login({ email: user.email, password: PASSWORD })).statusCode).toBe(200);
      const byUsername = await login({ username: user.username, password: PASSWORD });
      expect(byUsername.statusCode).toBe(200);
      const me = await apiClient(ctx.app, byUsername.json().tokens.accessToken).get("/api/users/me");
      expect(me.json().id).toBe(user.id);
    });

    it("não revela se a conta existe", async () => {
      const response = await login({ email: `${unique()}@ninguem.com`, password: PASSWORD });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe("INVALID_CREDENTIALS");
    });

    it("access token expira e o refresh token renova a sessão com rotação", async () => {
      const user = await registerUser(ctx.app);
      ctx.clock.advanceMinutes(16);
      expect((await user.api.get("/api/users/me")).statusCode).toBe(401);

      const refreshed = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/refresh",
        payload: { refreshToken: user.refreshToken },
      });
      expect(refreshed.statusCode).toBe(200);
      const tokens = refreshed.json();
      expect(tokens.refreshToken).not.toBe(user.refreshToken);
      expect((await apiClient(ctx.app, tokens.accessToken).get("/api/users/me")).statusCode).toBe(200);
    });

    it("reuso de refresh token já trocado revoga a sessão inteira", async () => {
      const user = await registerUser(ctx.app);
      const first = await ctx.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: user.refreshToken } });
      const rotated = first.json();

      const reuse = await ctx.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: user.refreshToken } });
      expect(reuse.statusCode).toBe(401);
      // A sessão comprometida cai: nem o token novo nem o access token valem mais.
      const afterReuse = await ctx.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken: rotated.refreshToken } });
      expect(afterReuse.statusCode).toBe(401);
      expect((await apiClient(ctx.app, rotated.accessToken).get("/api/users/me")).statusCode).toBe(401);
    });

    it("logout invalida a sessão imediatamente", async () => {
      const user = await registerUser(ctx.app);
      const response = await ctx.app.inject({ method: "POST", url: "/api/auth/logout", payload: { refreshToken: user.refreshToken } });
      expect(response.statusCode).toBe(204);
      expect((await user.api.get("/api/users/me")).statusCode).toBe(401);
    });

    it("logout-all encerra todas as sessões do usuário", async () => {
      const user = await registerUser(ctx.app);
      const other = (await login({ email: user.email, password: PASSWORD })).json().tokens;
      expect((await user.api.post("/api/auth/logout-all")).statusCode).toBe(204);
      expect((await apiClient(ctx.app, other.accessToken).get("/api/users/me")).statusCode).toBe(401);
    });
  });

  describe("bloqueio após tentativas sem sucesso (R87)", () => {
    it("bloqueia depois do limite, mesmo com a senha certa, e libera após o prazo", async () => {
      const user = await registerUser(ctx.app);
      const first = await login({ email: user.email, password: "Errada@123" });
      expect(first.statusCode).toBe(401);
      expect(first.json().details).toEqual({ remainingAttempts: 2 });
      await login({ email: user.email, password: "Errada@123" });
      const locking = await login({ email: user.email, password: "Errada@123" });
      expect(locking.statusCode).toBe(423);
      expect(locking.json().code).toBe("ACCOUNT_LOCKED");
      expect(Number(locking.headers["retry-after"])).toBe(900);

      const correctWhileLocked = await login({ email: user.email, password: PASSWORD });
      expect(correctWhileLocked.statusCode).toBe(423);

      ctx.clock.advanceMinutes(16);
      expect((await login({ email: user.email, password: PASSWORD })).statusCode).toBe(200);
    });

    it("login bem-sucedido zera o contador de falhas", async () => {
      const user = await registerUser(ctx.app);
      await login({ email: user.email, password: "Errada@123" });
      await login({ email: user.email, password: "Errada@123" });
      expect((await login({ email: user.email, password: PASSWORD })).statusCode).toBe(200);
      const again = await login({ email: user.email, password: "Errada@123" });
      expect(again.json().details).toEqual({ remainingAttempts: 2 });
    });
  });

  describe("recuperação de senha (R04)", () => {
    const tokenFrom = (text: string) => new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

    it("envia link por e-mail, redefine a senha e encerra as sessões", async () => {
      const user = await registerUser(ctx.app);
      const request = await ctx.app.inject({ method: "POST", url: "/api/auth/password/forgot", payload: { email: user.email } });
      expect(request.statusCode).toBe(202);
      await new Promise((resolve) => setImmediate(resolve));
      const mail = ctx.mailer.lastTo(user.email);
      expect(mail?.subject).toContain("recuperação de senha");
      expect(mail?.text).toContain("http://localhost:3000/reset-password?token=");
      const token = tokenFrom(mail!.text);

      const reset = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: { token, password: "NovaSenha#2026" },
      });
      expect(reset.statusCode).toBe(204);
      expect((await user.api.get("/api/users/me")).statusCode).toBe(401);
      expect((await login({ email: user.email, password: PASSWORD })).statusCode).toBe(401);
      expect((await login({ email: user.email, password: "NovaSenha#2026" })).statusCode).toBe(200);

      const reuse = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: { token, password: "OutraSenha#2026" },
      });
      expect(reuse.statusCode).toBe(401);
    });

    it("responde igual para e-mail não cadastrado e não envia nada", async () => {
      const before = ctx.mailer.outbox.length;
      const response = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password/forgot",
        payload: { email: `${unique()}@ninguem.com` },
      });
      expect(response.statusCode).toBe(202);
      expect(ctx.mailer.outbox.length).toBe(before);
    });

    it("novo pedido invalida o link anterior; link expira", async () => {
      const user = await registerUser(ctx.app);
      await ctx.app.inject({ method: "POST", url: "/api/auth/password/forgot", payload: { email: user.email } });
      await new Promise((resolve) => setImmediate(resolve));
      const firstToken = tokenFrom(ctx.mailer.lastTo(user.email)!.text);
      await ctx.app.inject({ method: "POST", url: "/api/auth/password/forgot", payload: { email: user.email } });
      await new Promise((resolve) => setImmediate(resolve));
      const secondToken = tokenFrom(ctx.mailer.lastTo(user.email)!.text);

      const old = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: { token: firstToken, password: "NovaSenha#2026" },
      });
      expect(old.statusCode).toBe(401);

      ctx.clock.advanceMinutes(61);
      const expired = await ctx.app.inject({
        method: "POST",
        url: "/api/auth/password/reset",
        payload: { token: secondToken, password: "NovaSenha#2026" },
      });
      expect(expired.statusCode).toBe(401);
    });

    it("página web do link funciona sem o aplicativo", async () => {
      const user = await registerUser(ctx.app);
      await ctx.app.inject({ method: "POST", url: "/api/auth/password/forgot", payload: { email: user.email } });
      await new Promise((resolve) => setImmediate(resolve));
      const token = tokenFrom(ctx.mailer.lastTo(user.email)!.text);

      const page = await ctx.app.inject({ method: "GET", url: `/reset-password?token=${token}` });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toContain("text/html");
      expect(page.body).toContain("Redefinir senha");

      const mismatch = await ctx.app.inject({
        method: "POST",
        url: "/reset-password",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({ token, password: "NovaSenha#2026", confirm: "Diferente#2026" }).toString(),
      });
      expect(mismatch.statusCode).toBe(400);

      const done = await ctx.app.inject({
        method: "POST",
        url: "/reset-password",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: new URLSearchParams({ token, password: "NovaSenha#2026", confirm: "NovaSenha#2026" }).toString(),
      });
      expect(done.statusCode).toBe(200);
      expect(done.body).toContain("Senha redefinida");
    });
  });

  it("troca de senha autenticada exige a senha atual", async () => {
    const user = await registerUser(ctx.app);
    const wrong = await user.api.post("/api/auth/password/change", { currentPassword: "Errada@123", newPassword: "NovaSenha#2026" });
    expect(wrong.statusCode).toBe(409);
    const ok = await user.api.post("/api/auth/password/change", { currentPassword: PASSWORD, newPassword: "NovaSenha#2026" });
    expect(ok.statusCode).toBe(204);
    expect((await user.api.get("/api/users/me")).statusCode).toBe(200);
    expect((await login({ email: user.email, password: "NovaSenha#2026" })).statusCode).toBe(200);
  });

  it("perfil: moeda principal (R28) e fuso horário", async () => {
    const user = await registerUser(ctx.app);
    const updated = await user.api.patch("/api/users/me", { primaryCurrency: "USD", timezone: "Europe/Lisbon" });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ primaryCurrency: "USD", timezone: "Europe/Lisbon" });
    expect((await user.api.patch("/api/users/me", { primaryCurrency: "XYZ" })).statusCode).toBe(422);
    expect((await user.api.patch("/api/users/me", { timezone: "Lugar/Nenhum" })).statusCode).toBe(400);
  });
});
