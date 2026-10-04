import type { Database, DbTransaction } from "../../db/client.js";
import type { EventLogger } from "../../infra/event-log.js";
import { AppError, errors } from "../../shared/errors.js";
import type { TransactionService } from "../transactions/transaction.service.js";
import type { TransferService } from "../transfers/transfer.service.js";
import type { ActionHistory, ClaimedEntry, HistoryAction, HistoryEntityType } from "./action-history.js";
import { UNDO_NOT_POSSIBLE } from "./undo-errors.js";

export interface UndoResult {
  undone: {
    id: string;
    action: HistoryAction;
    entityType: HistoryEntityType;
    entityId: string | null;
    createdAt: string;
  };
  message: string;
}

const MESSAGES: Record<HistoryAction, string> = {
  "transaction.create": "Criação da transação desfeita.",
  "transaction.update": "Edição da transação desfeita.",
  "transaction.delete": "Exclusão da transação desfeita: a transação foi restaurada.",
  "transaction.archive": "Arquivamento desfeito.",
  "transaction.unarchive": "Desarquivamento desfeito.",
  "transaction.bulk_archive": "Arquivamento em lote desfeito.",
  "transfer.create": "Transferência desfeita.",
  "transfer.delete": "Exclusão da transferência desfeita: a transferência foi restaurada.",
};

/**
 * Desfaz a última ação do usuário (R49). Chamadas sucessivas desfazem as ações anteriores,
 * em ordem inversa, dentro da janela configurada. Saldos são recompostos na mesma
 * transação de banco.
 */
export class UndoService {
  constructor(
    private readonly db: Database,
    private readonly history: ActionHistory,
    private readonly transactions: TransactionService,
    private readonly transfers: TransferService,
    private readonly eventLog: EventLogger,
  ) {}

  async undoLast(userId: string, requestId?: string): Promise<UndoResult> {
    const outcome = await this.db.transaction(async (tx) => {
      const entry = await this.history.claimLatest(tx, userId);
      if (!entry) return { kind: "empty" as const };
      try {
        // Savepoint: se a reversão for impossível, descarta só a reversão e marca a entrada
        // como encerrada, para que o usuário possa continuar desfazendo as anteriores.
        await tx.transaction(async (savepoint) => {
          await this.dispatch(savepoint, userId, entry);
        });
      } catch (error) {
        if (error instanceof AppError && error.code === UNDO_NOT_POSSIBLE) {
          await this.history.markUndone(tx, entry.id);
          return { kind: "impossible" as const, entry, message: error.message };
        }
        throw error;
      }
      await this.history.markUndone(tx, entry.id);
      return { kind: "done" as const, entry };
    });

    if (outcome.kind === "empty") {
      throw new AppError(404, "NOTHING_TO_UNDO", "Não há ação recente para desfazer.");
    }
    if (outcome.kind === "impossible") {
      this.eventLog.record("history.undo_discarded", {
        level: "warn",
        userId,
        requestId: requestId ?? null,
        context: { action: outcome.entry.action },
      });
      throw errors.conflict(UNDO_NOT_POSSIBLE, outcome.message);
    }
    const { entry } = outcome;
    return {
      undone: {
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        createdAt: entry.createdAt.toISOString(),
      },
      message: MESSAGES[entry.action],
    };
  }

  private async dispatch(tx: DbTransaction, userId: string, entry: ClaimedEntry): Promise<void> {
    const payload = entry.payload as Record<string, unknown>;
    switch (entry.action) {
      case "transaction.create":
        return this.transactions.revertCreate(tx, userId, String(payload.transactionId));
      case "transaction.update":
        return this.transactions.revertUpdate(tx, userId, String(payload.transactionId), payload.before);
      case "transaction.delete":
        return this.transactions.revertDelete(tx, userId, String(payload.transactionId));
      case "transaction.archive":
        return this.transactions.revertArchive(tx, userId, [String(payload.transactionId)], false);
      case "transaction.unarchive":
        return this.transactions.revertArchive(tx, userId, [String(payload.transactionId)], true);
      case "transaction.bulk_archive":
        return this.transactions.revertArchive(tx, userId, (payload.transactionIds as string[]) ?? [], false);
      case "transfer.create":
        return this.transfers.revertCreate(tx, userId, String(payload.transferId));
      case "transfer.delete":
        return this.transfers.revertDelete(tx, userId, String(payload.transferId));
      default:
        throw errors.conflict(UNDO_NOT_POSSIBLE, "Ação não pode ser desfeita.");
    }
  }
}
