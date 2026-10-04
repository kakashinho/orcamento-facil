import { z } from "zod";
import type { users } from "../../db/schema.js";

export type UserRow = typeof users.$inferSelect;

export const userResponse = z
  .object({
    id: z.uuid(),
    email: z.string(),
    username: z.string(),
    role: z.enum(["user", "admin"]),
    primaryCurrency: z.string(),
    timezone: z.string(),
    createdAt: z.string(),
  })
  .meta({ id: "User" });

export type UserDto = z.infer<typeof userResponse>;

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role === "admin" ? "admin" : "user",
    primaryCurrency: row.primaryCurrency,
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
  };
}
