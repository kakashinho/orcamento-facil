import { and, eq, isNull } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { passwordResetTokens } from "../../../infrastructure/database/schema.js";

export type PasswordResetTokenRecord = typeof passwordResetTokens.$inferSelect;

export class PasswordResetTokenRepository extends Repository {
  /** Invalida os links ainda ativos do usuário. */
  async revokeActiveForUser(userId: string, now: Date, tx?: DbTransaction): Promise<void> {
    await this.executor(tx)
      .update(passwordResetTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      );
  }

  async create(
    token: { userId: string; tokenHash: string; expiresAt: Date; createdAt: Date },
    tx?: DbTransaction,
  ): Promise<void> {
    await this.executor(tx).insert(passwordResetTokens).values(token);
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return row;
  }

  /** Marca o link como usado; devolve `false` se outro pedido já o consumiu (uso único). */
  async consume(id: string, now: Date, tx: DbTransaction): Promise<boolean> {
    const consumed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.id, id),
          isNull(passwordResetTokens.usedAt),
          isNull(passwordResetTokens.revokedAt),
        ),
      )
      .returning({ id: passwordResetTokens.id });
    return consumed.length > 0;
  }
}
