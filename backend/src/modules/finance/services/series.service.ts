import { randomUUID } from "node:crypto";
import type { Clock } from "../../../infrastructure/clock.js";
import type { DbTransaction, TransactionRunner } from "../../../infrastructure/database/client.js";
import type { DomainEvents } from "../../../infrastructure/events/domain-events.js";
import type { EventLogger } from "../../../infrastructure/logging/event-logger.js";
import { AppError, errors } from "../../../shared/errors/app-error.js";
import { addDays, todayInTimeZone } from "../../../shared/utils/dates.js";
import { fromCents, toCents } from "../../../shared/utils/money.js";
import type { UserService } from "../../auth/services/user.service.js";
import type { ActionHistoryService } from "../../history/services/action-history.service.js";
import { UNDO_NOT_POSSIBLE } from "../../history/types/history.types.js";
import type { SeriesRepository } from "../repositories/series.repository.js";
import type {
  CreateInstallmentsRequestDto,
  CreateRecurringRequestDto,
  CreateSeriesResponseDto,
  ListSeriesQueryDto,
  MarkRecurringRequestDto,
  SeriesDetailResponseDto,
  SeriesListResponseDto,
  SeriesResponseDto,
  UpdateSeriesRequestDto,
} from "../schemas/series.schema.js";
import type { PlannedOccurrence, SeriesChanges, SeriesRecord, SeriesStatus } from "../types/series.types.js";
import type { TransactionState } from "../types/transaction.types.js";
import type { CategoryService } from "./category.service.js";
import { advance, installmentCents, occurrenceAmount } from "./series-rules.js";
import type { TagService } from "./tag.service.js";
import type { TransactionService } from "./transaction.service.js";
import type { WalletService } from "./wallet.service.js";

/** Ocorrências vencidas geradas de uma vez, por série e por execução. */
const MAX_CATCH_UP = 12;
const DUE_BATCH = 200;

export interface SeriesServiceDeps {
  series: SeriesRepository;
  transactions: TransactionService;
  wallets: WalletService;
  categories: CategoryService;
  tags: TagService;
  history: ActionHistoryService;
  users: UserService;
  runner: TransactionRunner;
  clock: Clock;
  eventLog: EventLogger;
  events?: DomainEvents;
}

/** Snapshot do desfazer de `series.update`/`series.cancel`: os campos que podem mudar. */
type SeriesSnapshot = Pick<SeriesRecord, "walletId" | "categoryId" | "description" | "amountCents" | "endDate" | "nextDate" | "status">;

function snapshotOf(series: SeriesRecord): SeriesSnapshot {
  return {
    walletId: series.walletId,
    categoryId: series.categoryId,
    description: series.description,
    amountCents: series.amountCents,
    endDate: series.endDate,
    nextDate: series.nextDate,
    status: series.status,
  };
}

/**
 * Recorrências (R37) e parcelamentos (R62) como séries geradas na data. A série
 * guarda o plano; cada ocorrência vira transação real pelo `TransactionService` quando a data
 * chega (na criação, se já venceu; depois, pela tarefa agendada), então saldo, cifragem, tags e
 * categoria seguem as regras de sempre.
 */
export class SeriesService {
  constructor(private readonly deps: SeriesServiceDeps) {}

  private async today(userId: string): Promise<string> {
    const { timezone } = await this.deps.users.getPreferences(userId);
    return todayInTimeZone(this.deps.clock.now(), timezone);
  }

  private changed(userId: string, walletIds: string[], origin: "user" | "system"): void {
    this.deps.events?.publish({ type: "finance.changed", userId, cause: "series.generated", walletIds, origin });
  }

  /** Datas aceitas: entre 1 ano atrás e 1 ano à frente. */
  private assertDateWindow(date: string, today: string): void {
    if (date < addDays(today, -366) || date > addDays(today, 366)) {
      throw errors.unprocessable("DATE_OUT_OF_RANGE", "Use uma data entre 1 ano atrás e 1 ano à frente.", "date");
    }
  }

  private assertEndDate(endDate: string | undefined | null, startDate: string): void {
    if (endDate && endDate < startDate) {
      throw errors.unprocessable("INVALID_END_DATE", "A data final deve ser igual ou posterior à primeira ocorrência.", "endDate");
    }
  }

