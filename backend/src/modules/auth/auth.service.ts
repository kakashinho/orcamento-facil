import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { AppConfig } from "../../config/env.js";
import type { Database, Executor } from "../../db/client.js";
import { passwordResetTokens, sessions, users } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import type { EventLogger } from "../../infra/event-log.js";
import type { Mailer } from "../../infra/mailer.js";
import { errors } from "../../shared/errors.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";
import type { ExchangeRateService } from "../exchange-rates/exchange-rate.service.js";
import { toUserDto, type UserDto, type UserRow } from "../users/user.dto.js";
import type { WalletService } from "../wallets/wallet.service.js";
import { type AccessTokenService, generateOpaqueToken, hashOpaqueToken } from "./access-token.js";
import { passwordResetEmail } from "./password-reset-email.js";
import { hashPassword, passwordPolicyViolations, verifyPassword } from "./password.js";

export interface RequestMeta {
  requestId?: string;
  userAgent?: string | undefined;
}

export interface AuthTokens {
  tokenType: "Bearer";
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface AuthResult {
  user: UserDto;
  tokens: AuthTokens;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  primaryCurrency?: string | undefined;
}

export interface LoginInput {
  email?: string | undefined;
  username?: string | undefined;
  password: string;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const DAY_MS = 86_400_000;

export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly db: Database,
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly mailer: Mailer,
    private readonly eventLog: EventLogger,
    private readonly accessTokens: AccessTokenService,
    private readonly wallets: WalletService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  private get hashing() {
    return {
      costLog2: this.config.auth.scryptCostLog2,
      parallelization: this.config.auth.scryptParallelization,
    };
  }

  private assertPasswordPolicy(password: string, context: { email?: string; username?: string }) {
    const violations = passwordPolicyViolations(password, context);
    if (violations.length > 0) {
      throw errors.validation("A senha não atende à política de segurança.", { password: violations });
    }
  }

  /** R02: cadastro com e-mail, nome de usuário e senha forte. Já devolve a sessão autenticada. */
  async register(input: RegisterInput, meta: RequestMeta): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const username = input.username.trim();
    this.assertPasswordPolicy(input.password, { email, username });
    const primaryCurrency = input.primaryCurrency ?? "BRL";
    this.exchangeRates.assertCurrency(primaryCurrency);

    const passwordHash = await hashPassword(input.password, this.hashing);
    const role = this.config.auth.adminEmails.has(email) ? "admin" : "user";
    const now = this.clock.now();

