import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { exchangeRateRouteSchemas } from "../schemas/exchange-rate.schema.js";
import type { ExchangeRateService } from "../services/exchange-rate.service.js";

type Schemas = typeof exchangeRateRouteSchemas;

export class ExchangeRateController {
  constructor(private readonly exchangeRates: ExchangeRateService) {}

  rates = async (request: ZodRequest<Schemas["rates"]>, reply: ZodReply<Schemas["rates"]>) => {
    return reply.send(await this.exchangeRates.getRates(request.query.base, request.query.symbols?.split(",")));
  };

  convert = async (request: ZodRequest<Schemas["convert"]>, reply: ZodReply<Schemas["convert"]>) => {
    const { amount, from, to } = request.query;
    return reply.send(await this.exchangeRates.convertAmount(amount, from, to));
  };
}
