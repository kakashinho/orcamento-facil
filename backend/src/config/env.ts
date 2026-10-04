import { z } from "zod";

const booleanFromEnv = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((value) => value === "true" || value === "1" || value === "yes");

const listFromEnv = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const base64Key = z
  .string()
  .refine((value) => Buffer.from(value, "base64").length === 32, {
    message: "deve ser uma chave de 32 bytes codificada em base64",
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: booleanFromEnv.default(false),
  CORS_ORIGIN: z.string().default("*"),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  PASSWORD_RESET_URL: z.url().optional(),
  SCRYPT_COST_LOG2: z.coerce.number().int().min(10).max(20).default(15),
  SCRYPT_PARALLELIZATION: z.coerce.number().int().min(1).max(16).default(3),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  ADMIN_EMAILS: listFromEnv.default([]),

  DATA_ENCRYPTION_KEY: base64Key,
  DATA_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).max(255).default(1),
  // Chaves antigas, ainda necessárias para ler dados cifrados antes de uma rotação:
  // "1:<base64>,2:<base64>"
  DATA_ENCRYPTION_PREVIOUS_KEYS: z.string().default(""),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: booleanFromEnv.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("Orçamento Fácil <no-reply@orcamentofacil.app>"),

  EXCHANGE_RATE_API_URL: z.url().default("https://open.er-api.com/v6/latest"),
  EXCHANGE_RATE_CACHE_MINUTES: z.coerce.number().int().positive().default(360),
  EXCHANGE_RATE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  UNDO_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  MAINTENANCE_MODE: booleanFromEnv.default(false),
});

export interface AppConfig {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  logLevel: string;
  trustProxy: boolean;
  corsOrigins: string[] | "*";
  publicBaseUrl: string;
  database: { url: string; poolMax: number };
  auth: {
    jwtSecret: string;
    accessTokenTtlSeconds: number;
    refreshTokenTtlDays: number;
    maxFailedLoginAttempts: number;
    lockoutMinutes: number;
    passwordResetTtlMinutes: number;
    passwordResetUrl: string;
    scryptCostLog2: number;
    scryptParallelization: number;
    rateLimitMax: number;
    adminEmails: Set<string>;
  };
  encryption: { activeKeyVersion: number; keys: Map<number, Buffer> };
  mail: {
    from: string;
    smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string };
  };
  exchangeRates: { apiUrl: string; cacheTtlMinutes: number; timeoutMs: number };
  undoWindowHours: number;
  maintenanceForced: boolean;
}

function parsePreviousKeys(raw: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const entry of raw.split(",").map((item) => item.trim()).filter(Boolean)) {
    const separator = entry.indexOf(":");
    const version = Number(entry.slice(0, separator));
    const key = Buffer.from(entry.slice(separator + 1), "base64");
    if (separator <= 0 || !Number.isInteger(version) || version < 1 || version > 255 || key.length !== 32) {
      throw new Error(
        "DATA_ENCRYPTION_PREVIOUS_KEYS inválida: use o formato 'versão:chaveBase64' separado por vírgulas",
      );
    }
    keys.set(version, key);
  }
  return keys;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração inválida:\n${problems}`);
  }
  const env = parsed.data;

  const keys = parsePreviousKeys(env.DATA_ENCRYPTION_PREVIOUS_KEYS);
  keys.set(env.DATA_ENCRYPTION_KEY_VERSION, Buffer.from(env.DATA_ENCRYPTION_KEY, "base64"));

  const publicBaseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const corsList = env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);

  return {
    env: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    corsOrigins: corsList.includes("*") ? "*" : corsList,
    publicBaseUrl,
    database: { url: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX },
    auth: {
      jwtSecret: env.JWT_SECRET,
      accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_MINUTES * 60,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      maxFailedLoginAttempts: env.MAX_FAILED_LOGIN_ATTEMPTS,
      lockoutMinutes: env.LOGIN_LOCKOUT_MINUTES,
      passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      passwordResetUrl: env.PASSWORD_RESET_URL ?? `${publicBaseUrl}/reset-password`,
      scryptCostLog2: env.SCRYPT_COST_LOG2,
      scryptParallelization: env.SCRYPT_PARALLELIZATION,
      rateLimitMax: env.AUTH_RATE_LIMIT_MAX,
      adminEmails: new Set(env.ADMIN_EMAILS.map((email) => email.toLowerCase())),
    },
    encryption: { activeKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION, keys },
    mail: {
      from: env.MAIL_FROM,
      ...(env.SMTP_HOST
        ? {
            smtp: {
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              secure: env.SMTP_SECURE,
              ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
              ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
            },
          }
        : {}),
    },
    exchangeRates: {
      apiUrl: env.EXCHANGE_RATE_API_URL.replace(/\/+$/, ""),
      cacheTtlMinutes: env.EXCHANGE_RATE_CACHE_MINUTES,
      timeoutMs: env.EXCHANGE_RATE_TIMEOUT_MS,
    },
    undoWindowHours: env.UNDO_WINDOW_HOURS,
    maintenanceForced: env.MAINTENANCE_MODE,
  };
}