  private newSeries(
    userId: string,
    state: TransactionState,
    shape: Pick<SeriesRecord, "kind" | "frequency" | "amountCents" | "installments" | "startDate" | "endDate">,
  ): SeriesRecord {
    const now = this.deps.clock.now();
    return {
      id: randomUUID(),
      userId,
      type: state.type,
      walletId: state.walletId,
      categoryId: state.categoryId,
      description: state.description,
      tagIds: state.tagIds,
      anchorDay: Number(shape.startDate.slice(8, 10)),
      nextDate: shape.startDate,
      generatedCount: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
      ...shape,
    };
  }

  /**
   * Gera as ocorrências vencidas até `today` (no máximo `MAX_CATCH_UP`), dentro da transação de
   * banco aberta, e grava o novo estado da série. A 1ª ocorrência pode levar a nota informada.
   */
  private async generateDue(
    tx: DbTransaction,
    series: SeriesRecord,
    today: string,
    firstNotes: string | null = null,
  ): Promise<{ transactionIds: string[]; series: SeriesRecord }> {
    const { transactions, categories, tags, clock } = this.deps;
    const transactionIds: string[] = [];
    let current = { ...series };
    while (current.status === "active" && current.nextDate !== null && current.nextDate <= today && transactionIds.length < MAX_CATCH_UP) {
      const index = current.generatedCount;
      // Categoria excluída ou tag apagada depois de criar a série: a ocorrência sai sem elas.
      const categoryId =
        current.categoryId && (await categories.findAssignable(current.userId, current.categoryId, tx)) ? current.categoryId : null;
      const state: TransactionState = {
        walletId: current.walletId,
        type: current.type,
        amountCents: occurrenceAmount(current, index),
        date: current.nextDate,
        description: current.description,
        notes: index === 0 ? firstNotes : null,
        categoryId,
        archived: false,
        tagIds: await tags.filterExisting(tx, current.userId, current.tagIds),
      };
      transactionIds.push(await transactions.insertPrepared(tx, current.userId, state, { seriesId: current.id, occurrence: index + 1 }));
      const generatedCount = index + 1;
      current = { ...current, generatedCount, ...advance(current, generatedCount) };
    }
    if (transactionIds.length > 0) {
      await this.deps.series.update(
        current.id,
        { generatedCount: current.generatedCount, nextDate: current.nextDate, status: current.status, updatedAt: clock.now() },
        tx,
      );
    }
    return { transactionIds, series: current };
  }

  private async respond(userId: string, seriesId: string, transactionIds: string[]): Promise<CreateSeriesResponseDto> {
    return {
      series: await this.get(userId, seriesId).then(({ occurrences: _, ...series }) => series),
      transactions: await this.deps.transactions.getMany(userId, transactionIds),
    };
  }

  /** R37: transação nova já recorrente. */
  async createRecurring(userId: string, input: CreateRecurringRequestDto): Promise<CreateSeriesResponseDto> {
    const { transactions, history, runner } = this.deps;
    const { frequency, endDate, ...transaction } = input;
    const today = await this.today(userId);
    const startDate = transaction.date ?? today;
    this.assertDateWindow(startDate, today);
    this.assertEndDate(endDate, startDate);

    const result = await runner.run(async (tx) => {
      const state = await transactions.prepareState(tx, userId, { ...transaction, date: startDate });
      const series = this.newSeries(userId, state, {
        kind: "recurring",
        frequency,
        amountCents: state.amountCents,
        installments: null,
        startDate,
        endDate: endDate ?? null,
      });
      await this.deps.series.insert(series, tx);
      const generated = await this.generateDue(tx, series, today, state.notes);
      await history.record(tx, userId, "series.create", "series", series.id, {
        seriesId: series.id,
        transactionIds: generated.transactionIds,
      });
      return { series, transactionIds: generated.transactionIds };
    });
    if (result.transactionIds.length > 0) this.changed(userId, [result.series.walletId], "user");
    return this.respond(userId, result.series.id, result.transactionIds);
  }

