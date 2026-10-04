import { and, eq, isNull, or } from "drizzle-orm";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { categories } from "../../../infrastructure/database/schema.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { isUniqueViolation } from "../../../shared/errors/pg-errors.js";
import type { Category } from "../types/category.types.js";

const UNIQUE_NAME = "categories_user_name_uq";

export class CategoryRepository extends Repository {
  /** Predefinidas + personalizadas ativas do usuário. */
  private visibleTo(userId: string) {
    return and(or(isNull(categories.userId), eq(categories.userId, userId)), isNull(categories.deletedAt));
  }

  async listVisible(userId: string): Promise<Category[]> {
    return this.db
      .select({
        id: categories.id,
        userId: categories.userId,
        systemKey: categories.systemKey,
        name: categories.name,
        deletedAt: categories.deletedAt,
      })
      .from(categories)
      .where(this.visibleTo(userId));
  }

  async findVisible(userId: string, categoryId: string, tx?: DbTransaction): Promise<Category | undefined> {
    const [row] = await this.executor(tx)
      .select({
        id: categories.id,
        userId: categories.userId,
        systemKey: categories.systemKey,
        name: categories.name,
        deletedAt: categories.deletedAt,
      })
      .from(categories)
      .where(and(eq(categories.id, categoryId), this.visibleTo(userId)));
    return row;
  }

  async insert(userId: string, name: string, now: Date): Promise<Category> {
    try {
      const [row] = await this.db
        .insert(categories)
        .values({ userId, name, createdAt: now, updatedAt: now })
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_NAME)) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  async rename(categoryId: string, name: string, now: Date): Promise<Category> {
    try {
      const [row] = await this.db
        .update(categories)
        .set({ name, updatedAt: now })
        .where(eq(categories.id, categoryId))
        .returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_NAME)) throw new DuplicateEntryError("name");
      throw error;
    }
  }

  /** Exclusão lógica: transações antigas continuam exibindo a categoria. */
  async softDelete(categoryId: string, now: Date): Promise<void> {
    await this.db.update(categories).set({ deletedAt: now, updatedAt: now }).where(eq(categories.id, categoryId));
  }
}
