import type { biometricCredentials } from "../../../infrastructure/database/schema.js";

/** Credencial biométrica gravada: chave pública do aparelho e desafio pendente (só o hash). */
export type BiometricCredentialRecord = typeof biometricCredentials.$inferSelect;

export interface NewBiometricCredential {
  userId: string;
  deviceName: string;
  publicKey: string;
  keyType: "rsa" | "ec";
  keyFingerprint: string;
  createdAt: Date;
}

/** Aparelhos com biometria por usuário — limite para conter cadastros esquecidos. */
export const MAX_BIOMETRIC_CREDENTIALS = 5;