  /** R37: a transação existente vira a 1ª ocorrência; as vencidas depois dela são geradas. */
  async markRecurring(userId: string, transactionId: string, input: MarkRecurringRequestDto): Promise<CreateSeriesResponseDto> {
    const { transactions, history, runner } = this.deps;
    const today = await this.today(userId);
    const result = await runner.run(async (tx) => {
      const record = await transactions.lockForSeries(tx, userId, transactionId);
      if (record.seriesId !== null) {
        throw errors.conflict("TRANSACTION_ALREADY_IN_SERIES", "Esta transação já faz parte de uma recorrência ou parcelamento.");
      }
      if (record.date < addDays(today, -366)) {
        throw errors.unprocessable(
          "TRANSACTION_TOO_OLD",
          "Só é possível marcar como recorrente uma transação dos últimos 12 meses.",
        );
      }
      this.assertEndDate(input.endDate, record.date);
      const series: SeriesRecord = {
        ...this.newSeries(userId, record, {
          kind: "recurring",
          frequency: input.frequency,
          amountCents: record.amountCents,
          installments: null,
          startDate: record.date,
          endDate: input.endDate ?? null,
        }),
        generatedCount: 1,
      };
      Object.assign(series, advance(series, 1));
      await this.deps.series.insert(series, tx);
      await transactions.linkToSeries(tx, record.id, { seriesId: series.id, occurrence: 1 });
      const generated = await this.generateDue(tx, series, today);
      await history.record(tx, userId, "series.create", "series", series.id, {
        seriesId: series.id,
        transactionIds: generated.transactionIds,
        linkedTransactionId: record.id,
      });
      return { series, transactionIds: generated.transactionIds };
    });
    if (result.transactionIds.length > 0) this.changed(userId, [result.series.walletId], "user");
    return this.respond(userId, result.series.id, [transactionId, ...result.transactionIds]);
  }

  /** R62: despesa parcelada; cada parcela entra no saldo na data dela. */
  async createInstallments(userId: string, input: CreateInstallmentsRequestDto): Promise<CreateSeriesResponseDto> {
    const { transactions, history, runner } = this.deps;
    const today = await this.today(userId);
    this.assertDateWindow(input.date, today);
    const totalCents = toCents(input.totalAmount, "totalAmount");
    if (installmentCents(totalCents, input.installments, input.installments - 1) <= 0) {
      throw errors.invalidField("totalAmount", "O valor total é pequeno demais para esse número de parcelas.");
    }

    const result = await runner.run(async (tx) => {
      const state = await transactions.prepareState(tx, userId, {
        type: "expense",
        amount: input.totalAmount,
        description: input.description,
        date: input.date,
        walletId: input.walletId,
        categoryId: input.categoryId,
        tags: input.tags,
        notes: input.notes,
      });
      const series = this.newSeries(userId, state, {
        kind: "installment",
        frequency: "monthly",
        amountCents: totalCents,
        installments: input.installments,
        startDate: input.date,
        endDate: null,
      });
      await this.deps.series.insert(series, tx);
      const generated = await this.generateDue(tx, series, today, state.notes);
      await history.record(tx, userId, "series.create", "series", series.id, {
        seriesId: series.id,
        transactionIds: generated.transactionIds,
      });
      return { series, transactionIds: generated.transactionIds };
    });
    if (result.transactionIds.length > 0) this.changed(userId, [result.series.walletId], "user");
    return this.respond(userId, result.series.id, result.transactionIds);
  }

  // ---------------------------------------------------------------- consulta

  private async toDtos(userId: string, list: SeriesRecord[]): Promise<SeriesResponseDto[]> {
    const wallets = new Map((await this.deps.wallets.listForReports(userId)).map((wallet) => [wallet.id, wallet]));
    const categories = new Map((await this.deps.categories.list(userId)).data.map((category) => [category.id, category.name]));
    return list.map((series) => {
      const wallet = wallets.get(series.walletId);
      const categoryName = series.categoryId ? categories.get(series.categoryId) : undefined;
      return {
        id: series.id,
        kind: series.kind,
        type: series.type,
        frequency: series.frequency,
        description: series.description,
        wallet: { id: series.walletId, name: wallet?.name ?? "", currency: wallet?.currency ?? "" },
        category: series.categoryId && categoryName ? { id: series.categoryId, name: categoryName } : null,
        amount: fromCents(series.kind === "installment" ? installmentCents(series.amountCents, series.installments!, 1) : series.amountCents),
        totalAmount: series.kind === "installment" ? fromCents(series.amountCents) : null,
        installments: series.installments,
        startDate: series.startDate,
        endDate: series.endDate,
        nextDate: series.nextDate,
        generatedCount: series.generatedCount,
        remaining: series.kind === "installment" ? series.installments! - series.generatedCount : null,
        status: series.status,
        createdAt: series.createdAt.toISOString(),
      };
    });
  }

