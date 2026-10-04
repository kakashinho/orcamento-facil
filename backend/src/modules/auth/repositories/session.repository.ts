import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { sessions } from "../../../infrastructure/database/schema.js";
import type { SessionRecord } from "../types/auth.types.js";

export interface NewSession {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
}

/** Refresh tokens (só o hash) agrupados por família — uma família por login. */
export class SessionRepository extends Repository {
  async create(session: NewSession, tx?: DbTransaction): Promise<void> {
    await this.executor(tx).insert(sessions).values(session);
  }

  async findByTokenHash(tokenHash: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    return row;
  }

  /** Bloqueia a linha para a rotação não ser executada duas vezes em paralelo. */
  async findByTokenHashForUpdate(tokenHash: string, tx: DbTransaction): Promise<SessionRecord | undefined> {
    const [row] = await tx.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).for("update");
    return row;
  }

  async markRotated(id: string, replacedById: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(sessions).set({ revokedAt: now, replacedById }).where(eq(sessions.id, id));
  }

  async revokeFamily(familyId: string, now: Date, tx?: DbTransaction): Promise<void> {
    await this.executor(tx)
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  async revokeAllForUser(userId: string, now: Date, exceptFamilyId?: string, tx?: DbTransaction): Promise<void> {
    await this.executor(tx)
      .update(sessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          exceptFamilyId ? ne(sessions.familyId, exceptFamilyId) : undefined,
        ),
      );
  }

  /** A sessão vale enquanto houver um refresh token ativo e não expirado na família. */
  async hasActiveSession(familyId: string, userId: string, now: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.familyId, familyId),
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
