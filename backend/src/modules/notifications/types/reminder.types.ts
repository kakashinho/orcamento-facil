export const REMINDER_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type ReminderFrequency = (typeof REMINDER_FREQUENCIES)[number];

/** Lembrete de conta fixa (R34), com o valor opcional decifrado (centavos). */
export interface ReminderRecord {
  id: string;
  userId: string;
  title: string;
  amountCents: number | null;
  currency: string | null;
  frequency: ReminderFrequency;
  /** Dia original do vencimento: 31 cai no último dia dos meses curtos (D-12). */
  anchorDay: number;
  nextDueDate: string;
  seriesId: string | null;
  active: boolean;
  lastNotifiedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReminderChanges = Partial<
  Pick<ReminderRecord, "title" | "amountCents" | "currency" | "frequency" | "anchorDay" | "nextDueDate" | "active" | "lastNotifiedOn">
> & { updatedAt: Date };

/** Hora local do aviso de vencimento (D-63). */
export const BILL_REMINDER_HOUR = 9;