    let user: UserRow;
    try {
      user = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({ email, username, passwordHash, role, primaryCurrency, createdAt: now, updatedAt: now })
          .returning();
        await this.wallets.createDefaultWallet(tx, created!.id, primaryCurrency);
        return created!;
      });
    } catch (error) {
      if (isUniqueViolation(error, "users_email_lower_uq")) {
        throw errors.conflict("EMAIL_ALREADY_REGISTERED", "Este e-mail já está cadastrado.");
      }
      if (isUniqueViolation(error, "users_username_lower_uq")) {
        throw errors.conflict("USERNAME_TAKEN", "Este nome de usuário já está em uso.");
      }
      throw error;
    }

    const tokens = await this.startSession(this.db, user, meta);
    this.eventLog.record("auth.registered", { userId: user.id, requestId: meta.requestId ?? null });
    return { user: toUserDto(user), tokens };
  }

  /** R03 + R87: login com bloqueio temporário após tentativas consecutivas sem sucesso. */
  async login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
    const now = this.clock.now();
    const identifier = input.email
      ? sql`lower(${users.email}) = ${normalizeEmail(input.email)}`
      : sql`lower(${users.username}) = ${(input.username ?? "").trim().toLowerCase()}`;
    const [user] = await this.db.select().from(users).where(identifier);

    if (!user) {
      // Mesmo custo de uma verificação real: não revela, pelo tempo de resposta, se a conta existe.
      this.dummyHash ??= hashPassword("timing-equalization-password", this.hashing);
      await verifyPassword(input.password, await this.dummyHash);
      this.eventLog.record("auth.login_failed", {
        level: "warn",
        requestId: meta.requestId ?? null,
        context: { reason: "unknown_account" },
      });
      throw errors.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
      this.eventLog.record("auth.login_blocked", {
        level: "warn",
        userId: user.id,
        requestId: meta.requestId ?? null,
      });
      throw errors.accountLocked(retryAfter);
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      const max = this.config.auth.maxFailedLoginAttempts;
      const [updated] = await this.db
        .update(users)
        .set({ failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`, updatedAt: now })
        .where(eq(users.id, user.id))
        .returning({ failedLoginAttempts: users.failedLoginAttempts });
      const attempts = updated?.failedLoginAttempts ?? max;
      if (attempts >= max) {
        const lockoutSeconds = this.config.auth.lockoutMinutes * 60;
        await this.db
          .update(users)
          .set({ lockedUntil: new Date(now.getTime() + lockoutSeconds * 1000), failedLoginAttempts: 0 })
          .where(eq(users.id, user.id));
        this.eventLog.record("auth.account_locked", {
          level: "warn",
          userId: user.id,
          requestId: meta.requestId ?? null,
          context: { lockoutMinutes: this.config.auth.lockoutMinutes },
        });
        throw errors.accountLocked(lockoutSeconds);
      }
      this.eventLog.record("auth.login_failed", {
        level: "warn",
        userId: user.id,
        requestId: meta.requestId ?? null,
        context: { reason: "wrong_password", attempts },
      });
      throw errors.invalidCredentials(max - attempts);
    }

    const promoteToAdmin = user.role !== "admin" && this.config.auth.adminEmails.has(user.email);
    const [current] = await this.db
      .update(users)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(promoteToAdmin ? { role: "admin" } : {}),
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .returning();

    const tokens = await this.startSession(this.db, current ?? user, meta);
    this.eventLog.record("auth.login_succeeded", { userId: user.id, requestId: meta.requestId ?? null });
    return { user: toUserDto(current ?? user), tokens };
  }

  private async startSession(
    executor: Executor,
    user: Pick<UserRow, "id" | "role">,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<AuthTokens & { sessionRowId: string }> {
    const now = this.clock.now();
    const sessionRowId = randomUUID();
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.config.auth.refreshTokenTtlDays * DAY_MS);
    const family = familyId ?? sessionRowId;

    await executor.insert(sessions).values({
      id: sessionRowId,
      userId: user.id,
      familyId: family,
      tokenHash: hashOpaqueToken(refreshToken),
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
      expiresAt,
      createdAt: now,
    });

    const access = this.accessTokens.issue({
      userId: user.id,
      sessionId: family,
      role: user.role === "admin" ? "admin" : "user",
    });
    return {
      tokenType: "Bearer",
      accessToken: access.token,
      expiresIn: access.expiresIn,
      refreshToken,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      sessionRowId,
    };
  }

  /**
   * Rotação do refresh token: cada uso emite um novo e invalida o anterior. Reapresentar
   * um token já usado indica roubo — a sessão inteira (família) é revogada.
   */
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokens> {
    const now = this.clock.now();
    const outcome = await this.db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, hashOpaqueToken(refreshToken)))
        .for("update");
      if (!session) return { kind: "invalid" as const };

      if (session.revokedAt) {
        await tx
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.familyId, session.familyId), isNull(sessions.revokedAt)));
        return { kind: "reused" as const, userId: session.userId, rotated: session.replacedById !== null };
      }
      if (session.expiresAt <= now) return { kind: "invalid" as const };

      const [user] = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, session.userId));
      if (!user) return { kind: "invalid" as const };

      const tokens = await this.startSession(tx, user, { userAgent: meta.userAgent ?? session.userAgent ?? undefined }, session.familyId);
      await tx
        .update(sessions)
        .set({ revokedAt: now, replacedById: tokens.sessionRowId })
        .where(eq(sessions.id, session.id));
      return { kind: "ok" as const, tokens };
    });

    if (outcome.kind === "ok") {
      const { sessionRowId: _ignored, ...tokens } = outcome.tokens;
      return tokens;
    }
    if (outcome.kind === "reused" && outcome.rotated) {
      this.eventLog.record("auth.refresh_token_reuse", {
        level: "warn",
        userId: outcome.userId,
        requestId: meta.requestId ?? null,
        message: "Refresh token reutilizado; sessão revogada por segurança",
      });
    }
    throw errors.invalidToken("Sessão inválida ou expirada. Faça login novamente.");
  }

  async logout(refreshToken: string): Promise<void> {
    const [session] = await this.db
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(eq(sessions.tokenHash, hashOpaqueToken(refreshToken)));
    if (!session) return;
    await this.revokeFamily(session.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: this.clock.now() })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  async logoutAll(userId: string, exceptFamilyId?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: this.clock.now() })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          exceptFamilyId ? ne(sessions.familyId, exceptFamilyId) : undefined,
        ),
      );
  }

  /** A sessão continua válida enquanto houver um refresh token ativo na família. */
  async isSessionActive(familyId: string, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.familyId, familyId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, this.clock.now()),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * R04: envia um link de recuperação. A resposta é sempre a mesma, exista ou não a conta,
   * para não permitir descobrir e-mails cadastrados.
   */
  async requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const [user] = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (!user) {
      this.eventLog.record("auth.password_reset_requested", {
        requestId: meta.requestId ?? null,
        context: { accountFound: false },
      });
      return;
    }

    const now = this.clock.now();
    const token = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.config.auth.passwordResetTtlMinutes * 60_000);
    await this.db.transaction(async (tx) => {
      // Uma nova solicitação invalida os links anteriores ainda ativos.
      await tx
        .update(passwordResetTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
      await tx.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: hashOpaqueToken(token),
        expiresAt,
        createdAt: now,
      });
    });

    const link = new URL(this.config.auth.passwordResetUrl);
    link.searchParams.set("token", token);
    const message = passwordResetEmail({
      username: user.username,
      link: link.toString(),
      ttlMinutes: this.config.auth.passwordResetTtlMinutes,
    });
    // Não aguarda o envio: o tempo de resposta não deve revelar se a conta existe.
    void this.mailer.send({ to: user.email, ...message }).catch((error: unknown) => {
      this.eventLog.record("auth.password_reset_email_failed", {
        level: "error",
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    this.eventLog.record("auth.password_reset_requested", {
      userId: user.id,
      requestId: meta.requestId ?? null,
      context: { accountFound: true },
    });
  }

  /** Conclui a recuperação: troca a senha, consome o link e encerra todas as sessões. */
  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const now = this.clock.now();
    const [record] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, hashOpaqueToken(token)));
    if (!record || record.usedAt || record.revokedAt || record.expiresAt <= now) {
      throw errors.invalidToken("Link de recuperação inválido ou expirado. Solicite um novo.");
    }
    const [user] = await this.db.select().from(users).where(eq(users.id, record.userId));
    if (!user) {
      throw errors.invalidToken("Link de recuperação inválido ou expirado. Solicite um novo.");
    }
    this.assertPasswordPolicy(newPassword, { email: user.email, username: user.username });
    const passwordHash = await hashPassword(newPassword, this.hashing);

    await this.db.transaction(async (tx) => {
      const consumed = await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.id, record.id),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        )
        .returning({ id: passwordResetTokens.id });
      if (consumed.length === 0) {
        throw errors.invalidToken("Link de recuperação inválido ou expirado. Solicite um novo.");
      }
      await tx
        .update(users)
        .set({ passwordHash, failedLoginAttempts: 0, lockedUntil: null, updatedAt: now })
        .where(eq(users.id, user.id));
      await tx
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      await tx
        .update(passwordResetTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
            isNull(passwordResetTokens.revokedAt),
          ),
        );
    });
    this.eventLog.record("auth.password_reset_completed", { userId: user.id, requestId: meta.requestId ?? null });
  }

  /** Troca de senha autenticada; encerra as demais sessões e mantém a atual. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw errors.notFound("Usuário");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw errors.conflict("INVALID_CURRENT_PASSWORD", "A senha atual está incorreta.");
    }
    this.assertPasswordPolicy(newPassword, { email: user.email, username: user.username });
    const passwordHash = await hashPassword(newPassword, this.hashing);
    await this.db.update(users).set({ passwordHash, updatedAt: this.clock.now() }).where(eq(users.id, userId));
    await this.logoutAll(userId, currentSessionId);
    this.eventLog.record("auth.password_changed", { userId, requestId: meta.requestId ?? null });
  }
}