  async list(userId: string, query: ListSeriesQueryDto): Promise<SeriesListResponseDto> {
    const statuses: SeriesStatus[] = query.status === "all" ? ["active", "ended", "cancelled"] : [query.status];
    return { data: await this.toDtos(userId, await this.deps.series.list(userId, statuses)) };
  }

  async get(userId: string, seriesId: string): Promise<SeriesDetailResponseDto> {
    const series = await this.deps.series.findOwned(userId, seriesId);
    if (!series) throw errors.notFound("Série");
    const [dto] = await this.toDtos(userId, [series]);
    const occurrences = await this.deps.transactions.listBySeries(userId, seriesId);
    return {
      ...dto!,
      occurrences: occurrences.map((item) => ({
        occurrence: item.occurrence,
        transactionId: item.id,
        date: item.date,
        amount: fromCents(item.amountCents),
      })),
    };
  }

  /** R63: ocorrências ainda não geradas das séries ativas, até `untilDate`. */
  async listForProjection(userId: string, untilDate: string): Promise<PlannedOccurrence[]> {
    const planned: PlannedOccurrence[] = [];
    for (const series of await this.deps.series.list(userId, ["active"])) {
      let index = series.generatedCount;
      let date = series.nextDate;
      while (date !== null && date <= untilDate) {
        planned.push({
          seriesId: series.id,
          description: series.description,
          kind: series.kind,
          type: series.type,
          date,
          amountCents: occurrenceAmount(series, index),
          walletId: series.walletId,
        });
        index += 1;
        date = advance(series, index).nextDate;
      }
    }
    return planned.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  }

  // ---------------------------------------------------------------- alteração

  private notActive(): never {
    throw errors.conflict("SERIES_NOT_ACTIVE", "Esta recorrência ou parcelamento já foi encerrado ou cancelado.");
  }

  /** Muda só as próximas ocorrências; as já geradas são transações normais. */
  async update(userId: string, seriesId: string, input: UpdateSeriesRequestDto): Promise<SeriesResponseDto> {
    const { series: repository, wallets, categories, history, runner, clock } = this.deps;
    await runner.run(async (tx) => {
      const series = await repository.findOwned(userId, seriesId, tx, true);
      if (!series) throw errors.notFound("Série");
      if (series.status !== "active") this.notActive();
      if (series.kind === "installment" && (input.amount !== undefined || input.endDate !== undefined)) {
        throw errors.invalidField(
          input.amount !== undefined ? "amount" : "endDate",
          "O valor e a data final de um parcelamento não podem ser alterados. Cancele e registre de novo.",
        );
      }
      const changes: SeriesChanges = { updatedAt: clock.now() };
      if (input.amount !== undefined) changes.amountCents = toCents(input.amount);
      if (input.description !== undefined) changes.description = input.description;
      if (input.walletId !== undefined) {
        const wallet = await wallets.findOwned(userId, input.walletId, tx);
        if (!wallet) throw errors.unprocessable("INVALID_WALLET", "Carteira inexistente.", "walletId");
        changes.walletId = wallet.id;
      }
      if (input.categoryId !== undefined) {
        if (input.categoryId !== null) {
          const category = await categories.assertAssignable(userId, input.categoryId, tx);
          categories.assertAcceptsType(category, series.type);
        }
        changes.categoryId = input.categoryId;
      }
      if (input.endDate !== undefined) {
        this.assertEndDate(input.endDate, series.startDate);
        changes.endDate = input.endDate;
        Object.assign(changes, advance({ ...series, endDate: input.endDate }, series.generatedCount));
      }
      await repository.update(series.id, changes, tx);
      await history.record(tx, userId, "series.update", "series", series.id, { seriesId: series.id, before: snapshotOf(series) });
    });
    const [dto] = await this.toDtos(userId, [(await repository.findOwned(userId, seriesId))!]);
    return dto!;
  }

