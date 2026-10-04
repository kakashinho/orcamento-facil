import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database, DbTransaction } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { categories, tags, transactions, transactionTags, wallets } from "../../../infrastructure/database/schema.js";
import { monthRange } from "../../../shared/utils/dates.js";
import { escapeLike } from "../../../shared/utils/text.js";
import type {
  DateCursor,
  MovementRange,
  SortOrder,
  TransactionDetails,
  TransactionFilters,
  TransactionMovement,
  TransactionRecord,
  TransactionState,
  TransactionType,
} from "../types/transaction.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TransactionRow = typeof transactions.$inferSelect;

const detailColumns = {
  id: transactions.id,
  type: transactions.type,
  amount: transactions.amount,
  date: transactions.date,
  description: transactions.description,
  archived: transactions.archived,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
  walletId: wallets.id,
  walletName: wallets.name,
  currency: wallets.currency,
  categoryId: categories.id,
  categoryName: categories.name,
  categoryOwner: categories.userId,
};

type DetailRow = {
  id: string;
  type: string;
  amount: Buffer;
  date: string;
  description: string;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  walletId: string;
  walletName: string;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryOwner: string | null;
};

/**
 * Persistência das transações. O valor é cifrado com AES-256-GCM (R81) ao gravar e
 * decifrado ao ler; a camada de service só trabalha com centavos em claro.
 */
