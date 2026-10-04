import type { DbTransaction } from "../../../infrastructure/database/client.js";

/** Dados da requisição que o service usa sem depender do Fastify. */
export interface RequestMeta {
  requestId?: string | undefined;
  userAgent?: string | undefined;
}

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  createdAt: Date;
}

/** Chamado na mesma transação do cadastro — o módulo finance cria a carteira padrão. */
export type UserRegisteredHook = (tx: DbTransaction, user: { id: string; primaryCurrency: string }) => Promise<void>;
