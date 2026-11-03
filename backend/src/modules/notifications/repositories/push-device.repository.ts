import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { Repository } from "../../../infrastructure/database/repository.js";
import { pushDevices } from "../../../infrastructure/database/schema.js";

export interface PushDeviceRecord {
  id: string;
  userId: string;
  token: string;
  deviceName: string | null;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

/** Aparelhos que recebem push (R18). O token do FCM é único: outro login no aparelho o transfere. */
export class PushDeviceRepository extends Repository {
  /** Registra (ou reativa e transfere) o aparelho; devolve o id. */
  async upsert(userId: string, token: string, deviceName: string | null, now: Date): Promise<string> {
    const [row] = await this.db
      .insert(pushDevices)
      .values({ userId, token, deviceName, lastSeenAt: now, createdAt: now })
      .onConflictDoUpdate({
        target: pushDevices.token,
        set: { userId, deviceName, lastSeenAt: now, revokedAt: null },
      })
      .returning({ id: pushDevices.id });
    return row!.id;
  }

  /** Revoga um aparelho do usuário; devolve se havia algo a revogar. */
  async revoke(userId: string, deviceId: string, now: Date): Promise<boolean> {
    const result = await this.db
      .update(pushDevices)
      .set({ revokedAt: now })
      .where(and(eq(pushDevices.id, deviceId), eq(pushDevices.userId, userId), isNull(pushDevices.revokedAt)));
    return (result.rowCount ?? 0) > 0;
  }

  /** Token recusado pelo FCM (aparelho desinstalou o app): deixa de receber. */
  async revokeToken(token: string, now: Date): Promise<void> {
    await this.db.update(pushDevices).set({ revokedAt: now }).where(and(eq(pushDevices.token, token), isNull(pushDevices.revokedAt)));
  }

  async listActive(userId: string): Promise<PushDeviceRecord[]> {
    return this.db
      .select({
        id: pushDevices.id,
        userId: pushDevices.userId,
        token: pushDevices.token,
        deviceName: pushDevices.deviceName,
        lastSeenAt: pushDevices.lastSeenAt,
        revokedAt: pushDevices.revokedAt,
      })
      .from(pushDevices)
      .where(and(eq(pushDevices.userId, userId), isNull(pushDevices.revokedAt)));
  }

  /** Usuários com ao menos um aparelho ativo (lembretes diários — R18). */
  async listUsersWithDevices(): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ userId: pushDevices.userId })
      .from(pushDevices)
      .where(isNull(pushDevices.revokedAt));
    return rows.map((row) => row.userId);
  }

  async hasActive(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ userId: pushDevices.userId })
      .from(pushDevices)
      .where(and(inArray(pushDevices.userId, userIds), isNull(pushDevices.revokedAt)));
    return new Set(rows.map((row) => row.userId));
  }

  async purgeRevoked(before: Date): Promise<number> {
    const result = await this.db
      .delete(pushDevices)
      .where(and(isNotNull(pushDevices.revokedAt), lt(pushDevices.revokedAt, before)));
    return result.rowCount ?? 0;
  }
}
