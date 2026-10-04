import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  idParams,
  requiredText,
  responseId,
  responseTimestamp,
  secured,
  uuid,
} from "../../../infrastructure/http/common-schemas.js";
import { authResultResponseSchema } from "./auth.schema.js";

const TAGS = ["Biometria"];

// ---------- Request DTOs ----------

export const enrollBiometricRequestSchema = z.strictObject({
  publicKey: z
    .string()
    .trim()
    .min(1, "Informe a chave pública do aparelho.")
    .max(4096, "Chave pública muito longa.")
    .meta({
      description:
        "Chave pública gerada pelo react-native-biometrics (createKeys): SubjectPublicKeyInfo em base64 (RSA 2048+ ou EC P-256)",
    }),
  deviceName: requiredText(80).meta({ example: "Galaxy A54 da Maria" }),
});
export type EnrollBiometricRequestDto = z.infer<typeof enrollBiometricRequestSchema>;

export const biometricChallengeRequestSchema = z.strictObject({ credentialId: uuid() });
export type BiometricChallengeRequestDto = z.infer<typeof biometricChallengeRequestSchema>;

export const biometricLoginRequestSchema = z.strictObject({
  credentialId: uuid(),
  challenge: z.string().trim().min(1, "Informe o desafio recebido.").max(200, "Desafio inválido."),
  signature: z
    .string()
    .trim()
    .min(1, "Informe a assinatura.")
    .max(4096, "Assinatura inválida.")
    .meta({ description: "Assinatura do desafio feita pelo aparelho (createSignature), em base64" }),
});
export type BiometricLoginRequestDto = z.infer<typeof biometricLoginRequestSchema>;

// ---------- Response DTOs ----------

export const biometricCredentialResponseSchema = z
  .object({
    id: responseId,
    deviceName: z.string(),
    keyType: z.enum(["rsa", "ec"]),
    createdAt: responseTimestamp,
    lastUsedAt: responseTimestamp.nullable(),
  })
  .meta({ id: "BiometricCredential" });
export type BiometricCredentialResponseDto = z.infer<typeof biometricCredentialResponseSchema>;

export const biometricCredentialListResponseSchema = z.object({ data: z.array(biometricCredentialResponseSchema) });
export type BiometricCredentialListResponseDto = z.infer<typeof biometricCredentialListResponseSchema>;

export const biometricChallengeResponseSchema = z.object({
  credentialId: responseId,
  challenge: z.string().meta({ description: "Texto a ser assinado pelo aparelho (payload do createSignature)" }),
  expiresAt: responseTimestamp,
});
export type BiometricChallengeResponseDto = z.infer<typeof biometricChallengeResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const biometricRouteSchemas = {
  enroll: {
    tags: TAGS,
    summary: "Habilitar login por biometria neste aparelho (R40)",
    description:
      "Depois do login com senha, o app gera as chaves (react-native-biometrics `createKeys`) e envia a chave pública. Guarde o `id` devolvido: ele identifica o aparelho no login por biometria.",
    security: secured,
    body: enrollBiometricRequestSchema,
    response: { 201: biometricCredentialResponseSchema },
  },
  list: {
    tags: TAGS,
    summary: "Aparelhos com login por biometria",
    security: secured,
    response: { 200: biometricCredentialListResponseSchema },
  },
  revoke: {
    tags: TAGS,
    summary: "Desabilitar a biometria de um aparelho",
    security: secured,
    params: idParams,
  },
  challenge: {
    tags: TAGS,
    summary: "Obter desafio para entrar com biometria (R40)",
    description:
      "Desafio de uso único, válido por poucos minutos. Credencial desabilitada: 401 BIOMETRIC_CREDENTIAL_INVALID (o app deve voltar ao login com senha).",
    body: biometricChallengeRequestSchema,
    response: { 200: biometricChallengeResponseSchema },
  },
  login: {
    tags: TAGS,
    summary: "Entrar com biometria (R40, R87)",
    description:
      "O app pede a digital (`createSignature` com o desafio como payload) e envia a assinatura. Devolve a mesma sessão do login com senha. Assinatura inválida conta como tentativa sem sucesso (bloqueio do R87).",
    body: biometricLoginRequestSchema,
    response: { 200: authResultResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
