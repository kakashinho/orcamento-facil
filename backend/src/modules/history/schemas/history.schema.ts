import type { FastifySchema } from "fastify";
import { z } from "zod";
import { limitQuery, responseId, responseTimestamp, secured } from "../../../infrastructure/http/common-schemas.js";
import { HISTORY_ACTIONS } from "../types/history.types.js";

const TAGS = ["Histórico"];

// ---------- Request DTOs ----------

export const listHistoryQuerySchema = z.strictObject({ limit: limitQuery(50, 20) });
export type ListHistoryQueryDto = z.infer<typeof listHistoryQuerySchema>;

// ---------- Response DTOs ----------

const historyEntrySchema = z.object({
  id: responseId,
  action: z.enum(HISTORY_ACTIONS),
  label: z.string().meta({ description: "Texto da ação para exibir ao usuário", example: "Transação excluída" }),
  entityType: z.enum(["transaction", "transfer"]),
  entityId: responseId.nullable(),
  createdAt: responseTimestamp,
});

export const historyEntryResponseSchema = historyEntrySchema.extend({
  undoneAt: responseTimestamp.nullable(),
  undoable: z.boolean().meta({ description: "Ainda pode ser desfeita (não desfeita e dentro da janela)" }),
});
export type HistoryEntryResponseDto = z.infer<typeof historyEntryResponseSchema>;

export const historyListResponseSchema = z.object({ data: z.array(historyEntryResponseSchema) });
export type HistoryListResponseDto = z.infer<typeof historyListResponseSchema>;

export const undoResponseSchema = z.object({ undone: historyEntrySchema, message: z.string() });
export type UndoResponseDto = z.infer<typeof undoResponseSchema>;

// ---------- Schemas das rotas (validação + documentação) ----------

export const historyRouteSchemas = {
  list: {
    tags: TAGS,
    summary: "Últimas ações do usuário",
    description:
      "Ações desfazíveis: criação, edição, exclusão e arquivamento de transações; criação e exclusão de transferências.",
    security: secured,
    querystring: listHistoryQuerySchema,
    response: { 200: historyListResponseSchema },
  },
  undo: {
    tags: TAGS,
    summary: "Desfazer a última ação (R49)",
    description:
      "Reverte a ação mais recente ainda não desfeita, recompondo saldos. Chamadas seguidas desfazem as ações anteriores. 404 NOTHING_TO_UNDO quando não há o que desfazer; 409 UNDO_NOT_POSSIBLE quando os dados de origem não existem mais.",
    security: secured,
    response: { 200: undoResponseSchema },
  },
} satisfies Record<string, FastifySchema>;
