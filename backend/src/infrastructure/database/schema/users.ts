import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  char,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// Usuário (R02, R28, R42), sessões com refresh token rotativo (R03, R87), tokens de
// recuperação de senha (R04) e credenciais biométricas do aparelho (R40).

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    username: varchar("username", { length: 30 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull().default("user"),
    primaryCurrency: char("primary_currency", { length: 3 }).notNull().default("BRL"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Sao_Paulo"),
    // Preferência de tema do app (R42), guardada no servidor para valer em qualquer aparelho.
    theme: varchar("theme", { length: 10 }).notNull().default("system"),
    failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_lower_uq").on(sql`lower(${t.username})`),
    check("users_role_check", sql`${t.role} in ('user', 'admin')`),
    check("users_theme_check", sql`${t.theme} in ('system', 'light', 'dark')`),
    check("users_failed_login_attempts_check", sql`${t.failedLoginAttempts} >= 0`),
  ],
);

/**
 * Cada linha é um refresh token. Todos os tokens emitidos a partir do mesmo login
 * compartilham `family_id`; o access token carrega esse id, o que permite revogar
 * a sessão inteira (logout, reset de senha, detecção de reuso).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id").references((): AnyPgColumn => sessions.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uq").on(t.tokenHash),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_family_id_idx").on(t.familyId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_token_hash_uq").on(t.tokenHash),
    index("password_reset_tokens_user_id_idx").on(t.userId),
  ],
);

/**
 * Login por biometria (R40): chave pública gerada no Android Keystore do aparelho. O desafio
 * pendente (uso único, curta duração) fica na própria credencial — só o hash é guardado.
 */
export const biometricCredentials = pgTable(
  "biometric_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceName: varchar("device_name", { length: 80 }).notNull(),
    publicKey: text("public_key").notNull(),
    keyType: varchar("key_type", { length: 10 }).notNull(),
    keyFingerprint: char("key_fingerprint", { length: 64 }).notNull(),
    challengeHash: char("challenge_hash", { length: 64 }),
    challengeExpiresAt: timestamp("challenge_expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("biometric_credentials_user_id_idx").on(t.userId),
    uniqueIndex("biometric_credentials_user_key_uq")
      .on(t.userId, t.keyFingerprint)
      .where(sql`${t.revokedAt} is null`),
    check("biometric_credentials_key_type_check", sql`${t.keyType} in ('rsa', 'ec')`),
  ],
);
