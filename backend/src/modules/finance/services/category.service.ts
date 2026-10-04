import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { errors, fieldIssue } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import { normalizeText } from "../../../shared/utils/text.js";
import type { CategoryRepository } from "../repositories/category.repository.js";
import type { TransactionRepository } from "../repositories/transaction.repository.js";
import type {
  CategoryListResponseDto,
  CategoryResponseDto,
  CategorySuggestionsResponseDto,
  CreateCategoryRequestDto,
  UpdateCategoryRequestDto,
} from "../schemas/category.schema.js";
import { acceptsType, type Category, type CategoryType, TYPE_LABEL } from "../types/category.types.js";
import { suggestCategories } from "./category-suggester.js";

const HISTORY_SAMPLE_SIZE = 500;

export function toCategoryResponseDto(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
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

  /** Com `type`, só as categorias que aceitam esse tipo de transação (para o seletor do formulário). */
  async list(userId: string, type?: CategoryType): Promise<CategoryListResponseDto> {
    const rows = await this.categories.listVisible(userId);
    const data = rows
      .filter((category) => type === undefined || acceptsType(category, type))
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
      const message =
        clash.userId === null ? "Já existe uma categoria predefinida com esse nome." : "Você já possui uma categoria com esse nome.";
      throw errors.conflict("CATEGORY_NAME_TAKEN", message, [fieldIssue("name", message)]);
    }
  }

  private nameTaken(): never {
    const message = "Você já possui uma categoria com esse nome.";
    throw errors.conflict("CATEGORY_NAME_TAKEN", message, [fieldIssue("name", message)]);
  }

  async create(userId: string, input: CreateCategoryRequestDto): Promise<CategoryResponseDto> {
    await this.assertNameAvailable(userId, input.name);
    try {
      const category = await this.categories.insert(userId, { name: input.name, type: input.type ?? null }, this.clock.now());
      return toCategoryResponseDto(category);
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

  /** Renomeia e/ou muda o tipo. Restringir o tipo exige que nenhuma transação do outro tipo a use. */
  async update(userId: string, categoryId: string, input: UpdateCategoryRequestDto): Promise<CategoryResponseDto> {
    const category = await this.findOwnedCustom(userId, categoryId);
    const changes: { name?: string; type?: CategoryType | null } = {};

    if (input.name !== undefined && input.name !== category.name) {
      await this.assertNameAvailable(userId, input.name, categoryId);
      changes.name = input.name;
    }
    if (input.type !== undefined && input.type !== category.type) {
      if (input.type !== null) {
        const other: CategoryType = input.type === "income" ? "expense" : "income";
        const inUse = await this.transactions.countActiveByCategoryAndType(userId, categoryId, other);
        if (inUse > 0) {
          const message = `Existem ${inUse} ${TYPE_LABEL[other].plural} com esta categoria. Mude a categoria delas antes de restringi-la a ${TYPE_LABEL[input.type].plural}.`;
          throw errors.conflict("CATEGORY_TYPE_IN_USE", message, [fieldIssue("type", message)]);
        }
      }
      changes.type = input.type;
    }
    if (Object.keys(changes).length === 0) return toCategoryResponseDto(category);

    try {
      return toCategoryResponseDto(await this.categories.update(categoryId, changes, this.clock.now()));
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
  }

  async delete(userId: string, categoryId: string): Promise<void> {
    await this.findOwnedCustom(userId, categoryId);
    await this.categories.softDelete(categoryId, this.clock.now());
  }

  /** Categoria predefinida ou do usuário, ainda não excluída. */
  findAssignable(userId: string, categoryId: string, tx?: DbTransaction): Promise<Category | undefined> {
    return this.categories.findVisible(userId, categoryId, tx);
  }

  async assertAssignable(userId: string, categoryId: string, tx?: DbTransaction): Promise<Category> {
    const category = await this.findAssignable(userId, categoryId, tx);
    if (!category) {
      throw errors.unprocessable("INVALID_CATEGORY", "Categoria inexistente ou excluída.", "categoryId");
    }
    return category;
  }

  /** Coerência: "Salário" (receitas) não pode classificar uma despesa, e vice-versa. */
  assertAcceptsType(category: Category, type: CategoryType): void {
    if (!acceptsType(category, type)) {
      throw errors.unprocessable(
        "CATEGORY_TYPE_MISMATCH",
        `A categoria "${category.name}" é de ${TYPE_LABEL[category.type!].plural} e não pode ser usada em uma ${TYPE_LABEL[type].singular}.`,
        "categoryId",
      );
    }
  }

  /** R44: com `type`, sugere apenas categorias compatíveis com o tipo da transação. */
  async suggest(userId: string, description: string, type?: CategoryType): Promise<CategorySuggestionsResponseDto> {
    const available = (await this.categories.listVisible(userId)).filter(
      (category) => type === undefined || acceptsType(category, type),
    );
    const history = await this.transactions.recentCategorized(userId, HISTORY_SAMPLE_SIZE);
    return { suggestions: suggestCategories(description, available, history) };
  }
}
