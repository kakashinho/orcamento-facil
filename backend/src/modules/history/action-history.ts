import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { Database, DbTransaction } from "../../db/client.js";
import { actionHistory } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";

export const HISTORY_ACTIONS = [
  "transaction.create",
  "transaction.update",
  "transaction.delete",
  "transaction.archive",
  "transaction.unarchive",
  "transaction.bulk_archive",
  "transfer.create",
  "transfer.delete",
] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
export type HistoryEntityType = "transaction" | "transfer";

export interface HistoryEntryDto {
  id: string;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  createdAt: string;
  undoneAt: string | null;
  undoable: boolean;
}

export interface ClaimedEntry {
  id: string;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  createdAt: Date;
  payload: unknown;
}

/** Registro das ações desfazíveis (R49), com snapshot cifrado (R81). */
export class ActionHistory {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
    private readonly clock: Clock,
    private readonly undoWindowHours: number,
  ) {}

  private cutoff(): Date {
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
    const id = randomUUID();
    await tx.insert(actionHistory).values({
      id,
      userId,
      action,
      entityType,
      entityId,
      snapshot: this.cipher.encryptJson(payload, aad.historySnapshot(id)),
      createdAt: this.clock.now(),
    });
  }

  async list(userId: string, limit: number): Promise<HistoryEntryDto[]> {
    const cutoff = this.cutoff();
    const rows = await this.db
      .select({
        id: actionHistory.id,
        action: actionHistory.action,
        entityType: actionHistory.entityType,
        entityId: actionHistory.entityId,
        createdAt: actionHistory.createdAt,
        undoneAt: actionHistory.undoneAt,
      })
      .from(actionHistory)
      .where(eq(actionHistory.userId, userId))
      .orderBy(desc(actionHistory.seq))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      action: row.action as HistoryAction,
      entityType: row.entityType as HistoryEntityType,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
      undoneAt: row.undoneAt ? row.undoneAt.toISOString() : null,
      undoable: row.undoneAt === null && row.createdAt >= cutoff,
    }));
  }

  /** Última ação ainda não desfeita dentro da janela, bloqueada para esta transação. */
  async claimLatest(tx: DbTransaction, userId: string): Promise<ClaimedEntry | null> {
    const [row] = await tx
      .select()
      .from(actionHistory)
      .where(
        and(
          eq(actionHistory.userId, userId),
          isNull(actionHistory.undoneAt),
          gte(actionHistory.createdAt, this.cutoff()),
        ),
      )
      .orderBy(desc(actionHistory.seq))
      .limit(1)
      .for("update");
    if (!row) return null;
    return {
      id: row.id,
      action: row.action as HistoryAction,
      entityType: row.entityType as HistoryEntityType,
      entityId: row.entityId,
      createdAt: row.createdAt,
      payload: this.cipher.decryptJson(row.snapshot, aad.historySnapshot(row.id)),
    };
  }

  async markUndone(tx: DbTransaction, entryId: string): Promise<void> {
    await tx.update(actionHistory).set({ undoneAt: this.clock.now() }).where(eq(actionHistory.id, entryId));
  }
}
