import { and, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import type { Database, Executor } from "../../db/client.js";
import { categories, transactions } from "../../db/schema.js";
import type { Clock } from "../../infra/clock.js";
import { errors } from "../../shared/errors.js";
import { isUniqueViolation } from "../../shared/pg-errors.js";
import { normalizeText } from "../../shared/text.js";
import { type CategorySuggestion, suggestCategories } from "./category-suggester.js";

export type CategoryRow = typeof categories.$inferSelect;

export interface CategoryDto {
  id: string;
  name: string;
  predefined: boolean;
  systemKey: string | null;
}

const HISTORY_SAMPLE_SIZE = 500;

export class CategoryService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  static toDto(row: Pick<CategoryRow, "id" | "name" | "userId" | "systemKey">): CategoryDto {
    return { id: row.id, name: row.name, predefined: row.userId === null, systemKey: row.systemKey };
  }

  private visibleTo(userId: string) {
    return and(or(isNull(categories.userId), eq(categories.userId, userId)), isNull(categories.deletedAt));
  }

  /** Predefinidas (R07) + personalizadas ativas do usuário (R08). */
  async list(userId: string): Promise<CategoryDto[]> {
    const rows = await this.db.select().from(categories).where(this.visibleTo(userId));
    return rows
      .map((row) => CategoryService.toDto(row))
      .sort((a, b) => Number(b.predefined) - Number(a.predefined) || a.name.localeCompare(b.name, "pt-BR"));
  }

  private async assertNameAvailable(userId: string, name: string, ignoreId?: string) {
    const wanted = normalizeText(name);
    const existing = await this.list(userId);
    const clash = existing.find((category) => category.id !== ignoreId && normalizeText(category.name) === wanted);
    if (clash) {
      throw errors.conflict(
        "CATEGORY_NAME_TAKEN",
        clash.predefined ? "Já existe uma categoria predefinida com esse nome." : "Você já possui uma categoria com esse nome.",
      );
    }
  }

  async create(userId: string, rawName: string): Promise<CategoryDto> {
    const name = rawName.trim();
    await this.assertNameAvailable(userId, name);
    const now = this.clock.now();
    try {
      const [row] = await this.db
        .insert(categories)
        .values({ userId, name, createdAt: now, updatedAt: now })
        .returning();
      return CategoryService.toDto(row!);
    } catch (error) {
      if (isUniqueViolation(error, "categories_user_name_uq")) {
        throw errors.conflict("CATEGORY_NAME_TAKEN", "Você já possui uma categoria com esse nome.");
      }
      throw error;
    }
  }

  private async findOwnedCustom(userId: string, categoryId: string): Promise<CategoryRow> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), this.visibleTo(userId)));
    if (!row) throw errors.notFound("Categoria");
    if (row.userId === null) {
      throw errors.forbidden("Categorias predefinidas não podem ser alteradas ou excluídas.");
    }
    return row;
  }

  async rename(userId: string, categoryId: string, rawName: string): Promise<CategoryDto> {
    await this.findOwnedCustom(userId, categoryId);
    const name = rawName.trim();
    await this.assertNameAvailable(userId, name, categoryId);
    try {
      const [row] = await this.db
        .update(categories)
        .set({ name, updatedAt: this.clock.now() })
        .where(eq(categories.id, categoryId))
        .returning();
      return CategoryService.toDto(row!);
    } catch (error) {
      if (isUniqueViolation(error, "categories_user_name_uq")) {
        throw errors.conflict("CATEGORY_NAME_TAKEN", "Você já possui uma categoria com esse nome.");
      }
      throw error;
    }
  }

  /**
   * Exclusão lógica: a categoria some das listas e não pode ser usada em novas transações,
   * mas as transações antigas continuam exibindo-a (histórico e relatórios preservados).
   */
  async delete(userId: string, categoryId: string): Promise<void> {
    await this.findOwnedCustom(userId, categoryId);
    await this.db
      .update(categories)
      .set({ deletedAt: this.clock.now(), updatedAt: this.clock.now() })
      .where(eq(categories.id, categoryId));
  }

  /** Garante que a categoria pode ser atribuída a uma transação do usuário. */
  async assertAssignable(executor: Executor, userId: string, categoryId: string): Promise<void> {
    const [row] = await executor
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), this.visibleTo(userId)));
    if (!row) {
      throw errors.unprocessable("INVALID_CATEGORY", "Categoria inexistente ou indisponível.");
    }
  }

  /** R44: sugere categorias para uma descrição. */
  async suggest(userId: string, description: string): Promise<CategorySuggestion[]> {
    const available = await this.db
      .select({ id: categories.id, name: categories.name, systemKey: categories.systemKey })
      .from(categories)
      .where(this.visibleTo(userId));
    const history = await this.db
      .select({ description: transactions.description, categoryId: transactions.categoryId })
      .from(transactions)
      .where(
        and(eq(transactions.userId, userId), isNull(transactions.deletedAt), isNotNull(transactions.categoryId)),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(HISTORY_SAMPLE_SIZE);
    return suggestCategories(
      description,
      available,
      history.map((row) => ({ description: row.description, categoryId: row.categoryId! })),
    );
  }
}