export class TransactionRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private decryptAmount(transactionId: string, amount: Buffer): number {
    return this.cipher.decryptAmount(amount, aad.transactionAmount(transactionId));
  }

  // ---------------------------------------------------------------- escrita

  private async replaceTags(tx: DbTransaction, transactionId: string, tagIds: string[]): Promise<void> {
    await tx.delete(transactionTags).where(eq(transactionTags.transactionId, transactionId));
    if (tagIds.length > 0) {
      await tx.insert(transactionTags).values(tagIds.map((tagId) => ({ transactionId, tagId })));
    }
  }

  async insert(
    record: { id: string; userId: string; createdAt: Date } & TransactionState,
    tx: DbTransaction,
  ): Promise<void> {
    await tx.insert(transactions).values({
      id: record.id,
      userId: record.userId,
      walletId: record.walletId,
      type: record.type,
      amount: this.cipher.encryptAmount(record.amountCents, aad.transactionAmount(record.id)),
      date: record.date,
      description: record.description,
      categoryId: record.categoryId,
      archived: record.archived,
      createdAt: record.createdAt,
      updatedAt: record.createdAt,
    });
    await this.replaceTags(tx, record.id, record.tagIds);
  }

  private async toRecord(row: TransactionRow, tx?: DbTransaction): Promise<TransactionRecord> {
    const tagRows = await this.executor(tx)
      .select({ tagId: transactionTags.tagId })
      .from(transactionTags)
      .where(eq(transactionTags.transactionId, row.id));
    return {
      id: row.id,
      userId: row.userId,
      walletId: row.walletId,
      type: row.type as TransactionType,
      amountCents: this.decryptAmount(row.id, row.amount),
      date: row.date,
      description: row.description,
      categoryId: row.categoryId,
      archived: row.archived,
      tagIds: tagRows.map((tag) => tag.tagId),
      deletedAt: row.deletedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Bloqueia a linha (FOR UPDATE). `deleted` escolhe entre transações ativas ou excluídas. */
  async findForUpdate(
    userId: string,
    transactionId: string,
    deleted: boolean,
    tx: DbTransaction,
  ): Promise<TransactionRecord | undefined> {
    const [row] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          eq(transactions.userId, userId),
          deleted ? isNotNull(transactions.deletedAt) : isNull(transactions.deletedAt),
        ),
      )
      .for("update");
    return row ? this.toRecord(row, tx) : undefined;
  }

  async findActive(userId: string, transactionId: string, tx?: DbTransaction): Promise<TransactionRecord | undefined> {
    const [row] = await this.executor(tx)
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)));
    return row ? this.toRecord(row, tx) : undefined;
  }

  async updateState(transactionId: string, state: TransactionState, now: Date, tx: DbTransaction): Promise<void> {
    await tx
      .update(transactions)
      .set({
        walletId: state.walletId,
        type: state.type,
        amount: this.cipher.encryptAmount(state.amountCents, aad.transactionAmount(transactionId)),
        date: state.date,
        description: state.description,
        categoryId: state.categoryId,
        archived: state.archived,
        updatedAt: now,
      })
      .where(eq(transactions.id, transactionId));
    await this.replaceTags(tx, transactionId, state.tagIds);
  }

  async softDelete(transactionId: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(transactions).set({ deletedAt: now, updatedAt: now }).where(eq(transactions.id, transactionId));
  }

  async restore(transactionId: string, now: Date, tx: DbTransaction): Promise<void> {
    await tx.update(transactions).set({ deletedAt: null, updatedAt: now }).where(eq(transactions.id, transactionId));
  }

  async setArchived(userId: string, transactionIds: string[], archived: boolean, now: Date, tx: DbTransaction): Promise<void> {
    if (transactionIds.length === 0) return;
    await tx
      .update(transactions)
      .set({ archived, updatedAt: now })
      .where(
        and(eq(transactions.userId, userId), inArray(transactions.id, transactionIds), isNull(transactions.deletedAt)),
      );
  }

  /** Arquiva as transações anteriores à data e devolve os ids afetados. */
  async archiveBefore(userId: string, beforeDate: string, now: Date, tx: DbTransaction): Promise<string[]> {
    const updated = await tx
      .update(transactions)
      .set({ archived: true, updatedAt: now })
      .where(
        and(
          eq(transactions.userId, userId),
          isNull(transactions.deletedAt),
          eq(transactions.archived, false),
          lt(transactions.date, beforeDate),
        ),
      )
      .returning({ id: transactions.id });
    return updated.map((row) => row.id);
  }

  async countByWallet(walletId: string, onlyActive: boolean, tx: DbTransaction): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(transactions)
      .where(
        onlyActive
          ? and(eq(transactions.walletId, walletId), isNull(transactions.deletedAt))
          : eq(transactions.walletId, walletId),
      );
    return row?.value ?? 0;
  }

  /** Remove definitivamente as transações da carteira (só restam as excluídas logicamente). */
  async deleteAllByWallet(walletId: string, tx: DbTransaction): Promise<string[]> {
    const deleted = await tx
      .delete(transactions)
      .where(eq(transactions.walletId, walletId))
      .returning({ id: transactions.id });
    return deleted.map((row) => row.id);
  }

  // ---------------------------------------------------------------- leitura

  private conditions(userId: string, filters: TransactionFilters): SQL[] {
    const conditions: SQL[] = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
    let from = filters.from;
    let to = filters.to;
    if (filters.month) {
      const range = monthRange(filters.month);
      from = from && from > range.from ? from : range.from;
      to = to && to < range.to ? to : range.to;
    }
    if (from) conditions.push(gte(transactions.date, from));
    if (to) conditions.push(lte(transactions.date, to));
    if (filters.walletId) conditions.push(eq(transactions.walletId, filters.walletId));
    if (filters.categoryId) conditions.push(eq(transactions.categoryId, filters.categoryId));
    if (filters.type) conditions.push(eq(transactions.type, filters.type));
    const archived = filters.archived ?? "false";
    if (archived !== "all") conditions.push(eq(transactions.archived, archived === "true"));
    if (filters.q && filters.q.trim().length > 0) {
      const pattern = `%${escapeLike(filters.q.trim())}%`;
      conditions.push(sql`unaccent(${transactions.description}) ilike unaccent(${pattern})`);
    }
    if (filters.tag) {
      const tagMatch = UUID_PATTERN.test(filters.tag)
        ? sql`${tags.id} = ${filters.tag}`
        : sql`lower(${tags.name}) = lower(${filters.tag.trim()})`;
      conditions.push(sql`exists (
        select 1 from ${transactionTags}
        inner join ${tags} on ${tags.id} = ${transactionTags.tagId}
        where ${transactionTags.transactionId} = ${transactions.id}
          and ${tags.userId} = ${userId}
          and ${tagMatch})`);
    }
    return conditions;
  }

  private selectDetails() {
    return this.db
      .select(detailColumns)
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId));
  }

  /** Completa as linhas com as tags (uma única consulta para a página inteira). */
  private async hydrate(rows: DetailRow[]): Promise<TransactionDetails[]> {
    if (rows.length === 0) return [];
    const tagRows = await this.db
      .select({ transactionId: transactionTags.transactionId, id: tags.id, name: tags.name })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(inArray(transactionTags.transactionId, rows.map((row) => row.id)))
      .orderBy(asc(sql`lower(${tags.name})`));
    const tagsByTransaction = new Map<string, Array<{ id: string; name: string }>>();
    for (const tag of tagRows) {
      const list = tagsByTransaction.get(tag.transactionId) ?? [];
      list.push({ id: tag.id, name: tag.name });
      tagsByTransaction.set(tag.transactionId, list);
    }
    return rows.map((row) => ({
      id: row.id,
      type: row.type as TransactionType,
      amountCents: this.decryptAmount(row.id, row.amount),
      currency: row.currency,
      date: row.date,
      description: row.description,
      wallet: { id: row.walletId, name: row.walletName, currency: row.currency },
      category:
        row.categoryId && row.categoryName
          ? { id: row.categoryId, name: row.categoryName, predefined: row.categoryOwner === null }
          : null,
      tags: tagsByTransaction.get(row.id) ?? [],
      archived: row.archived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async findDetails(userId: string, transactionId: string): Promise<TransactionDetails | undefined> {
    const rows = await this.selectDetails().where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)),
    );
    const [details] = await this.hydrate(rows);
    return details;
  }

  /** Ordem cronológica (R09) com paginação por keyset: custo constante por página. */
  async listByDate(
    userId: string,
    filters: TransactionFilters,
    order: SortOrder,
    limit: number,
    after?: DateCursor,
  ): Promise<{ items: TransactionDetails[]; hasMore: boolean }> {
    const conditions = this.conditions(userId, filters);
    const direction = order === "desc" ? desc : asc;
    if (after) {
      const comparison = order === "desc" ? sql`<` : sql`>`;
      conditions.push(
        sql`(${transactions.date}, ${transactions.createdAt}, ${transactions.id}) ${comparison} (${after.date}::date, ${after.createdAt}::timestamptz, ${after.id}::uuid)`,
      );
    }
    const rows = await this.selectDetails()
      .where(and(...conditions))
      .orderBy(direction(transactions.date), direction(transactions.createdAt), direction(transactions.id))
      .limit(limit + 1);
    return { items: await this.hydrate(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  /**
   * Ordenação por valor (R70). Os valores são cifrados, então a ordenação acontece aqui,
   * sobre o conjunto já filtrado do usuário; só a página pedida é hidratada.
   */
  async listByAmount(
    userId: string,
    filters: TransactionFilters,
    order: SortOrder,
    offset: number,
    limit: number,
  ): Promise<{ items: TransactionDetails[]; total: number }> {
    const candidates = await this.db
      .select({ id: transactions.id, amount: transactions.amount, date: transactions.date, createdAt: transactions.createdAt })
      .from(transactions)
      .where(and(...this.conditions(userId, filters)));
    const sorted = candidates
      .map((row) => ({ ...row, cents: this.decryptAmount(row.id, row.amount) }))
      .sort((a, b) => {
        const byAmount = order === "asc" ? a.cents - b.cents : b.cents - a.cents;
        if (byAmount !== 0) return byAmount;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
      });
    const pageIds = sorted.slice(offset, offset + limit).map((row) => row.id);
    const rows = pageIds.length ? await this.selectDetails().where(inArray(transactions.id, pageIds)) : [];
    const position = new Map(pageIds.map((id, index) => [id, index]));
    rows.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
    return { items: await this.hydrate(rows), total: sorted.length };
  }

  async listByCategory(
    userId: string,
    filters: TransactionFilters,
    order: SortOrder,
    offset: number,
    limit: number,
  ): Promise<{ items: TransactionDetails[]; hasMore: boolean }> {
    const nameOrder = order === "asc" ? asc(sql`lower(${categories.name})`) : desc(sql`lower(${categories.name})`);
    const rows = await this.selectDetails()
      .where(and(...this.conditions(userId, filters)))
      .orderBy(
        asc(sql`${categories.name} is null`),
        nameOrder,
        desc(transactions.date),
        desc(transactions.createdAt),
        desc(transactions.id),
      )
      .limit(limit + 1)
      .offset(offset);
    return { items: await this.hydrate(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  /** Tipo, valor e moeda de cada transação do filtro — base para totais (R26). */
  async listAmounts(
    userId: string,
    filters: TransactionFilters,
  ): Promise<Array<{ type: TransactionType; amountCents: number; currency: string }>> {
    const rows = await this.db
      .select({ id: transactions.id, type: transactions.type, amount: transactions.amount, currency: wallets.currency })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(and(...this.conditions(userId, filters)));
    return rows.map((row) => ({
      type: row.type as TransactionType,
      amountCents: this.decryptAmount(row.id, row.amount),
      currency: row.currency,
    }));
  }

  /** Transações ativas de um tipo que usam a categoria (para restringir o tipo da categoria). */
  async countActiveByCategoryAndType(userId: string, categoryId: string, type: TransactionType): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.categoryId, categoryId),
          eq(transactions.type, type),
          isNull(transactions.deletedAt),
        ),
      );
    return row?.value ?? 0;
  }

  /** Meses com transações e a quantidade em cada um, do mais recente ao mais antigo (R26). */
  async listMonths(
    userId: string,
    filters: Pick<TransactionFilters, "walletId" | "archived">,
  ): Promise<Array<{ month: string; count: number }>> {
    const month = sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;
    return this.db
      .select({ month, count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(...this.conditions(userId, filters)))
      .groupBy(month)
      .orderBy(desc(month));
  }

  /** Descrições já categorizadas pelo usuário — "memória" da sugestão de categoria (R44). */
  async recentCategorized(userId: string, limit: number): Promise<Array<{ description: string; categoryId: string }>> {
    const rows = await this.db
      .select({ description: transactions.description, categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt), isNotNull(transactions.categoryId)))
      .orderBy(desc(transactions.createdAt))
      .limit(limit);
    return rows.map((row) => ({ description: row.description, categoryId: row.categoryId! }));
  }

  /**
   * Movimentos ativos para relatórios — inclui arquivadas: arquivar só tira da lista
   * principal, o movimento financeiro continua existindo.
   */
  async listMovements(userId: string, range: MovementRange): Promise<TransactionMovement[]> {
    const conditions: SQL[] = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
    if (range.from) conditions.push(gte(transactions.date, range.from));
    if (range.to) conditions.push(lte(transactions.date, range.to));
    if (range.before) conditions.push(lt(transactions.date, range.before));
    if (range.walletId) conditions.push(eq(transactions.walletId, range.walletId));
    if (range.type) conditions.push(eq(transactions.type, range.type));
    const rows = await this.db
      .select({
        id: transactions.id,
        type: transactions.type,
        amount: transactions.amount,
        date: transactions.date,
        createdAt: transactions.createdAt,
        description: transactions.description,
        walletId: transactions.walletId,
        categoryId: categories.id,
        categoryName: categories.name,
      })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .where(and(...conditions));
    return rows.map((row) => ({
      id: row.id,
      type: row.type as TransactionType,
      amountCents: this.decryptAmount(row.id, row.amount),
      date: row.date,
      createdAt: row.createdAt,
      description: row.description,
      walletId: row.walletId,
      category: row.categoryId && row.categoryName ? { id: row.categoryId, name: row.categoryName } : null,
    }));
  }
}
