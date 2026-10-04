import { requestMeta, requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { biometricRouteSchemas } from "../schemas/biometric.schema.js";
import type { BiometricAuthService } from "../services/biometric-auth.service.js";

type Schemas = typeof biometricRouteSchemas;

/** Login por biometria (R40): cadastro do aparelho, desafio e login por assinatura. */
export class BiometricController {
  constructor(private readonly biometrics: BiometricAuthService) {}

  enroll = async (request: ZodRequest<Schemas["enroll"]>, reply: ZodReply<Schemas["enroll"]>) => {
    const credential = await this.biometrics.enroll(requireAuth(request).userId, request.body, requestMeta(request));
    return reply.status(201).send(credential);
  };

  list = async (request: ZodRequest<Schemas["list"]>, reply: ZodReply<Schemas["list"]>) => {
    return reply.send(await this.biometrics.list(requireAuth(request).userId));
  };

  revoke = async (request: ZodRequest<Schemas["revoke"]>, reply: ZodReply<Schemas["revoke"]>) => {
    await this.biometrics.revoke(requireAuth(request).userId, request.params.id, requestMeta(request));
    return reply.status(204).send();
  };

  challenge = async (request: ZodRequest<Schemas["challenge"]>, reply: ZodReply<Schemas["challenge"]>) => {
    return reply.send(await this.biometrics.createChallenge(request.body.credentialId));
  };

  login = async (request: ZodRequest<Schemas["login"]>, reply: ZodReply<Schemas["login"]>) => {
    return reply.send(await this.biometrics.login(request.body, requestMeta(request)));
  };
}
