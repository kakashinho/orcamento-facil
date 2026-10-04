import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { transferRouteSchemas } from "../schemas/transfer.schema.js";
import type { TransferService } from "../services/transfer.service.js";

type Schemas = typeof transferRouteSchemas;

export class TransferController {
  constructor(private readonly transfers: TransferService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.transfers.list(requireAuth(request).userId, request.query));
  };

  /** 201 quando cria; 200 quando a mesma Idempotency-Key já tinha criado a transferência. */
  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    const result = await this.transfers.create(
      requireAuth(request).userId,
      request.body,
      request.headers["idempotency-key"],
    );
    return reply.status(result.created ? 201 : 200).send(result.transfer);
  };

  get = async (request: ZodRequest<Schemas["get"]>, reply: ZodReply<Schemas["get"]>) => {
    return reply.send(await this.transfers.get(requireAuth(request).userId, request.params.id));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.transfers.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
