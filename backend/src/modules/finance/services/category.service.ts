import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { normalizeText } from "../../../shared/utils/text.js";
import type { CategoryRepository } from "../repositories/category.repository.js";
import type { TransactionRepository } from "../repositories/transaction.repository.js";
import type {
  CategoryListResponseDto,
  CategoryResponseDto,
  CategorySuggestionsResponseDto,
} from "../schemas/category.schema.js";
import type { Category } from "../types/category.types.js";
import { suggestCategories } from "./category-suggester.js";

const HISTORY_SAMPLE_SIZE = 500;

export function toCategoryResponseDto(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    predefined: category.userId === null,
    systemKey: category.systemKey,
  };
}

/** Categorias predefinidas (R07), personalizadas (R08) e sugestão por descrição (R44). */
export class CategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly transactions: TransactionRepository,
    private readonly clock: Clock,
  ) {}

  async list(userId: string): Promise<CategoryListResponseDto> {
    const rows = await this.categories.listVisible(userId);
    const data = rows
      .map(toCategoryResponseDto)
      .sort((a, b) => Number(b.predefined) - Number(a.predefined) || a.name.localeCompare(b.name, "pt-BR"));
    return { data };
  }

  /** Nome não pode repetir uma categoria visível, nem sem acentos ("saude" = "Saúde"). */
  private async assertNameAvailable(userId: string, name: string, ignoreId?: string): Promise<void> {
    const wanted = normalizeText(name);
    const visible = await this.categories.listVisible(userId);
    const clash = visible.find((category) => category.id !== ignoreId && normalizeText(category.name) === wanted);
    if (clash) {
      throw errors.conflict(
        "CATEGORY_NAME_TAKEN",
        clash.userId === null ? "Já existe uma categoria predefinida com esse nome." : "Você já possui uma categoria com esse nome.",
      );
    }
  }

  private nameTaken(): never {
    throw errors.conflict("CATEGORY_NAME_TAKEN", "Você já possui uma categoria com esse nome.");
  }

  async create(userId: string, rawName: string): Promise<CategoryResponseDto> {
    const name = rawName.trim();
    await this.assertNameAvailable(userId, name);
    try {
      return toCategoryResponseDto(await this.categories.insert(userId, name, this.clock.now()));
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
  }

  private async findOwnedCustom(userId: string, categoryId: string): Promise<Category> {
    const category = await this.categories.findVisible(userId, categoryId);
    if (!category) throw errors.notFound("Categoria");
    if (category.userId === null) {
      throw errors.forbidden("Categorias predefinidas não podem ser alteradas ou excluídas.");
    }
    return category;
  }

  async rename(userId: string, categoryId: string, rawName: string): Promise<CategoryResponseDto> {
    await this.findOwnedCustom(userId, categoryId);
    const name = rawName.trim();
    await this.assertNameAvailable(userId, name, categoryId);
    try {
      return toCategoryResponseDto(await this.categories.rename(categoryId, name, this.clock.now()));
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    await this.findOwnedCustom(userId, categoryId);
    await this.categories.softDelete(categoryId, this.clock.now());
  }

  async isAssignable(userId: string, categoryId: string, tx?: DbTransaction): Promise<boolean> {
    return (await this.categories.findVisible(userId, categoryId, tx)) !== undefined;
  }

  /** A categoria precisa ser predefinida ou do usuário, e não excluída. */
  async assertAssignable(userId: string, categoryId: string, tx?: DbTransaction): Promise<void> {
    if (!(await this.isAssignable(userId, categoryId, tx))) {
      throw errors.unprocessable("INVALID_CATEGORY", "Categoria inexistente ou indisponível.");
    }
  }

  async suggest(userId: string, description: string): Promise<CategorySuggestionsResponseDto> {
    const available = await this.categories.listVisible(userId);
    const history = await this.transactions.recentCategorized(userId, HISTORY_SAMPLE_SIZE);
    return { suggestions: suggestCategories(description, available, history) };
  }
}
