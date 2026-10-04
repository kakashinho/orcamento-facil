import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiClient, createTestApp, registerUser, type TestContext, type TestUser } from "./support/test-app.js";

/** Par de chaves como o react-native-biometrics gera no Android Keystore (createKeys). */
function deviceKeys(type: "rsa" | "ec" = "rsa", modulusLength = 2048) {
  const { publicKey, privateKey } =
    type === "rsa"
      ? generateKeyPairSync("rsa", { modulusLength })
      : generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const base64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  // Base64.DEFAULT do Android quebra a linha a cada 76 caracteres.
  return { publicKey: base64.replace(/(.{76})/g, "$1\n"), privateKey };
}

/** createSignature: assina o desafio com a chave privada (SHA256withRSA / SHA256withECDSA). */
const signChallenge = (privateKey: KeyObject, challenge: string) =>
  sign("sha256", Buffer.from(challenge, "utf8"), privateKey).toString("base64");

describe("login por biometria (R40, R87)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp({ MAX_FAILED_LOGIN_ATTEMPTS: "3" });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const post = (url: string, payload: unknown) => ctx.app.inject({ method: "POST", url, payload: payload as object });

  async function enroll(user: TestUser, keys = deviceKeys(), deviceName = "Galaxy A54") {
    const response = await user.api.post("/api/auth/biometric/credentials", { publicKey: keys.publicKey, deviceName });
    return { response, keys, credentialId: response.json().id as string };
  }

  async function biometricLogin(credentialId: string, privateKey: KeyObject) {
    const { challenge } = (await post("/api/auth/biometric/challenge", { credentialId })).json();
    return { challenge, response: await post("/api/auth/biometric/login", { credentialId, challenge, signature: signChallenge(privateKey, challenge) }) };
  }

  it("habilita o aparelho e entra com a digital, sem senha", async () => {
    const user = await registerUser(ctx.app);
    const { response, keys, credentialId } = await enroll(user);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ deviceName: "Galaxy A54", keyType: "rsa", lastUsedAt: null });

    const challenge = await post("/api/auth/biometric/challenge", { credentialId });
    expect(challenge.statusCode).toBe(200);
    expect(challenge.json()).toMatchObject({ credentialId, challenge: expect.any(String), expiresAt: expect.any(String) });

    const login = await post("/api/auth/biometric/login", {
      credentialId,
      challenge: challenge.json().challenge,
      signature: signChallenge(keys.privateKey, challenge.json().challenge),
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.id).toBe(user.id);
    const session = apiClient(ctx.app, login.json().tokens.accessToken);
    expect((await session.get("/api/users/me")).statusCode).toBe(200);

    const devices = (await user.api.get("/api/auth/biometric/credentials")).json().data;
    expect(devices).toHaveLength(1);
    expect(devices[0].lastUsedAt).not.toBeNull();
  });

  it("aceita chave EC P-256", async () => {
    const user = await registerUser(ctx.app);
    const { response, keys, credentialId } = await enroll(user, deviceKeys("ec"));
    expect(response.json().keyType).toBe("ec");
    expect((await biometricLogin(credentialId, keys.privateKey)).response.statusCode).toBe(200);
  });

  it("o desafio é de uso único e expira", async () => {
    const user = await registerUser(ctx.app);
    const { keys, credentialId } = await enroll(user);
    const { challenge } = await biometricLogin(credentialId, keys.privateKey);
    const replay = await post("/api/auth/biometric/login", {
      credentialId,
      challenge,
      signature: signChallenge(keys.privateKey, challenge),
    });
    expect(replay.statusCode).toBe(401);
    expect(replay.json().code).toBe("BIOMETRIC_CHALLENGE_INVALID");

    const fresh = (await post("/api/auth/biometric/challenge", { credentialId })).json().challenge;
    ctx.clock.advance(121_000);
    const late = await post("/api/auth/biometric/login", { credentialId, challenge: fresh, signature: signChallenge(keys.privateKey, fresh) });
    expect(late.json().code).toBe("BIOMETRIC_CHALLENGE_INVALID");
  });

  it("assinatura de outra chave falha e conta para o bloqueio (R87)", async () => {
    const user = await registerUser(ctx.app);
    const { keys, credentialId } = await enroll(user);
    const intruder = deviceKeys();
    const first = await biometricLogin(credentialId, intruder.privateKey);
    expect(first.response.statusCode).toBe(401);
    expect(first.response.json().code).toBe("BIOMETRIC_SIGNATURE_INVALID");
    await biometricLogin(credentialId, intruder.privateKey);
    const locking = await biometricLogin(credentialId, intruder.privateKey);
    expect(locking.response.statusCode).toBe(423);
    // Bloqueada, nem a digital certa nem a senha entram até o prazo acabar.
    expect((await biometricLogin(credentialId, keys.privateKey)).response.statusCode).toBe(423);
    const password = await post("/api/auth/login", { email: user.email, password: user.password });
    expect(password.statusCode).toBe(423);
  });

  it("valida a chave pública e recusa duplicidade", async () => {
    const user = await registerUser(ctx.app);
    const invalid = await user.api.post("/api/auth/biometric/credentials", { publicKey: "nao-e-chave", deviceName: "X" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().details[0]).toMatchObject({ location: "body", path: "publicKey" });
    const weak = await enroll(user, deviceKeys("rsa", 1024));
    expect(weak.response.statusCode).toBe(400);

    const keys = deviceKeys();
    expect((await enroll(user, keys)).response.statusCode).toBe(201);
    const again = await enroll(user, keys);
    expect(again.response.statusCode).toBe(409);
    expect(again.response.json().code).toBe("BIOMETRIC_KEY_ALREADY_REGISTERED");
  });

  it("limita a 5 aparelhos por conta", async () => {
    const user = await registerUser(ctx.app);
    for (let index = 0; index < 5; index += 1) {
      expect((await enroll(user, deviceKeys("ec"), `Aparelho ${index}`)).response.statusCode).toBe(201);
    }
    const sixth = await enroll(user, deviceKeys("ec"));
    expect(sixth.response.statusCode).toBe(409);
    expect(sixth.response.json().code).toBe("BIOMETRIC_LIMIT_REACHED");
  });

  it("desabilitar o aparelho corta o login por biometria", async () => {
    const user = await registerUser(ctx.app);
    const { credentialId } = await enroll(user);
    expect((await user.api.delete(`/api/auth/biometric/credentials/${credentialId}`)).statusCode).toBe(204);
    const challenge = await post("/api/auth/biometric/challenge", { credentialId });
    expect(challenge.statusCode).toBe(401);
    expect(challenge.json().code).toBe("BIOMETRIC_CREDENTIAL_INVALID");
    expect((await user.api.delete(`/api/auth/biometric/credentials/${credentialId}`)).statusCode).toBe(404);
  });

  it("recuperar a senha desabilita as biometrias (aparelho perdido)", async () => {
    const user = await registerUser(ctx.app);
    const { credentialId } = await enroll(user);
    await post("/api/auth/password/forgot", { email: user.email });
    await new Promise((resolve) => setImmediate(resolve));
    const token = new URL(ctx.mailer.lastTo(user.email)!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token");
    expect((await post("/api/auth/password/reset", { token, password: "NovaSenha#2026" })).statusCode).toBe(204);
    expect((await post("/api/auth/biometric/challenge", { credentialId })).json().code).toBe("BIOMETRIC_CREDENTIAL_INVALID");
  });

  it("cadastrar e listar aparelhos exige login; o de outra conta não aparece", async () => {
    const owner = await registerUser(ctx.app);
    const { credentialId } = await enroll(owner);
    expect((await ctx.app.inject({ method: "GET", url: "/api/auth/biometric/credentials" })).statusCode).toBe(401);
    const other = await registerUser(ctx.app);
    expect((await other.api.get("/api/auth/biometric/credentials")).json().data).toEqual([]);
    expect((await other.api.delete(`/api/auth/biometric/credentials/${credentialId}`)).statusCode).toBe(404);
  });
});
