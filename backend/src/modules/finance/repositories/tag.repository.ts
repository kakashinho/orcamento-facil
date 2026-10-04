import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { tags, transactions, transactionTags } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { TagWithUsage } from "../types/tag.types.js";

const UNIQUE_NAME = "tags_user_name_uq";

export class TagRepository extends Repository {
  async listWithUsage(userId: string): Promise<TagWithUsage[]> {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        transactionCount: sql<number>`count(${transactions.id})::int`,
      })
      .from(tags)
      .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
      .leftJoin(transactions, and(eq(transactions.id, transactionTags.transactionId), isNull(transactions.deletedAt)))
      .where(eq(tags.userId, userId))
      .groupBy(tags.id, tags.name)
      .orderBy(asc(sql`lower(${tags.name})`));
  }

  async insert(userId: string, name: string, now: Date): Promise<{ id: string; name: string }> {
    try {
      const [row] = await this.db.insert(tags).values({ userId, name, createdAt: now }).returning();
      return { id: row!.id, name: row!.name };
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_NAME)) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  async rename(userId: string, tagId: string, name: string): Promise<{ id: string; name: string } | undefined> {
    try {
      const [row] = await this.db
        .update(tags)
        .set({ name })
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning({ id: tags.id, name: tags.name });
      return row;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_NAME)) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  async countActiveUsage(tagId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(transactionTags)
      .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
      .where(and(eq(transactionTags.tagId, tagId), isNull(transactions.deletedAt)));
    return row?.value ?? 0;
  }

  /** Remove a tag e suas associações (cascade); devolve `false` se não existia. */
  async delete(userId: string, tagId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning({ id: tags.id });
    return deleted.length > 0;
  }

  /** Cria as tags que faltam e devolve os ids de todas, por nome sem diferenciar maiúsculas. */
  async upsertByNames(userId: string, names: string[], now: Date, tx: DbTransaction): Promise<string[]> {
    if (names.length === 0) return [];
    await tx
      .insert(tags)
      .values(names.map((name) => ({ userId, name, createdAt: now })))
      .onConflictDoNothing();
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, names.map((name) => name.toLowerCase()))));
    return rows.map((row) => row.id);
  }

  async filterExisting(userId: string, tagIds: string[], tx: DbTransaction): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
    return rows.map((row) => row.id);
  }
}
