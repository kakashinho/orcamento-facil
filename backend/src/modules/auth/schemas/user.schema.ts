import type { FastifySchema } from "fastify";
import { z } from "zod";
import { currencyCode, secured } from "../../../infrastructure/http/common-schemas.js";

const TAGS = ["Usuário"];

const username = z
  .string()
  .min(3, "O nome de usuário deve ter pelo menos 3 caracteres")
  .max(30)
  .regex(/^[A-Za-z0-9_.]+$/, "Use apenas letras, números, ponto e sublinhado")
  .meta({ example: "maria.silva" });

// ---------- Request DTOs ----------

export const updateProfileRequestSchema = z.object({
  username: username.optional(),
  primaryCurrency: currencyCode.optional(),
  timezone: z.string().min(1).max(64).meta({ example: "America/Sao_Paulo" }).optional(),
});
export type UpdateProfileRequestDto = z.infer<typeof updateProfileRequestSchema>;

// ---------- Response DTOs ----------

export const userResponseSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    username: z.string(),
    role: z.enum(["user", "admin"]),
    primaryCurrency: z.string(),
    timezone: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "User" });
export type UserResponseDto = z.infer<typeof userResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const userRouteSchemas = {
  getMe: {
    tags: TAGS,
    summary: "Dados do usuário autenticado",
    security: secured,
    response: { 200: userResponseSchema },
  },
  updateMe: {
    tags: TAGS,
    summary: "Atualizar perfil — nome de usuário, moeda principal (R28) e fuso horário",
    security: secured,
    body: updateProfileRequestSchema,
    response: { 200: userResponseSchema },
  },
} satisfies Record<string, FastifySchema>;

export { username as usernameField };
