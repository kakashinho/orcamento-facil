import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database, Executor } from "../../db/client.js";
import { tags, transactionTags, transactions } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { errors } from "../../shared/errors.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";

export interface TagDto {
  id: string;
  name: string;
  transactionCount: number;
}

export const MAX_TAGS_PER_TRANSACTION = 10;

/** "  Viagem   SP " → "Viagem SP" */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Tags do usuário para categorização granular das transações (R43). */
export class TagService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<TagDto[]> {
    const rows = await this.db
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
    return rows;
  }

  async create(userId: string, rawName: string): Promise<TagDto> {
    const name = cleanTagName(rawName);
    try {
      const [row] = await this.db
        .insert(tags)
        .values({ userId, name, createdAt: this.clock.now() })
        .returning();
      return { id: row!.id, name: row!.name, transactionCount: 0 };
    } catch (error) {
      if (isUniqueViolation(error, "tags_user_name_uq")) {
        throw errors.conflict("TAG_NAME_TAKEN", "Você já possui uma tag com esse nome.");
      }
      throw error;
    }
  }

  async rename(userId: string, tagId: string, rawName: string): Promise<TagDto> {
    const name = cleanTagName(rawName);
    try {
      const [row] = await this.db
        .update(tags)
        .set({ name })
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .returning();
      if (!row) throw errors.notFound("Tag");
      const [usage] = await this.db
        .select({ value: count() })
        .from(transactionTags)
        .innerJoin(transactions, eq(transactions.id, transactionTags.transactionId))
        .where(and(eq(transactionTags.tagId, tagId), isNull(transactions.deletedAt)));
      return { id: row.id, name: row.name, transactionCount: usage?.value ?? 0 };
    } catch (error) {
      if (isUniqueViolation(error, "tags_user_name_uq")) {
        throw errors.conflict("TAG_NAME_TAKEN", "Você já possui uma tag com esse nome.");
      }
      throw error;
    }
  }

  /** Remove a tag e suas associações; as transações permanecem. */
  async delete(userId: string, tagId: string): Promise<void> {
    const deleted = await this.db
      .delete(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .returning({ id: tags.id });
    if (deleted.length === 0) throw errors.notFound("Tag");
  }

  /** Resolve nomes em ids, criando as tags que ainda não existem para o usuário. */
  async resolveNames(executor: Executor, userId: string, rawNames: string[]): Promise<string[]> {
    const unique = new Map<string, string>();
    for (const raw of rawNames) {
      const name = cleanTagName(raw);
      if (name.length > 0 && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
    }
    if (unique.size === 0) return [];
    if (unique.size > MAX_TAGS_PER_TRANSACTION) {
      throw errors.validation(`Uma transação pode ter no máximo ${MAX_TAGS_PER_TRANSACTION} tags.`);
    }
    const now = this.clock.now();
    await executor
      .insert(tags)
      .values([...unique.values()].map((name) => ({ userId, name, createdAt: now })))
      .onConflictDoNothing();
    const rows = await executor
      .select({ id: tags.id, lowerName: sql<string>`lower(${tags.name})` })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(sql`lower(${tags.name})`, [...unique.keys()])));
    return rows.map((row) => row.id);
  }

  /** Mantém apenas os ids de tags que ainda existem e pertencem ao usuário (restauração via undo). */
  async filterExisting(executor: Executor, userId: string, tagIds: string[]): Promise<string[]> {
    if (tagIds.length === 0) return [];
    const rows = await executor
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
    return rows.map((row) => row.id);
  }
}
