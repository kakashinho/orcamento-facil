import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { categories, tags, transactionTags, transactions, wallets } from "../../db/schema.js";
import { aad, type FieldCipher } from "../../shared/crypto/field-cipher.js";
import { monthRange } from "../../shared/dates.js";
import { errors } from "../../shared/errors.js";
import { fromCents } from "../../shared/money.js";
import { decodeCursor, encodeCursor } from "../../shared/pagination.js";
import { escapeLike } from "../../shared/text.js";
import type {
  TransactionDto,
  TransactionFilters,
  TransactionListQuery,
  TransactionType,
} from "./transaction.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listColumns = {
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

type ListRow = {
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

interface DateCursor extends Record<string, unknown> {
  d: string;
  c: string;
  i: string;
}

interface OffsetCursor extends Record<string, unknown> {
  o: number;
}

export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}

/** Leitura de transações: listagem (R09), busca (R10), mês (R26), ordenação (R70), arquivadas (R52). */
export class TransactionQueries {
  constructor(
    private readonly db: Database,
    private readonly cipher: FieldCipher,
  ) {}

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

  private baseSelect() {
    return this.db
      .select(listColumns)
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .leftJoin(categories, eq(categories.id, transactions.categoryId));
  }

  private async hydrate(rows: ListRow[]): Promise<TransactionDto[]> {
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
      amount: fromCents(this.cipher.decryptAmount(row.amount, aad.transactionAmount(row.id))),
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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async get(userId: string, transactionId: string): Promise<TransactionDto> {
    const rows = await this.baseSelect().where(
      and(eq(transactions.id, transactionId), eq(transactions.userId, userId), isNull(transactions.deletedAt)),
    );
    const [dto] = await this.hydrate(rows);
    if (!dto) throw errors.notFound("Transação");
    return dto;
  }

  async list(userId: string, query: TransactionListQuery): Promise<{ data: TransactionDto[]; nextCursor: string | null }> {
    const sort = query.sort ?? "date";
    const order = query.order ?? "desc";
    const conditions = this.conditions(userId, query);
    if (sort === "amount") return this.listByAmount(conditions, order, query);
    if (sort === "category") return this.listByCategory(conditions, order, query);

    // Ordenação por data (padrão): paginação por keyset — custo constante por página.
    const direction = order === "desc" ? desc : asc;
    if (query.cursor) {
      const cursor = decodeCursor<DateCursor>(
        query.cursor,
        (value) => typeof value.d === "string" && typeof value.c === "string" && typeof value.i === "string",
      );
      const comparison = order === "desc" ? sql`<` : sql`>`;
      conditions.push(
        sql`(${transactions.date}, ${transactions.createdAt}, ${transactions.id}) ${comparison} (${cursor.d}::date, ${cursor.c}::timestamptz, ${cursor.i}::uuid)`,
      );
    }
    const rows = await this.baseSelect()
      .where(and(...conditions))
      .orderBy(direction(transactions.date), direction(transactions.createdAt), direction(transactions.id))
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > query.limit && last
        ? encodeCursor({ d: last.date, c: last.createdAt.toISOString(), i: last.id })
        : null;
    return { data: await this.hydrate(page), nextCursor };
  }

  private offsetFrom(cursor: string | undefined): number {
    if (!cursor) return 0;
    return decodeCursor<OffsetCursor>(
      cursor,
      (value) => typeof value.o === "number" && Number.isInteger(value.o) && value.o >= 0,
    ).o;
  }

  /**
   * Ordenação por valor (R70). Os valores são cifrados (R81), então a ordenação acontece
   * na aplicação sobre o conjunto já filtrado do usuário; só a página é hidratada.
   */
  private async listByAmount(conditions: SQL[], order: "asc" | "desc", query: TransactionListQuery) {
    const offset = this.offsetFrom(query.cursor);
    const candidates = await this.db
      .select({ id: transactions.id, amount: transactions.amount, date: transactions.date, createdAt: transactions.createdAt })
      .from(transactions)
      .where(and(...conditions));
    const sorted = candidates
      .map((row) => ({ ...row, cents: this.cipher.decryptAmount(row.amount, aad.transactionAmount(row.id)) }))
      .sort((a, b) => {
        const byAmount = order === "asc" ? a.cents - b.cents : b.cents - a.cents;
        if (byAmount !== 0) return byAmount;
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1);
      });
    const pageIds = sorted.slice(offset, offset + query.limit).map((row) => row.id);
    const rows = pageIds.length ? await this.baseSelect().where(inArray(transactions.id, pageIds)) : [];
    const position = new Map(pageIds.map((id, index) => [id, index]));
    rows.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
    const nextOffset = offset + query.limit;
    return {
      data: await this.hydrate(rows),
      nextCursor: nextOffset < sorted.length ? encodeCursor({ o: nextOffset }) : null,
    };
  }

  private async listByCategory(conditions: SQL[], order: "asc" | "desc", query: TransactionListQuery) {
    const offset = this.offsetFrom(query.cursor);
    const nameOrder = order === "asc" ? asc(sql`lower(${categories.name})`) : desc(sql`lower(${categories.name})`);
    const rows = await this.baseSelect()
      .where(and(...conditions))
      .orderBy(
        asc(sql`${categories.name} is null`),
        nameOrder,
        desc(transactions.date),
        desc(transactions.createdAt),
        desc(transactions.id),
      )
      .limit(query.limit + 1)
      .offset(offset);
    const page = rows.slice(0, query.limit);
    return {
      data: await this.hydrate(page),
      nextCursor: rows.length > query.limit ? encodeCursor({ o: offset + query.limit }) : null,
    };
  }

  /** Totais de receitas e despesas do conjunto filtrado, por moeda (ex.: resumo do mês — R26). */
  async summary(userId: string, filters: TransactionFilters): Promise<{ count: number; totals: CurrencyTotals[] }> {
    const rows = await this.db
      .select({ id: transactions.id, type: transactions.type, amount: transactions.amount, currency: wallets.currency })
      .from(transactions)
      .innerJoin(wallets, eq(wallets.id, transactions.walletId))
      .where(and(...this.conditions(userId, filters)));
    const byCurrency = new Map<string, { income: number; expense: number; count: number }>();
    for (const row of rows) {
      const cents = this.cipher.decryptAmount(row.amount, aad.transactionAmount(row.id));
      const entry = byCurrency.get(row.currency) ?? { income: 0, expense: 0, count: 0 };
      if (row.type === "income") entry.income += cents;
      else entry.expense += cents;
      entry.count += 1;
      byCurrency.set(row.currency, entry);
    }
    return {
      count: rows.length,
      totals: [...byCurrency.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, entry]) => ({
          currency,
          income: fromCents(entry.income),
          expense: fromCents(entry.expense),
          net: fromCents(entry.income - entry.expense),
          count: entry.count,
        })),
    };
  }
}
