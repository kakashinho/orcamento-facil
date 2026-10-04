import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  currencyCode,
  responseId,
  responseTimestamp,
  secured,
  timeZone,
} from "../../../infrastructure/http/common-schemas.js";
import { THEMES } from "../types/user.types.js";

const TAGS = ["Usuário"];

export const usernameField = z
  .string()
  .trim()
  .min(3, "Use pelo menos 3 caracteres.")
  .max(30, "Use no máximo 30 caracteres.")
  .regex(/^[A-Za-z0-9_.]+$/, "Use apenas letras sem acento, números, ponto e sublinhado.")
  .meta({ example: "maria.silva" });

const theme = z
  .enum(THEMES)
  .meta({ description: "Tema do app (R42): system segue o aparelho; light = claro; dark = escuro" });

// ---------- Request DTOs ----------

export const updateProfileRequestSchema = z.strictObject({
  username: usernameField.optional(),
  primaryCurrency: currencyCode.optional(),
  timezone: timeZone.optional(),
  theme: theme.optional(),
});
export type UpdateProfileRequestDto = z.infer<typeof updateProfileRequestSchema>;

// ---------- Response DTOs ----------

export const userResponseSchema = z
  .object({
    id: responseId,
    email: z.string(),
    username: z.string(),
    role: z.enum(["user", "admin"]),
    primaryCurrency: z.string(),
    timezone: z.string(),
    theme,
    createdAt: responseTimestamp,
  })
  .meta({ id: "User" });
export type UserResponseDto = z.infer<typeof userResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const userRouteSchemas = {
  getMe: {
    tags: TAGS,
    summary: "Dados e preferências do usuário autenticado",
    security: secured,
    response: { 200: userResponseSchema },
  },
  updateMe: {
    tags: TAGS,
    summary: "Atualizar perfil — nome de usuário, moeda principal (R28), fuso horário e tema (R42)",
    description: "Envie apenas os campos alterados.",
    security: secured,
    body: updateProfileRequestSchema,
    response: { 200: userResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
