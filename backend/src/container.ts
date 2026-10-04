import type pg from "pg";
import type { AppConfig } from "./config/env.js";
import { createDatabase, type Database } from "./db/client.js";
import { type Clock, systemClock } from "./infra/clock.js";
import { EventLogger } from "./infra/event-log.js";
import { createLogger, type Logger } from "./infra/logger.js";
import { LogMailer, type Mailer, SmtpMailer } from "./infra/mailer.js";
import { AccessTokenService } from "./modules/auth/access-token.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { CategoryService } from "./modules/categories/category.service.js";
import { type ExchangeRateProvider, OpenExchangeRateApiProvider } from "./modules/exchange-rates/exchange-rate.provider.js";
import { ExchangeRateService } from "./modules/exchange-rates/exchange-rate.service.js";
import { ActionHistory } from "./modules/history/action-history.js";
import { UndoService } from "./modules/history/undo.service.js";
import { ReportService } from "./modules/reports/report.service.js";
import { MaintenanceService } from "./modules/system/maintenance.service.js";
import { TagService } from "./modules/tags/tag.service.js";
import { TransactionQueries } from "./modules/transactions/transaction.queries.js";
import { TransactionService } from "./modules/transactions/transaction.service.js";
import { TransferService } from "./modules/transfers/transfer.service.js";
import { UserService } from "./modules/users/user.service.js";
import { BalanceLedger } from "./modules/wallets/balance-ledger.js";
import { WalletService } from "./modules/wallets/wallet.service.js";
import { FieldCipher } from "./shared/crypto/field-cipher.js";

export interface ContainerOverrides {
  clock?: Clock;
  mailer?: Mailer;
  exchangeRateProvider?: ExchangeRateProvider;
  logger?: Logger;
}

export interface Container {
  config: AppConfig;
  logger: Logger;
  clock: Clock;
  db: Database;
  pool: pg.Pool;
  cipher: FieldCipher;
  mailer: Mailer;
  eventLog: EventLogger;
  exchangeRates: ExchangeRateService;
  accessTokens: AccessTokenService;
  auth: AuthService;
  users: UserService;
  wallets: WalletService;
  categories: CategoryService;
  tags: TagService;
  transactionQueries: TransactionQueries;
  transactions: TransactionService;
  transfers: TransferService;
  history: ActionHistory;
  undo: UndoService;
  reports: ReportService;
  maintenance: MaintenanceService;
  close(): Promise<void>;
}

/** Composição das dependências (injeção manual): cada serviço recebe só o que usa. */
export function createContainer(config: AppConfig, overrides: ContainerOverrides = {}): Container {
  const logger = overrides.logger ?? createLogger(config.logLevel);
  const clock = overrides.clock ?? systemClock;
  const { db, pool } = createDatabase(config.database.url, config.database.poolMax);
  const cipher = new FieldCipher(config.encryption.keys, config.encryption.activeKeyVersion);
  const eventLog = new EventLogger(db, logger);
  const mailer =
    overrides.mailer ??
    (config.mail.smtp ? new SmtpMailer(config.mail.smtp, config.mail.from) : new LogMailer(logger, config.env !== "production"));

  const exchangeRates = new ExchangeRateService(
    overrides.exchangeRateProvider ??
      new OpenExchangeRateApiProvider(config.exchangeRates.apiUrl, config.exchangeRates.timeoutMs),
    config.exchangeRates.cacheTtlMinutes,
    clock,
    eventLog,
  );
  const accessTokens = new AccessTokenService(config.auth.jwtSecret, config.auth.accessTokenTtlSeconds, clock);
  const ledger = new BalanceLedger(cipher, clock);
  const history = new ActionHistory(db, cipher, clock, config.undoWindowHours);
  const wallets = new WalletService(db, cipher, clock, exchangeRates);
  const categories = new CategoryService(db, clock);
  const tags = new TagService(db, clock);
  const auth = new AuthService(db, config, clock, mailer, eventLog, accessTokens, wallets, exchangeRates);
  const users = new UserService(db, clock, exchangeRates);
  const transactionQueries = new TransactionQueries(db, cipher);
  const transactions = new TransactionService(
    db,
    cipher,
    clock,
    ledger,
    history,
    wallets,
    categories,
    tags,
    transactionQueries,
  );
  const transfers = new TransferService(db, cipher, clock, ledger, history, wallets, exchangeRates);
  const undo = new UndoService(db, history, transactions, transfers, eventLog);
  const reports = new ReportService(db, cipher, clock, exchangeRates, transfers);
  const maintenance = new MaintenanceService(db, clock, eventLog, config.maintenanceForced);

  return {
    config,
    logger,
    clock,
    db,
    pool,
    cipher,
    mailer,
    eventLog,
    exchangeRates,
    accessTokens,
    auth,
    users,
    wallets,
    categories,
    tags,
    transactionQueries,
    transactions,
    transfers,
    history,
    undo,
    reports,
    maintenance,
    async close() {
      await eventLog.flush();
      await pool.end();
    },
  };
}
