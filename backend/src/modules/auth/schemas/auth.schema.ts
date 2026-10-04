import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, secured } from "../../../infrastructure/http/common-schemas.js";
import { userResponseSchema, usernameField } from "./user.schema.js";

const TAGS = ["Autenticação"];

const email = z.email("Informe um e-mail válido").max(320).meta({ example: "maria@exemplo.com" });
const password = z.string().min(1).max(128).meta({ example: "Senha@Forte123" });

// ---------- Request DTOs ----------

export const registerRequestSchema = z.object({
  email,
  username: usernameField,
  password,
  primaryCurrency: currencyCode.optional(),
});
export type RegisterRequestDto = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z
  .object({ email: email.optional(), username: z.string().min(1).max(30).optional(), password })
  .refine((body) => body.email !== undefined || body.username !== undefined, {
    message: "Informe o e-mail ou o nome de usuário",
  });
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

export const refreshTokenRequestSchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshTokenRequestDto = z.infer<typeof refreshTokenRequestSchema>;

export const forgotPasswordRequestSchema = z.object({ email });
export type ForgotPasswordRequestDto = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.object({ token: z.string().min(1), password });
export type ResetPasswordRequestDto = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.object({ currentPassword: password, newPassword: password });
export type ChangePasswordRequestDto = z.infer<typeof changePasswordRequestSchema>;

// ---------- Response DTOs ----------

export const authTokensResponseSchema = z
  .object({
    tokenType: z.literal("Bearer"),
    accessToken: z.string(),
    expiresIn: z.number().meta({ description: "Validade do access token, em segundos" }),
    refreshToken: z.string(),
    refreshTokenExpiresAt: z.string(),
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
      "Troca o refresh token por um novo par de tokens (rotação). Reutilizar um refresh token já usado encerra a sessão.",
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
    description: "Consome o link (uso único), troca a senha e encerra todas as sessões.",
    body: resetPasswordRequestSchema,
  },
  changePassword: {
    tags: TAGS,
    summary: "Trocar a senha (usuário autenticado)",
    security: secured,
    body: changePasswordRequestSchema,
  },
} satisfies Record<string, FastifySchema>;
