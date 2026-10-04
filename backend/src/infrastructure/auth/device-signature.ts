import { createHash, createPublicKey, type KeyObject, verify } from "node:crypto";

/**
 * Login por biometria (R40) com chave do dispositivo, no modelo do react-native-biometrics:
 * o app gera um par de chaves no Android Keystore protegido pela digital (`createKeys`) e envia
 * só a chave pública; no login, assina um desafio com a chave privada (`createSignature`) e o
 * servidor confere a assinatura. A chave privada nunca sai do aparelho.
 */

export type DeviceKeyType = "rsa" | "ec";

export interface DevicePublicKey {
  /** Base64 sem quebras de linha (o Android pode inserir `\n` a cada 76 caracteres). */
  normalized: string;
  keyType: DeviceKeyType;
  /** SHA-256 da chave (hex): identifica a mesma chave cadastrada duas vezes. */
  fingerprint: string;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function loadKey(base64: string): KeyObject {
  return createPublicKey({ key: Buffer.from(base64, "base64"), format: "der", type: "spki" });
}

/**
 * Lê a chave pública enviada pelo app: SubjectPublicKeyInfo (DER) em base64. Aceita RSA de pelo
 * menos 2048 bits (padrão do react-native-biometrics) ou EC P-256. Devolve `null` se inválida.
 */
export function parseDevicePublicKey(input: string): DevicePublicKey | null {
  const normalized = input.replace(/\s+/g, "");
  if (!BASE64.test(normalized)) return null;
  try {
    const key = loadKey(normalized);
    const details = key.asymmetricKeyDetails;
    if (key.asymmetricKeyType === "rsa" && (details?.modulusLength ?? 0) >= 2048) {
      return { normalized, keyType: "rsa", fingerprint: fingerprintOf(normalized) };
    }
    if (key.asymmetricKeyType === "ec" && details?.namedCurve === "prime256v1") {
      return { normalized, keyType: "ec", fingerprint: fingerprintOf(normalized) };
    }
    return null;
  } catch {
    return null;
  }
}

function fingerprintOf(normalizedBase64: string): string {
  return createHash("sha256").update(Buffer.from(normalizedBase64, "base64")).digest("hex");
}

/**
 * Confere a assinatura SHA-256 do dispositivo sobre o desafio: RSA PKCS#1 v1.5 ("SHA256withRSA")
 * ou ECDSA em DER ("SHA256withECDSA"), em base64.
 */
export function verifyDeviceSignature(publicKeyBase64: string, payload: string, signatureBase64: string): boolean {
  const signature = signatureBase64.replace(/\s+/g, "");
  if (!BASE64.test(signature)) return false;
  try {
    return verify("sha256", Buffer.from(payload, "utf8"), loadKey(publicKeyBase64), Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
