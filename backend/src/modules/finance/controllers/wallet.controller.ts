import { requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { walletRouteSchemas } from "../schemas/wallet.schema.js";
import type { WalletService } from "../services/wallet.service.js";

type Schemas = typeof walletRouteSchemas;

export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.wallets.list(requireAuth(request).userId));
  };

  summary = async (request: ZodRequest<Schemas["summary"]>, reply: ZodReply<Schemas["summary"]>) => {
    return reply.send(await this.wallets.summary(requireAuth(request).userId));
  };

  create = async (request: ZodRequest<Schemas["create"]>, reply: ZodReply<Schemas["create"]>) => {
    return reply.status(201).send(await this.wallets.create(requireAuth(request).userId, request.body));
  };

  get = async (request: ZodRequest<Schemas["get"]>, reply: ZodReply<Schemas["get"]>) => {
    return reply.send(await this.wallets.get(requireAuth(request).userId, request.params.id));
  };

  update = async (request: ZodRequest<Schemas["update"]>, reply: ZodReply<Schemas["update"]>) => {
    return reply.send(await this.wallets.update(requireAuth(request).userId, request.params.id, request.body));
  };

  remove = async (request: ZodRequest<Schemas["remove"]>, reply: ZodReply<Schemas["remove"]>) => {
    await this.wallets.delete(requireAuth(request).userId, request.params.id);
    return reply.status(204).send();
  };
}
