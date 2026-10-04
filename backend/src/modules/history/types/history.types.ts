import type { DbTransaction } from "../../../infrastructure/database/client.js";

export const HISTORY_ACTIONS = [
  "transaction.create",
  "transaction.update",
  "transaction.delete",
  "transaction.archive",
  "transaction.unarchive",
  "transaction.bulk_archive",
  "transfer.create",
  "transfer.delete",
] as const;

export type HistoryAction = (typeof HISTORY_ACTIONS)[number];
export type HistoryEntityType = "transaction" | "transfer";

/** Texto da ação para a tela de histórico e o botão "Desfazer". */
export const HISTORY_LABELS: Record<HistoryAction, string> = {
  "transaction.create": "Transação registrada",
  "transaction.update": "Transação editada",
  "transaction.delete": "Transação excluída",
  "transaction.archive": "Transação arquivada",
  "transaction.unarchive": "Transação desarquivada",
  "transaction.bulk_archive": "Transações antigas arquivadas",
  "transfer.create": "Transferência realizada",
  "transfer.delete": "Transferência excluída",
};

export interface NewHistoryEntry {
  id: string;
  userId: string;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  payload: unknown;
  createdAt: Date;
}

export interface HistoryEntryRecord {
  id: string;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  createdAt: Date;
  undoneAt: Date | null;
}

/** Entrada mais recente ainda não desfeita, com o snapshot já decifrado. */
export interface ClaimedEntry {
  id: string;
  action: HistoryAction;
  entityType: HistoryEntityType;
  entityId: string | null;
  createdAt: Date;
  payload: Record<string, unknown>;
}

/**
 * Reversão de uma ação. Cada handler é fornecido pelo módulo dono do dado (finance), e o
 * history só os orquestra — assim o history não depende do finance.
 */
export type UndoHandler = (tx: DbTransaction, userId: string, payload: Record<string, unknown>) => Promise<void>;
export type UndoHandlers = Record<HistoryAction, UndoHandler>;

/** Código de erro para reversões impossíveis (dados de origem não existem mais). */
export const UNDO_NOT_POSSIBLE = "UNDO_NOT_POSSIBLE";
