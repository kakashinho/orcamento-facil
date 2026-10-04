import { randomUUID } from "node:crypto";
import type { AppConfig } from "../../../config/env.js";
import {
  type AccessTokenClaims,
  type AccessTokenService,
  generateOpaqueToken,
  hashOpaqueToken,
} from "../../../infrastructure/auth/access-token.js";
import type { PasswordHasher } from "../../../infrastructure/auth/password-hasher.js";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction, TransactionRunner } from "../../../infrastructure/database/client.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import type { Mailer } from "../../../infrastructure/mail/mailer.js";
import { errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isSupportedCurrency } from "../../../shared/utils/money.js";
import type { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository.js";
import type { SessionRepository } from "../repositories/session.repository.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type {
  AuthResultResponseDto,
  AuthTokensResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
} from "../schemas/auth.schema.js";
import type { RequestMeta, UserRegisteredHook } from "../types/auth.types.js";
import type { UserRecord } from "../types/user.types.js";
import { passwordPolicyViolations } from "./password-policy.js";
import { passwordResetEmail } from "./password-reset-email.js";
import { toUserResponseDto } from "./user.service.js";

export interface AuthServiceDeps {
  config: AppConfig["auth"];
  users: UserRepository;
  sessions: SessionRepository;
  resetTokens: PasswordResetTokenRepository;
  runner: TransactionRunner;
  passwords: PasswordHasher;
  accessTokens: AccessTokenService;
  mailer: Mailer;
  eventLog: EventLogger;
  clock: Clock;
  onUserRegistered: UserRegisteredHook;
}

