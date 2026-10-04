import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction } from "../../../infrastructure/database/client.js";
import { errors } from "../../../shared/errors/app-error.js";
import { DuplicateEntryError } from "../../../shared/errors/persistence-errors.js";
import type { TagRepository } from "../repositories/tag.repository.js";
import type { TagListResponseDto, TagResponseDto } from "../schemas/tag.schema.js";
import { cleanTagName, MAX_TAGS_PER_TRANSACTION } from "../types/tag.types.js";

/** Tags do usuário para categorização granular das transações (R43). */
export class TagService {
  constructor(
    private readonly tags: TagRepository,
    private readonly clock: Clock,
  ) {}

  private nameTaken(): never {
    throw errors.conflict("TAG_NAME_TAKEN", "Você já possui uma tag com esse nome.");
  }

  async list(userId: string): Promise<TagListResponseDto> {
    return { data: await this.tags.listWithUsage(userId) };
  }

  async create(userId: string, rawName: string): Promise<TagResponseDto> {
    try {
      const tag = await this.tags.insert(userId, cleanTagName(rawName), this.clock.now());
      return { ...tag, transactionCount: 0 };
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
  }

  async rename(userId: string, tagId: string, rawName: string): Promise<TagResponseDto> {
    try {
      const tag = await this.tags.rename(userId, tagId, cleanTagName(rawName));
      if (!tag) throw errors.notFound("Tag");
      return { ...tag, transactionCount: await this.tags.countActiveUsage(tagId) };
    } catch (error) {
      if (error instanceof DuplicateEntryError) this.nameTaken();
      throw error;
    }
  }

  async delete(userId: string, tagId: string): Promise<void> {
    if (!(await this.tags.delete(userId, tagId))) throw errors.notFound("Tag");
  }

  /** Nomes → ids, criando as tags que ainda não existem. Repetições são ignoradas. */
  async resolveNames(tx: DbTransaction, userId: string, rawNames: string[]): Promise<string[]> {
    const unique = new Map<string, string>();
    for (const raw of rawNames) {
      const name = cleanTagName(raw);
      if (name.length > 0 && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
    }
    if (unique.size > MAX_TAGS_PER_TRANSACTION) {
      throw errors.validation(`Uma transação pode ter no máximo ${MAX_TAGS_PER_TRANSACTION} tags.`);
    }
    return this.tags.upsertByNames(userId, [...unique.values()], this.clock.now(), tx);
  }

  /** Mantém só as tags que ainda existem (restauração pelo "desfazer"). */
  filterExisting(tx: DbTransaction, userId: string, tagIds: string[]): Promise<string[]> {
    return this.tags.filterExisting(userId, tagIds, tx);
  }
}
