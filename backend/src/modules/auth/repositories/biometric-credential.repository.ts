import { and, asc, count, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { biometricCredentials } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { BiometricCredentialRecord, NewBiometricCredential } from "../types/biometric.types.js";

/** Chaves públicas dos aparelhos (R40). O desafio pendente é guardado só como hash. */
export class BiometricCredentialRepository extends Repository {
  async insert(input: NewBiometricCredential): Promise<BiometricCredentialRecord> {
    try {
      const [row] = await this.db.insert(biometricCredentials).values(input).returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error, "biometric_credentials_user_key_uq")) throw new DuplicateEntryError("publicKey");
      throw error;
    }
  }

  async listActive(userId: string): Promise<BiometricCredentialRecord[]> {
    return this.db
      .select()
      .from(biometricCredentials)
      .where(and(eq(biometricCredentials.userId, userId), isNull(biometricCredentials.revokedAt)))
      .orderBy(asc(biometricCredentials.createdAt));
  }

  async countActive(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(biometricCredentials)
      .where(and(eq(biometricCredentials.userId, userId), isNull(biometricCredentials.revokedAt)));
    return row?.value ?? 0;
  }

  async findActive(credentialId: string): Promise<BiometricCredentialRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(biometricCredentials)
      .where(and(eq(biometricCredentials.id, credentialId), isNull(biometricCredentials.revokedAt)));
    return row;
  }

  /** Revoga a credencial do usuário; devolve `false` se ela não existe (ou já estava revogada). */
  async revoke(userId: string, credentialId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(biometricCredentials)
      .set({ revokedAt: now, challengeHash: null, challengeExpiresAt: null })
      .where(
        and(
          eq(biometricCredentials.id, credentialId),
          eq(biometricCredentials.userId, userId),
          isNull(biometricCredentials.revokedAt),
        ),
      )
      .returning({ id: biometricCredentials.id });
    return rows.length > 0;
  }

  async revokeAllForUser(userId: string, now: Date, tx?: DbTransaction): Promise<void> {
    await this.executor(tx)
      .update(biometricCredentials)
      .set({ revokedAt: now, challengeHash: null, challengeExpiresAt: null })
      .where(and(eq(biometricCredentials.userId, userId), isNull(biometricCredentials.revokedAt)));
  }

  /** Um desafio por credencial: um novo pedido substitui o anterior. */
  async setChallenge(credentialId: string, challengeHash: string, expiresAt: Date): Promise<void> {
    await this.db
      .update(biometricCredentials)
      .set({ challengeHash, challengeExpiresAt: expiresAt })
      .where(eq(biometricCredentials.id, credentialId));
  }

  /**
   * Consome o desafio (uso único): só um pedido consegue, mesmo com chamadas simultâneas.
   * Devolve `false` se o desafio não confere, já foi usado ou venceu.
   */
  async consumeChallenge(credentialId: string, challengeHash: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(biometricCredentials)
      .set({ challengeHash: null, challengeExpiresAt: null })
      .where(
        and(
          eq(biometricCredentials.id, credentialId),
          isNull(biometricCredentials.revokedAt),
          eq(biometricCredentials.challengeHash, challengeHash),
          gt(biometricCredentials.challengeExpiresAt, now),
        ),
      )
      .returning({ id: biometricCredentials.id });
    return rows.length > 0;
  }

  async markUsed(credentialId: string, now: Date): Promise<void> {
    await this.db.update(biometricCredentials).set({ lastUsedAt: now }).where(eq(biometricCredentials.id, credentialId));
  }

  /** Limpeza: remove credenciais revogadas há mais tempo que `before`. */
  async deleteRevokedBefore(before: Date): Promise<number> {
    const result = await this.db
      .delete(biometricCredentials)
      .where(and(isNotNull(biometricCredentials.revokedAt), lt(biometricCredentials.revokedAt, before)));
    return result.rowCount ?? 0;
  }
}
