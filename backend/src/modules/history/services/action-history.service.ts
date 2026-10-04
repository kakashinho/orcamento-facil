import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import type { ActionHistoryRepository } from "../repositories/action-history.repository.js";
import type { HistoryListResponseDto } from "../schemas/history.schema.js";
import { type ClaimedEntry, HISTORY_LABELS, type HistoryAction, type HistoryEntityType } from "../types/history.types.js";

const DAY_MS = 86_400_000;

/**
 * Contrato público do módulo history: os outros módulos registram aqui suas ações
 * desfazíveis (R49), sempre dentro da mesma transação de banco da ação.
 */
export class ActionHistoryService {
  constructor(
    private readonly entries: ActionHistoryRepository,
    private readonly clock: Clock,
    private readonly undoWindowHours: number,
    private readonly retentionDays: number,
  ) {}

  private windowStart(): Date {
    return new Date(this.clock.now().getTime() - this.undoWindowHours * 3_600_000);
  }

  async record(
    tx: DbTransaction,
    userId: string,
    action: HistoryAction,
    entityType: HistoryEntityType,
    entityId: string | null,
    payload: unknown,
  ): Promise<void> {
    await this.entries.insert(
      { id: randomUUID(), userId, action, entityType, entityId, payload, createdAt: this.clock.now() },
      tx,
    );
  }

  async list(userId: string, limit: number): Promise<HistoryListResponseDto> {
    const since = this.windowStart();
    const rows = await this.entries.listRecent(userId, limit);
    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        label: HISTORY_LABELS[row.action],
        entityType: row.entityType,
        entityId: row.entityId,
        createdAt: row.createdAt.toISOString(),
        undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
        undoable: row.undoneAt === null && row.createdAt >= since,
      })),
    };
  }

  claimLatest(tx: DbTransaction, userId: string): Promise<ClaimedEntry | null> {
    return this.entries.claimLatest(userId, this.windowStart(), tx);
  }

  markUndone(tx: DbTransaction, entryId: string): Promise<void> {
    return this.entries.markUndone(entryId, this.clock.now(), tx);
  }

  /** Remove o histórico de registros apagados definitivamente (ex.: exclusão de carteira). */
  purgeEntities(tx: DbTransaction, userId: string, entityIds: string[]): Promise<void> {
    return this.entries.deleteByEntityIds(userId, entityIds, tx);
  }

  /** Limpeza periódica: entradas mais antigas que a retenção (sempre além da janela do desfazer). */
  purgeExpired(now: Date): Promise<number> {
    return this.entries.deleteOlderThan(new Date(now.getTime() - this.retentionDays * DAY_MS));
  }
}
