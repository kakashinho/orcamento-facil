import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { actionHistory } from "../../../infrastructure/database/schema.js";
import type {
  ClaimedEntry,
  HistoryAction,
  HistoryEntityType,
  HistoryEntryRecord,
  NewHistoryEntry,
} from "../types/history.types.js";

/** O snapshot pode conter valores financeiros: é gravado cifrado (R81) e decifrado na leitura. */
export class ActionHistoryRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  async insert(entry: NewHistoryEntry, tx: DbTransaction): Promise<void> {
    await tx.insert(actionHistory).values({
      id: entry.id,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      snapshot: this.cipher.encryptJson(entry.payload, aad.historySnapshot(entry.id)),
      createdAt: entry.createdAt,
    });
  }

  async listRecent(userId: string, limit: number): Promise<HistoryEntryRecord[]> {
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
      ...row,
      action: row.action as HistoryAction,
      entityType: row.entityType as HistoryEntityType,
    }));
  }

  /** Última ação não desfeita desde `since`, bloqueada para esta transação. */
  async claimLatest(userId: string, since: Date, tx: DbTransaction): Promise<ClaimedEntry | null> {
    const [row] = await tx
      .select()
      .from(actionHistory)
      .where(and(eq(actionHistory.userId, userId), isNull(actionHistory.undoneAt), gte(actionHistory.createdAt, since)))
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
      payload: this.cipher.decryptJson<Record<string, unknown>>(row.snapshot, aad.historySnapshot(row.id)),
    };
  }

  async markUndone(entryId: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(actionHistory).set({ undoneAt: now }).where(eq(actionHistory.id, entryId));
  }

  async deleteByEntityIds(userId: string, entityIds: string[], tx: DbTransaction): Promise<void> {
    if (entityIds.length === 0) return;
    await tx
      .delete(actionHistory)
      .where(and(eq(actionHistory.userId, userId), inArray(actionHistory.entityId, entityIds)));
  }
}
