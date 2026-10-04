import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { aad, FieldCipher } from "../../src/infrastructure/crypto/field-cipher.js";

const keyV1 = randomBytes(32);
const keyV2 = randomBytes(32);

describe("FieldCipher — criptografia de campo AES-256-GCM (R81)", () => {
  const cipher = new FieldCipher(new Map([[1, keyV1]]), 1);

  it("cifra e decifra valores em centavos, inclusive negativos", () => {
    for (const cents of [0, 1, 3590, -125_000, 99_999_999_999_999]) {
      const envelope = cipher.encryptAmount(cents, aad.transactionAmount("t1"));
      expect(cipher.decryptAmount(envelope, aad.transactionAmount("t1"))).toBe(cents);
    }
  });

  it("não deixa o valor em claro no envelope e usa IV aleatório", () => {
    const a = cipher.encryptAmount(3590, aad.transactionAmount("t1"));
    const b = cipher.encryptAmount(3590, aad.transactionAmount("t1"));
    expect(a.equals(b)).toBe(false);
    expect(a.includes(Buffer.from("3590"))).toBe(false);
    expect(a[0]).toBe(1);
    expect(a.length).toBe(1 + 12 + 8 + 16);
  });

  it("falha ao decifrar com AAD de outra linha (ciphertext copiado)", () => {
    const envelope = cipher.encryptAmount(100, aad.transactionAmount("linha-a"));
    expect(() => cipher.decryptAmount(envelope, aad.transactionAmount("linha-b"))).toThrow();
  });

  it("detecta adulteração do conteúdo", () => {
    const envelope = cipher.encryptAmount(100, aad.walletBalance("w1"));
    envelope[15] = envelope[15]! ^ 0xff;
    expect(() => cipher.decryptAmount(envelope, aad.walletBalance("w1"))).toThrow();
  });

  it("decifra dados de chaves antigas após rotação e cifra com a chave ativa", () => {
    const old = new FieldCipher(new Map([[1, keyV1]]), 1).encryptJson({ a: 1 }, "x");
    const rotated = new FieldCipher(
      new Map([
        [1, keyV1],
        [2, keyV2],
      ]),
      2,
    );
    expect(rotated.decryptJson(old, "x")).toEqual({ a: 1 });
    expect(rotated.needsRotation(old)).toBe(true);
    const fresh = rotated.encryptJson({ a: 2 }, "x");
    expect(fresh[0]).toBe(2);
    expect(rotated.needsRotation(fresh)).toBe(false);
  });

  it("rejeita configuração sem a chave ativa ou com chave de tamanho errado", () => {
    expect(() => new FieldCipher(new Map([[1, keyV1]]), 2)).toThrow();
    expect(() => new FieldCipher(new Map([[1, randomBytes(16)]]), 1)).toThrow();
  });
});
