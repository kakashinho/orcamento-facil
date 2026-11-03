import { and, asc, eq, lte } from "drizzle-orm";
import { aad, type FieldCipher } from "../../../infrastructure/crypto/field-cipher.js";
import type { Database } from "../../../infrastructure/database/client.js";
import { Repository } from "../../../infrastructure/database/repository.js";
import { reminders } from "../../../infrastructure/database/schema.js";
import type { ReminderChanges, ReminderFrequency, ReminderRecord } from "../types/reminder.types.js";

type ReminderRow = typeof reminders.$inferSelect;

/** Lembretes de contas fixas (R34). O valor opcional é cifrado (R81). */
export class ReminderRepository extends Repository {
  constructor(
    db: Database,
    private readonly cipher: FieldCipher,
  ) {
    super(db);
  }

  private toRecord(row: ReminderRow): ReminderRecord {
    return {
      id: row.id,
      userId: row.userId,
      title: row.title,
      amountCents: row.amount === null ? null : this.cipher.decryptAmount(row.amount, aad.reminderAmount(row.id)),
      currency: row.currency,
      frequency: row.frequency as ReminderFrequency,
      anchorDay: row.anchorDay,
      nextDueDate: row.nextDueDate,
      seriesId: row.seriesId,
      active: row.active,
      lastNotifiedOn: row.lastNotifiedOn,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async insert(record: ReminderRecord): Promise<void> {
    await this.db.insert(reminders).values({
      id: record.id,
      userId: record.userId,
      title: record.title,
      amount: record.amountCents === null ? null : this.cipher.encryptAmount(record.amountCents, aad.reminderAmount(record.id)),
      currency: record.currency,
      frequency: record.frequency,
      anchorDay: record.anchorDay,
      nextDueDate: record.nextDueDate,
      seriesId: record.seriesId,
      active: record.active,
      lastNotifiedOn: record.lastNotifiedOn,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  async findOwned(userId: string, reminderId: string): Promise<ReminderRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
    return row ? this.toRecord(row) : undefined;
  }

  async list(userId: string): Promise<ReminderRecord[]> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(eq(reminders.userId, userId))
      .orderBy(asc(reminders.nextDueDate), asc(reminders.createdAt));
    return rows.map((row) => this.toRecord(row));
  }

  /** Lembretes ativos com vencimento até `maxDate` (o fuso de cada dono é conferido no service). */
  async listDue(maxDate: string): Promise<ReminderRecord[]> {
    const rows = await this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.active, true), lte(reminders.nextDueDate, maxDate)))
      .orderBy(asc(reminders.nextDueDate));
    return rows.map((row) => this.toRecord(row));
  }

  async update(reminderId: string, changes: ReminderChanges): Promise<void> {
    const { amountCents, ...plain } = changes;
    await this.db
      .update(reminders)
      .set({
        ...plain,
        ...(amountCents === undefined
          ? {}
          : { amount: amountCents === null ? null : this.cipher.encryptAmount(amountCents, aad.reminderAmount(reminderId)) }),
      })
      .where(eq(reminders.id, reminderId));
  }

  async delete(userId: string, reminderId: string): Promise<boolean> {
    const result = await this.db.delete(reminders).where(and(eq(reminders.id, reminderId), eq(reminders.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
}
