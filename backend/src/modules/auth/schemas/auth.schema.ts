import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, email, responseTimestamp, secured } from "../../../infrastructure/http/common-schemas.js";
import { userResponseSchema, usernameField } from "./user.schema.js";

const TAGS = ["Autenticação"];

/** Senha informada para entrar (sem regra de força: só precisa conferir). */
const password = z.string().min(1, "Informe a senha.").max(128, "Use no máximo 128 caracteres.").meta({ example: "Senha@Forte123" });

/** Senha nova: a política completa (R02) é conferida no service, que conhece o e-mail e o usuário. */
const newPassword = z
  .string()
  .min(1, "Informe a nova senha.")
  .max(128, "Use no máximo 128 caracteres.")
  .meta({
    description:
      "8 a 128 caracteres, com letra maiúscula, minúscula, número e caractere especial; não pode conter o nome de usuário nem o e-mail",
    example: "Senha@Forte123",
  });

const opaqueToken = z.string().trim().min(1, "Campo obrigatório.").max(512, "Token inválido.");

// ---------- Request DTOs ----------

export const registerRequestSchema = z.strictObject({
  email,
  username: usernameField,
  password: newPassword,
  primaryCurrency: currencyCode.optional().meta({ description: "Moeda principal (R28). Padrão: BRL" }),
});
export type RegisterRequestDto = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .strictObject({
    email: email.optional(),
    username: z.string().trim().min(1, "Informe o nome de usuário.").max(30, "Use no máximo 30 caracteres.").optional(),
    password,
  })
  .refine((body) => body.email !== undefined || body.username !== undefined, {
    message: "Informe o e-mail ou o nome de usuário.",
    path: ["email"],
  });
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export const refreshTokenRequestSchema = z.strictObject({ refreshToken: opaqueToken });
export type RefreshTokenRequestDto = z.infer<typeof refreshTokenRequestSchema>;

export const forgotPasswordRequestSchema = z.strictObject({ email });
export type ForgotPasswordRequestDto = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.strictObject({ token: opaqueToken, password: newPassword });
export type ResetPasswordRequestDto = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.strictObject({ currentPassword: password, newPassword });
export type ChangePasswordRequestDto = z.infer<typeof changePasswordRequestSchema>;

// ---------- Response DTOs ----------

export const authTokensResponseSchema = z
  .object({
    tokenType: z.literal("Bearer"),
    accessToken: z.string(),
    expiresIn: z.number().meta({ description: "Validade do access token, em segundos" }),
    refreshToken: z.string(),
    refreshTokenExpiresAt: responseTimestamp,
  })
  .meta({ id: "AuthTokens" });
export type AuthTokensResponseDto = z.infer<typeof authTokensResponseSchema>;

export const authResultResponseSchema = z
  .object({ user: userResponseSchema, tokens: authTokensResponseSchema })
  .meta({ id: "AuthResult" });
export type AuthResultResponseDto = z.infer<typeof authResultResponseSchema>;

export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponseDto = z.infer<typeof messageResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const authRouteSchemas = {
  register: {
    tags: TAGS,
    summary: "Criar conta (R02)",
    description:
      "Cadastro com e-mail, nome de usuário e senha forte (mín. 8 caracteres com maiúscula, minúscula, número e símbolo). Cria uma carteira padrão e já devolve a sessão.",
    body: registerRequestSchema,
    response: { 201: authResultResponseSchema },
  },
  login: {
    tags: TAGS,
    summary: "Login (R03, R87)",
    description:
      "Autentica por e-mail ou nome de usuário. Após tentativas consecutivas sem sucesso, a conta é bloqueada temporariamente (HTTP 423).",
    body: loginRequestSchema,
    response: { 200: authResultResponseSchema },
  },
  refresh: {
    tags: TAGS,
    summary: "Renovar sessão",
    description:
      "Troca o refresh token por um novo par de tokens (rotação). Reutilizar um refresh token já usado encerra a sessão. Falha: 401 INVALID_REFRESH_TOKEN (fazer login de novo).",
    body: refreshTokenRequestSchema,
    response: { 200: authTokensResponseSchema },
  },
  logout: {
    tags: TAGS,
    summary: "Encerrar a sessão do refresh token informado",
    body: refreshTokenRequestSchema,
  },
  logoutAll: {
    tags: TAGS,
    summary: "Encerrar todas as sessões do usuário",
    security: secured,
  },
  forgotPassword: {
    tags: TAGS,
    summary: "Solicitar recuperação de senha (R04)",
    description: "Envia um link de redefinição para o e-mail cadastrado. A resposta é sempre a mesma, exista ou não a conta.",
    body: forgotPasswordRequestSchema,
    response: { 202: messageResponseSchema },
  },
  resetPassword: {
    tags: TAGS,
    summary: "Redefinir senha com o token recebido por e-mail (R04)",
    description:
      "Consome o link (uso único), troca a senha e encerra todas as sessões e biometrias. Link inválido ou vencido: 400 INVALID_RESET_TOKEN.",
    body: resetPasswordRequestSchema,
  },
  changePassword: {
    tags: TAGS,
    summary: "Trocar a senha (usuário autenticado)",
    description: "Mantém a sessão atual e encerra as demais. Senha atual errada: 422 INVALID_CURRENT_PASSWORD.",
    security: secured,
    body: changePasswordRequestSchema,
  },
} satisfies Record<string, FastifySchema>;
