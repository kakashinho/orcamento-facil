export const GOAL_STATUSES = ["active", "achieved", "cancelled"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Meta de economia (R15) com o alvo já decifrado, em centavos. */
export interface GoalRecord {
  id: string;
  userId: string;
  name: string;
  categoryId: string;
  targetCents: number;
  currency: string;
  deadline: string;
  status: GoalStatus;
  achievedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalChanges {
  name?: string;
  categoryId?: string;
  targetCents?: number;
  deadline?: string;
  updatedAt: Date;
}

/** Parte de uma receita destinada à meta (R17), na moeda da carteira da receita. */
export interface ContributionRecord {
  id: string;
  goalId: string;
  userId: string;
  transactionId: string;
  amountCents: number;
  createdAt: Date;
}
