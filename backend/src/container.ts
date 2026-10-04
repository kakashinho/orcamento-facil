import type pg from "pg";
import type { AppConfig } from "./config/env.js";
import { AccessTokenService } from "./infrastructure/auth/access-token.js";
import { PasswordHasher } from "./infrastructure/auth/password-hasher.js";
import { type Clock, systemClock } from "./infrastructure/clock.js";
import { FieldCipher } from "./infrastructure/crypto/field-cipher.js";
import { createDatabase, createTransactionRunner, type Database } from "./infrastructure/database/client.js";
import {
  type ExchangeRateProvider,
  OpenExchangeRateApiProvider,
} from "./infrastructure/exchange-rates/exchange-rate.provider.js";
import { createAuthenticate, requireAdminHook } from "./infrastructure/http/authenticate.js";
import type { HttpGuards } from "./infrastructure/http/types.js";
import { EventLogger } from "./infrastructure/logging/event-logger.js";
import { createLogger, type Logger } from "./infrastructure/logging/logger.js";
import { LogMailer, type Mailer, SmtpMailer } from "./infrastructure/mail/mailer.js";
import { AuthController } from "./modules/auth/controllers/auth.controller.js";
import { ResetPasswordController } from "./modules/auth/controllers/reset-password.controller.js";
import { UserController } from "./modules/auth/controllers/user.controller.js";
import { PasswordResetTokenRepository } from "./modules/auth/repositories/password-reset-token.repository.js";
import { SessionRepository } from "./modules/auth/repositories/session.repository.js";
import { UserRepository } from "./modules/auth/repositories/user.repository.js";
import { AuthService } from "./modules/auth/services/auth.service.js";
import { UserService } from "./modules/auth/services/user.service.js";
import { CategoryController } from "./modules/finance/controllers/category.controller.js";
import { ExchangeRateController } from "./modules/finance/controllers/exchange-rate.controller.js";
import { TagController } from "./modules/finance/controllers/tag.controller.js";
import { TransactionController } from "./modules/finance/controllers/transaction.controller.js";
import { TransferController } from "./modules/finance/controllers/transfer.controller.js";
import { WalletController } from "./modules/finance/controllers/wallet.controller.js";
import { CategoryRepository } from "./modules/finance/repositories/category.repository.js";
import { TagRepository } from "./modules/finance/repositories/tag.repository.js";
import { TransactionRepository } from "./modules/finance/repositories/transaction.repository.js";
import { TransferRepository } from "./modules/finance/repositories/transfer.repository.js";
import { WalletRepository } from "./modules/finance/repositories/wallet.repository.js";
import { CategoryService } from "./modules/finance/services/category.service.js";
import { ExchangeRateService } from "./modules/finance/services/exchange-rate.service.js";
import { TagService } from "./modules/finance/services/tag.service.js";
import { TransactionService } from "./modules/finance/services/transaction.service.js";
import { TransferService } from "./modules/finance/services/transfer.service.js";
import { WalletService } from "./modules/finance/services/wallet.service.js";
import { HistoryController } from "./modules/history/controllers/history.controller.js";
import { ActionHistoryRepository } from "./modules/history/repositories/action-history.repository.js";
import { ActionHistoryService } from "./modules/history/services/action-history.service.js";
import { UndoService } from "./modules/history/services/undo.service.js";
import type { UndoHandlers } from "./modules/history/types/history.types.js";
import { ReportController } from "./modules/reports/controllers/report.controller.js";
import { ReportService } from "./modules/reports/services/report.service.js";
import { AdminController } from "./modules/system/controllers/admin.controller.js";
import { SystemController } from "./modules/system/controllers/system.controller.js";
import { AppLogRepository } from "./modules/system/repositories/app-log.repository.js";
import { HealthRepository } from "./modules/system/repositories/health.repository.js";
import { SystemSettingsRepository } from "./modules/system/repositories/system-settings.repository.js";
import { AppLogService } from "./modules/system/services/app-log.service.js";
import { HealthService } from "./modules/system/services/health.service.js";
import { MaintenanceService } from "./modules/system/services/maintenance.service.js";

export interface ContainerOverrides {
  clock?: Clock;
  mailer?: Mailer;
  exchangeRateProvider?: ExchangeRateProvider;
  logger?: Logger;
}