const DAY_MS = 86_400_000;
const INVALID_RESET_LINK = "Link de recuperação inválido ou expirado. Solicite um novo.";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Cadastro (R02), login com JWT (R03), bloqueio por tentativas (R87) e recuperação de senha (R04). */
export class AuthService {
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: AuthServiceDeps) {}

  /** Mesmo formato de `details` dos erros de schema: [{ location, path, message }]. */
  private assertPasswordPolicy(password: string, context: { email?: string; username?: string }, field = "password") {
    const violations = passwordPolicyViolations(password, context);
    if (violations.length > 0) {
      throw errors.validation(
        "A senha não atende à política de segurança.",
        violations.map((message) => ({ location: "body", path: field, message })),
      );
    }
  }

  async register(input: RegisterRequestDto, meta: RequestMeta): Promise<AuthResultResponseDto> {
    const { users, runner, passwords, config, clock, onUserRegistered, eventLog } = this.deps;
    const email = normalizeEmail(input.email);
    const username = input.username.trim();
    this.assertPasswordPolicy(input.password, { email, username });
    const primaryCurrency = input.primaryCurrency ?? "BRL";
    if (!isSupportedCurrency(primaryCurrency)) {
      throw errors.unprocessable("UNSUPPORTED_CURRENCY", `Moeda não suportada: ${primaryCurrency}.`);
    }

    const passwordHash = await passwords.hash(input.password);
    const now = clock.now();
    let user: UserRecord;
    try {
      user = await runner.run(async (tx) => {
        const created = await users.create(
          {
            email,
            username,
            passwordHash,
            role: config.adminEmails.has(email) ? "admin" : "user",
            primaryCurrency,
            createdAt: now,
            updatedAt: now,
          },
          tx,
        );
        await onUserRegistered(tx, created);
        return created;
      });
    } catch (error) {
      if (error instanceof DuplicateEntryError && error.field === "email") {
        throw errors.conflict("EMAIL_ALREADY_REGISTERED", "Este e-mail já está cadastrado.");
      }
      if (error instanceof DuplicateEntryError && error.field === "username") {
        throw errors.conflict("USERNAME_TAKEN", "Este nome de usuário já está em uso.");
      }
      throw error;
    }

    const { sessionRowId: _sessionRowId, ...tokens } = await this.startSession(user, meta);
    eventLog.record("auth.registered", { userId: user.id, requestId: meta.requestId ?? null });
    return { user: toUserResponseDto(user), tokens };
  }

  async login(input: LoginRequestDto, meta: RequestMeta): Promise<AuthResultResponseDto> {
    const { users, passwords, config, clock, eventLog } = this.deps;
    const now = clock.now();
    const user = input.email
      ? await users.findByEmail(normalizeEmail(input.email))
      : await users.findByUsername((input.username ?? "").trim());

    if (!user) {
      // Mesmo custo de uma verificação real: o tempo de resposta não revela se a conta existe.
      this.dummyHash ??= passwords.hash("timing-equalization-password");
      await passwords.verify(input.password, await this.dummyHash);
      eventLog.record("auth.login_failed", {
        level: "warn",
        requestId: meta.requestId ?? null,
        context: { reason: "unknown_account" },
      });
      throw errors.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      eventLog.record("auth.login_blocked", { level: "warn", userId: user.id, requestId: meta.requestId ?? null });
      throw errors.accountLocked(Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000));
    }

    if (!(await passwords.verify(input.password, user.passwordHash))) {
      const max = config.maxFailedLoginAttempts;
      const attempts = await users.incrementFailedLoginAttempts(user.id, now);
      if (attempts >= max) {
        const lockoutSeconds = config.lockoutMinutes * 60;
        await users.lock(user.id, new Date(now.getTime() + lockoutSeconds * 1000));
        eventLog.record("auth.account_locked", {
          level: "warn",
          userId: user.id,
          requestId: meta.requestId ?? null,
          context: { lockoutMinutes: config.lockoutMinutes },
        });
        throw errors.accountLocked(lockoutSeconds);
      }
      eventLog.record("auth.login_failed", {
        level: "warn",
        userId: user.id,
        requestId: meta.requestId ?? null,
        context: { reason: "wrong_password", attempts },
      });
      throw errors.invalidCredentials(max - attempts);
    }

    const promoteToAdmin = user.role !== "admin" && config.adminEmails.has(user.email);
    const current = (await users.recordSuccessfulLogin(user.id, now, promoteToAdmin)) ?? user;
    const { sessionRowId: _sessionRowId, ...tokens } = await this.startSession(current, meta);
    eventLog.record("auth.login_succeeded", { userId: user.id, requestId: meta.requestId ?? null });
    return { user: toUserResponseDto(current), tokens };
  }

  private async startSession(
    user: Pick<UserRecord, "id" | "role">,
    meta: RequestMeta,
    familyId?: string,
    tx?: DbTransaction,
  ): Promise<AuthTokensResponseDto & { sessionRowId: string }> {
    const { sessions, accessTokens, config, clock } = this.deps;
    const now = clock.now();
    const sessionRowId = randomUUID();
    const refreshToken = generateOpaqueToken();
    const expiresAt = new Date(now.getTime() + config.refreshTokenTtlDays * DAY_MS);
    const family = familyId ?? sessionRowId;

    await sessions.create(
      {
        id: sessionRowId,
        userId: user.id,
        familyId: family,
        tokenHash: hashOpaqueToken(refreshToken),
        userAgent: meta.userAgent ? meta.userAgent.slice(0, 255) : null,
        expiresAt,
        createdAt: now,
      },
      tx,
    );
    const access = accessTokens.issue({
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
  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensResponseDto> {
    const { sessions, users, runner, clock, eventLog } = this.deps;
    const now = clock.now();
    const outcome = await runner.run(async (tx) => {
      const session = await sessions.findByTokenHashForUpdate(hashOpaqueToken(refreshToken), tx);
      if (!session) return { kind: "invalid" as const };
      if (session.revokedAt) {
        await sessions.revokeFamily(session.familyId, now, tx);
        return { kind: "reused" as const, userId: session.userId, rotated: session.replacedById !== null };
      }
      if (session.expiresAt <= now) return { kind: "invalid" as const };
      const user = await users.findById(session.userId);
      if (!user) return { kind: "invalid" as const };

      const tokens = await this.startSession(
        user,
        { userAgent: meta.userAgent ?? session.userAgent ?? undefined },
        session.familyId,
        tx,
      );
      await sessions.markRotated(session.id, tokens.sessionRowId, now, tx);
      return { kind: "ok" as const, tokens };
    });

    if (outcome.kind === "ok") {
      const { sessionRowId: _sessionRowId, ...tokens } = outcome.tokens;
      return tokens;
    }
    if (outcome.kind === "reused" && outcome.rotated) {
      eventLog.record("auth.refresh_token_reuse", {
        level: "warn",
        userId: outcome.userId,
        requestId: meta.requestId ?? null,
        message: "Refresh token reutilizado; sessão revogada por segurança",
      });
    }
    throw errors.invalidToken("Sessão inválida ou expirada. Faça login novamente.");
  }

  async logout(refreshToken: string): Promise<void> {
    const session = await this.deps.sessions.findByTokenHash(hashOpaqueToken(refreshToken));
    if (session) await this.deps.sessions.revokeFamily(session.familyId, this.deps.clock.now());
  }

  async logoutAll(userId: string, exceptSessionId?: string): Promise<void> {
    await this.deps.sessions.revokeAllForUser(userId, this.deps.clock.now(), exceptSessionId);
  }

  /** Usado pelo hook de autenticação a cada requisição protegida. */
  verifyAccessToken(token: string): AccessTokenClaims {
    return this.deps.accessTokens.verify(token);
  }

  isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    return this.deps.sessions.hasActiveSession(sessionId, userId, this.deps.clock.now());
  }

  /** R04: a resposta é a mesma exista ou não a conta, para não revelar e-mails cadastrados. */
  async requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
    const { users, resetTokens, runner, mailer, config, clock, eventLog } = this.deps;
    const user = await users.findByEmail(normalizeEmail(rawEmail));
    if (!user) {
      eventLog.record("auth.password_reset_requested", {
        requestId: meta.requestId ?? null,
        context: { accountFound: false },
      });
      return;
    }

    const now = clock.now();
    const token = generateOpaqueToken();
    await runner.run(async (tx) => {
      // Uma nova solicitação invalida os links anteriores ainda ativos.
      await resetTokens.revokeActiveForUser(user.id, now, tx);
      await resetTokens.create(
        {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now.getTime() + config.passwordResetTtlMinutes * 60_000),
          createdAt: now,
        },
        tx,
      );
    });

    const link = new URL(config.passwordResetUrl);
    link.searchParams.set("token", token);
    const message = passwordResetEmail({ username: user.username, link: link.toString(), ttlMinutes: config.passwordResetTtlMinutes });
    // Não aguarda o envio: o tempo de resposta não deve revelar se a conta existe.
    void mailer.send({ to: user.email, ...message }).catch((error: unknown) => {
      eventLog.record("auth.password_reset_email_failed", {
        level: "error",
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
    eventLog.record("auth.password_reset_requested", {
      userId: user.id,
      requestId: meta.requestId ?? null,
      context: { accountFound: true },
    });
  }

  /** Conclui a recuperação: troca a senha, consome o link e encerra todas as sessões. */
  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const { users, resetTokens, sessions, runner, passwords, clock, eventLog } = this.deps;
    const now = clock.now();
    const record = await resetTokens.findByTokenHash(hashOpaqueToken(token));
    if (!record || record.usedAt || record.revokedAt || record.expiresAt <= now) {
      throw errors.invalidToken(INVALID_RESET_LINK);
    }
    const user = await users.findById(record.userId);
    if (!user) throw errors.invalidToken(INVALID_RESET_LINK);

    this.assertPasswordPolicy(newPassword, { email: user.email, username: user.username });
    const passwordHash = await passwords.hash(newPassword);

    await runner.run(async (tx) => {
      if (!(await resetTokens.consume(record.id, now, tx))) {
        throw errors.invalidToken(INVALID_RESET_LINK);
      }
      await users.updatePassword(user.id, passwordHash, now, tx);
      await sessions.revokeAllForUser(user.id, now, undefined, tx);
      await resetTokens.revokeActiveForUser(user.id, now, tx);
    });
    eventLog.record("auth.password_reset_completed", { userId: user.id, requestId: meta.requestId ?? null });
  }

  /** Troca de senha autenticada; encerra as demais sessões e mantém a atual. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const { users, passwords, clock, eventLog } = this.deps;
    const user = await users.findById(userId);
    if (!user) throw errors.notFound("Usuário");
    if (!(await passwords.verify(currentPassword, user.passwordHash))) {
      throw errors.conflict("INVALID_CURRENT_PASSWORD", "A senha atual está incorreta.");
    }
    this.assertPasswordPolicy(newPassword, { email: user.email, username: user.username }, "newPassword");
    await users.updatePassword(userId, await passwords.hash(newPassword), clock.now());
    await this.logoutAll(userId, currentSessionId);
    eventLog.record("auth.password_changed", { userId, requestId: meta.requestId ?? null });
  }
}
