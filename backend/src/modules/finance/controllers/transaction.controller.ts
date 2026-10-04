import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { transactionRouteSchemas } from "../schemas/transaction.schema.js";
import type { TransactionService } from "../services/transaction.service.js";

type Schemas = typeof transactionRouteSchemas;

export class TransactionController {
  constructor(private readonly transactions: TransactionService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.transactions.list(requireAuth(request).userId, request.query));
  };

  summary = async (request: ZodRequest<Schemas["summary"]>, reply: ZodReply<Schemas["summary"]>) => {
    return reply.send(await this.transactions.summary(requireAuth(request).userId, request.query));
  };

  months = async (request: ZodRequest<Schemas["months"]>, reply: ZodReply<Schemas["months"]>) => {
    return reply.send(await this.transactions.months(requireAuth(request).userId, request.query));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.transactions.create(requireAuth(request).userId, request.body));
  };

  parse = async (request: ZodRequest<Schemas["parse"]>, reply: ZodReply<Schemas["parse"]>) => {
    return reply.send(await this.transactions.parse(requireAuth(request).userId, request.body.text));
  };

  archiveBefore = async (request: ZodRequest<Schemas["archiveBefore"]>, reply: ZodReply<Schemas["archiveBefore"]>) => {
    return reply.send(await this.transactions.archiveBefore(requireAuth(request).userId, request.body.before));
  };

  get = async (request: ZodRequest<Schemas["get"]>, reply: ZodReply<Schemas["get"]>) => {
    return reply.send(await this.transactions.get(requireAuth(request).userId, request.params.id));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.transactions.update(requireAuth(request).userId, request.params.id, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.transactions.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };

  duplicate = async (request: ZodRequest<Schemas["duplicate"]>, reply: ZodReply<Schemas["duplicate"]>) => {
    const copy = await this.transactions.duplicate(requireAuth(request).userId, request.params.id, request.body);
    return reply.status(201).send(copy);
  };

  archive = async (request: ZodRequest<Schemas["archive"]>, reply: ZodReply<Schemas["archive"]>) => {
    return reply.send(await this.transactions.setArchived(requireAuth(request).userId, request.params.id, true));
  };

  unarchive = async (request: ZodRequest<Schemas["unarchive"]>, reply: ZodReply<Schemas["unarchive"]>) => {
    return reply.send(await this.transactions.setArchived(requireAuth(request).userId, request.params.id, false));
  };
}