export function createContainer(config: AppConfig, overrides: ContainerOverrides = {}) {
  const logger = overrides.logger ?? createLogger(config.logLevel);
  const clock = overrides.clock ?? systemClock;
  const { db, pool } = createDatabase(config.database.url, config.database.poolMax);
  const runner = createTransactionRunner(db);
  const cipher = new FieldCipher(config.encryption.keys, config.encryption.activeKeyVersion);

  // ---------- repositories: única camada que acessa o banco ----------
  const repositories = {
    users: new UserRepository(db),
    sessions: new SessionRepository(db),
    resetTokens: new PasswordResetTokenRepository(db),
    wallets: new WalletRepository(db, cipher),
    categories: new CategoryRepository(db),
    tags: new TagRepository(db),
    transactions: new TransactionRepository(db, cipher),
    transfers: new TransferRepository(db, cipher),
    history: new ActionHistoryRepository(db, cipher),
    systemSettings: new SystemSettingsRepository(db),
    appLogs: new AppLogRepository(db),
    health: new HealthRepository(db),
  };

  // ---------- infraestrutura ----------
  const eventLog = new EventLogger(repositories.appLogs, logger);
  const mailer =
    overrides.mailer ??
    (config.mail.smtp ? new SmtpMailer(config.mail.smtp, config.mail.from) : new LogMailer(logger, config.env !== "production"));
  const accessTokens = new AccessTokenService(config.auth.jwtSecret, config.auth.accessTokenTtlSeconds, clock);
  const passwords = new PasswordHasher({
    costLog2: config.auth.scryptCostLog2,
    parallelization: config.auth.scryptParallelization,
  });

  // ---------- services: regras de negócio ----------
  const exchangeRates = new ExchangeRateService(
    overrides.exchangeRateProvider ??
      new OpenExchangeRateApiProvider(config.exchangeRates.apiUrl, config.exchangeRates.timeoutMs),
    config.exchangeRates.cacheTtlMinutes,
    clock,
    eventLog,
  );
  const history = new ActionHistoryService(repositories.history, clock, config.undoWindowHours);
  const users = new UserService(repositories.users, clock);
  const wallets = new WalletService({
    wallets: repositories.wallets,
    transactions: repositories.transactions,
    transfers: repositories.transfers,
    history,
    users,
    exchangeRates,
    runner,
    clock,
  });
  const auth = new AuthService({
    config: config.auth,
    users: repositories.users,
    sessions: repositories.sessions,
    resetTokens: repositories.resetTokens,
    runner,
    passwords,
    accessTokens,
    mailer,
    eventLog,
    clock,
    // O cadastro cria a carteira padrão na mesma transação (o auth não conhece o finance).
    onUserRegistered: (tx, user) => wallets.createDefaultWallet(tx, user),
  });
  const categories = new CategoryService(repositories.categories, repositories.transactions, clock);
  const tags = new TagService(repositories.tags, clock);
  const transactions = new TransactionService({
    transactions: repositories.transactions,
    wallets,
    categories,
    tags,
    history,
    users,
    runner,
    clock,
  });
  const transfers = new TransferService({
    transfers: repositories.transfers,
    wallets,
    history,
    exchangeRates,
    users,
    runner,
    clock,
  });
  // Cada ação desfazível é revertida pelo service dono do dado (R49).
  const undoHandlers: UndoHandlers = {
    "transaction.create": (tx, userId, p) => transactions.revertCreate(tx, userId, String(p.transactionId)),
    "transaction.update": (tx, userId, p) => transactions.revertUpdate(tx, userId, String(p.transactionId), p.before),
    "transaction.delete": (tx, userId, p) => transactions.revertDelete(tx, userId, String(p.transactionId)),
    "transaction.archive": (tx, userId, p) => transactions.revertArchive(tx, userId, [String(p.transactionId)], false),
    "transaction.unarchive": (tx, userId, p) => transactions.revertArchive(tx, userId, [String(p.transactionId)], true),
    "transaction.bulk_archive": (tx, userId, p) =>
      transactions.revertArchive(tx, userId, (p.transactionIds as string[] | undefined) ?? [], false),
    "transfer.create": (tx, userId, p) => transfers.revertCreate(tx, userId, String(p.transferId)),
    "transfer.delete": (tx, userId, p) => transfers.revertDelete(tx, userId, String(p.transferId)),
  };
  const undo = new UndoService(runner, history, undoHandlers, eventLog);
  const reports = new ReportService({ wallets, transactions, transfers, users, exchangeRates, clock });
  const maintenance = new MaintenanceService(repositories.systemSettings, clock, eventLog, config.maintenanceForced);
  const appLogs = new AppLogService(repositories.appLogs, eventLog);
  const health = new HealthService(repositories.health, logger);

  // ---------- HTTP: guards e controllers ----------
  const guards: HttpGuards = {
    authenticate: createAuthenticate(
      (token) => auth.verifyAccessToken(token),
      (sessionId, userId) => auth.isSessionActive(sessionId, userId),
    ),
    requireAdmin: requireAdminHook,
    authRateLimit: { rateLimit: { max: config.auth.rateLimitMax, timeWindow: "1 minute" } },
  };
  const controllers = {
    auth: new AuthController(auth),
    user: new UserController(users),
    resetPassword: new ResetPasswordController(auth),
    wallet: new WalletController(wallets),
    category: new CategoryController(categories),
    tag: new TagController(tags),
    transaction: new TransactionController(transactions),
    transfer: new TransferController(transfers),
    exchangeRate: new ExchangeRateController(exchangeRates),
    history: new HistoryController(history, undo),
    report: new ReportController(reports),
    system: new SystemController(health, maintenance, clock),
    admin: new AdminController(maintenance, appLogs),
  };

  return {
    config,
    logger,
    clock,
    db: db as Database,
    pool: pool as pg.Pool,
    cipher,
    mailer,
    eventLog,
    services: { auth, users, wallets, categories, tags, transactions, transfers, exchangeRates, history, undo, reports, maintenance },
    controllers,
    guards,
    async close() {
      await eventLog.flush();
      await pool.end();
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
