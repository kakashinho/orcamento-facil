import { describe, expect, it } from "vitest";
import { AccessTokenService, generateOpaqueToken, hashOpaqueToken } from "../../src/infrastructure/auth/access-token.js";
import { hashPassword, verifyPassword } from "../../src/infrastructure/auth/password-hasher.js";
import { passwordPolicyViolations } from "../../src/modules/auth/services/password-policy.js";
import { MutableClock, TEST_JWT_SECRET } from "../helpers/test-config.js";

const fastHashing = { costLog2: 10, parallelization: 1 };

describe("senhas (R02)", () => {
  it("gera hash scrypt com sal aleatório e verifica corretamente", async () => {
    const hash = await hashPassword("Senha@Forte1", fastHashing);
    expect(hash.startsWith("scrypt$10$8$1$")).toBe(true);
    expect(hash).not.toContain("Senha@Forte1");
    expect(await verifyPassword("Senha@Forte1", hash)).toBe(true);
    expect(await verifyPassword("senha@forte1", hash)).toBe(false);
    expect(await hashPassword("Senha@Forte1", fastHashing)).not.toBe(hash);
  });

  it("rejeita hash malformado sem lançar erro", async () => {
    expect(await verifyPassword("x", "texto-qualquer")).toBe(false);
    expect(await verifyPassword("x", "scrypt$99$8$1$aaa$bbb")).toBe(false);
  });

  it("aplica a política de senha forte", () => {
    expect(passwordPolicyViolations("Senha@Forte1")).toEqual([]);
    expect(passwordPolicyViolations("curta")).toEqual(
      expect.arrayContaining([
        "A senha deve ter pelo menos 8 caracteres.",
        "A senha deve conter pelo menos uma letra maiúscula.",
        "A senha deve conter pelo menos um número.",
        "A senha deve conter pelo menos um caractere especial.",
      ]),
    );
    expect(passwordPolicyViolations("Maria.silva@2026", { username: "maria.silva" })).toContain(
      "A senha não pode conter o nome de usuário.",
    );
    expect(passwordPolicyViolations("Joaozinho#99", { email: "joaozinho@x.com" })).toContain(
      "A senha não pode conter o e-mail.",
    );
  });
});

describe("tokens (R03, R87)", () => {
  it("emite e valida access token; expira conforme o relógio", () => {
    const clock = new MutableClock(new Date("2026-10-03T12:00:00Z"));
    const service = new AccessTokenService(TEST_JWT_SECRET, 900, clock);
    const { token, expiresIn } = service.issue({ userId: "u1", sessionId: "s1", role: "user" });
    expect(expiresIn).toBe(900);
    expect(service.verify(token)).toMatchObject({ sub: "u1", sid: "s1", role: "user", typ: "access" });
    clock.advance(901_000);
    // Vencido ≠ inválido: o app renova a sessão em TOKEN_EXPIRED e volta ao login em INVALID_TOKEN.
    expect(() => service.verify(token)).toThrow(expect.objectContaining({ code: "TOKEN_EXPIRED", statusCode: 401 }));
    expect(() => service.verify("nao.e.jwt")).toThrow(expect.objectContaining({ code: "INVALID_TOKEN" }));
  });

  it("rejeita token assinado com outro segredo ou adulterado", () => {
    const clock = new MutableClock();
    const service = new AccessTokenService(TEST_JWT_SECRET, 900, clock);
    const other = new AccessTokenService("outro-segredo-com-mais-de-32-caracteres!!", 900, clock);
    const { token } = other.issue({ userId: "u1", sessionId: "s1", role: "admin" });
    expect(() => service.verify(token)).toThrow();
    const genuine = service.issue({ userId: "u1", sessionId: "s1", role: "user" }).token;
    const [header, , signature] = genuine.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "u1", sid: "s1", role: "admin", typ: "access", exp: 9e9 })).toString("base64url");
    expect(() => service.verify(`${header}.${forgedPayload}.${signature}`)).toThrow();
  });

  it("tokens opacos têm alta entropia e só o hash é persistível", () => {
    const token = generateOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(generateOpaqueToken()).not.toBe(token);
    expect(hashOpaqueToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token));
  });
});
