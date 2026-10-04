import type { TransactionRunner } from "../../../infrastructure/database/client.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import type { UndoResponseDto } from "../schemas/history.schema.js";
import { type HistoryAction, UNDO_NOT_POSSIBLE, type UndoHandlers } from "../types/history.types.js";
import type { ActionHistoryService } from "./action-history.service.js";

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
    private readonly runner: TransactionRunner,
    private readonly history: ActionHistoryService,
    private readonly handlers: UndoHandlers,
    private readonly eventLog: EventLogger,
  ) {}

  async undoLast(userId: string, requestId?: string): Promise<UndoResponseDto> {
    const outcome = await this.runner.run(async (tx) => {
      const entry = await this.history.claimLatest(tx, userId);
      if (!entry) return { kind: "empty" as const };
      try {
        // Savepoint: se a reversão for impossível, descarta só ela e encerra a entrada,
        // para que o usuário possa continuar desfazendo as anteriores.
        await this.runner.savepoint(tx, (savepoint) => this.handlers[entry.action](savepoint, userId, entry.payload));
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
}