  async cancel(userId: string, seriesId: string): Promise<void> {
    const { series: repository, history, runner, clock } = this.deps;
    await runner.run(async (tx) => {
      const series = await repository.findOwned(userId, seriesId, tx, true);
      if (!series) throw errors.notFound("Série");
      if (series.status !== "active") this.notActive();
      await repository.update(series.id, { status: "cancelled", nextDate: null, updatedAt: clock.now() }, tx);
      await history.record(tx, userId, "series.cancel", "series", series.id, { seriesId: series.id, before: snapshotOf(series) });
    });
  }

  // ---------------------------------------------------------------- reversões do "desfazer" (R49)

  /** Desfaz a criação: cancela a série, exclui as ocorrências criadas junto e desliga a transação marcada. */
  async revertCreate(tx: DbTransaction, userId: string, payload: Record<string, unknown>): Promise<void> {
    const seriesId = String(payload.seriesId);
    const series = await this.deps.series.findOwned(userId, seriesId, tx, true);
    if (series) await this.deps.series.update(seriesId, { status: "cancelled", nextDate: null, updatedAt: this.deps.clock.now() }, tx);
    for (const transactionId of (payload.transactionIds as string[] | undefined) ?? []) {
      await this.deps.transactions.revertCreate(tx, userId, transactionId);
    }
    if (typeof payload.linkedTransactionId === "string") {
      await this.deps.transactions.linkToSeries(tx, payload.linkedTransactionId, null);
    }
  }

  /** Desfaz a alteração ou o cancelamento: volta o plano ao estado anterior (o gerador recupera o atraso). */
  async revertChange(tx: DbTransaction, userId: string, payload: Record<string, unknown>): Promise<void> {
    const seriesId = String(payload.seriesId);
    const series = await this.deps.series.findOwned(userId, seriesId, tx, true);
    if (!series) throw new AppError(409, UNDO_NOT_POSSIBLE, "A série não existe mais.");
    const before = payload.before as SeriesSnapshot;
    if (!(await this.deps.wallets.findOwned(userId, before.walletId, tx))) {
      throw new AppError(409, UNDO_NOT_POSSIBLE, "A carteira original da série não existe mais.");
    }
    await this.deps.series.update(seriesId, { ...before, updatedAt: this.deps.clock.now() }, tx);
  }

  // ---------------------------------------------------------------- geração agendada

  /**
   * Tarefa `finance.series`: gera as ocorrências vencidas de todas as séries ativas, no fuso de
   * cada dono. Idempotente (índice único por ocorrência); falha numa série não para as outras.
   */
  async generateAllDue(now: Date): Promise<{ processed: number }> {
    const { series: repository, users, runner, eventLog } = this.deps;
    const maxDate = addDays(now.toISOString().slice(0, 10), 1);
    const timezones = new Map<string, string>();
    let processed = 0;
    let afterId: string | undefined;
    for (;;) {
      const batch = await repository.listDueCandidates(maxDate, DUE_BATCH, afterId);
      if (batch.length === 0) break;
      afterId = batch[batch.length - 1]!.id;
      for (const candidate of batch) {
        try {
          if (!timezones.has(candidate.userId)) {
            timezones.set(candidate.userId, (await users.getPreferences(candidate.userId)).timezone);
          }
          const today = todayInTimeZone(now, timezones.get(candidate.userId)!);
          const result = await runner.run(async (tx) => {
            const series = await repository.findOwned(candidate.userId, candidate.id, tx, true);
            if (!series || series.status !== "active") return { transactionIds: [] as string[], walletId: "" };
            const generated = await this.generateDue(tx, series, today);
            return { transactionIds: generated.transactionIds, walletId: series.walletId };
          });
          if (result.transactionIds.length > 0) {
            processed += result.transactionIds.length;
            this.changed(candidate.userId, [result.walletId], "system");
          }
        } catch (error) {
          eventLog.record("finance.series_generation_failed", {
            level: "error",
            userId: candidate.userId,
            message: error instanceof Error ? error.message : String(error),
            context: { seriesId: candidate.id },
          });
        }
      }
      if (batch.length < DUE_BATCH) break;
    }
    return { processed };
  }
}
