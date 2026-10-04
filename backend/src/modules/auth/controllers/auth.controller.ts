import { requestMeta, requireAuth } from "../../../infrastructure/http/request-context.js";
import type { ZodReply, ZodRequest } from "../../../infrastructure/http/types.js";
import type { authRouteSchemas } from "../schemas/auth.schema.js";
import type { AuthService } from "../services/auth.service.js";

type Schemas = typeof authRouteSchemas;

/** Traduz HTTP ↔ AuthService: lê o DTO validado, chama o service e define o status. */
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register = async (request: ZodRequest<Schemas["register"]>, reply: ZodReply<Schemas["register"]>) => {
    const result = await this.auth.register(request.body, requestMeta(request));
    return reply.status(201).send(result);
  };

  login = async (request: ZodRequest<Schemas["login"]>, reply: ZodReply<Schemas["login"]>) => {
    const result = await this.auth.login(request.body, requestMeta(request));
    return reply.status(200).send(result);
  };

  refresh = async (request: ZodRequest<Schemas["refresh"]>, reply: ZodReply<Schemas["refresh"]>) => {
    const tokens = await this.auth.refresh(request.body.refreshToken, requestMeta(request));
    return reply.status(200).send(tokens);
  };

  logout = async (request: ZodRequest<Schemas["logout"]>, reply: ZodReply<Schemas["logout"]>) => {
    await this.auth.logout(request.body.refreshToken);
    return reply.status(204).send();
  };

  logoutAll = async (request: ZodRequest<Schemas["logoutAll"]>, reply: ZodReply<Schemas["logoutAll"]>) => {
    await this.auth.logoutAll(requireAuth(request).userId);
    return reply.status(204).send();
  };

  forgotPassword = async (request: ZodRequest<Schemas["forgotPassword"]>, reply: ZodReply<Schemas["forgotPassword"]>) => {
    await this.auth.requestPasswordReset(request.body.email, requestMeta(request));
    return reply
      .status(202)
      .send({ message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." });
  };

  resetPassword = async (request: ZodRequest<Schemas["resetPassword"]>, reply: ZodReply<Schemas["resetPassword"]>) => {
    await this.auth.resetPassword(request.body.token, request.body.password, requestMeta(request));
    return reply.status(204).send();
  };

  changePassword = async (request: ZodRequest<Schemas["changePassword"]>, reply: ZodReply<Schemas["changePassword"]>) => {
    const { userId, sessionId } = requireAuth(request);
    await this.auth.changePassword(
      userId,
      sessionId,
      request.body.currentPassword,
      request.body.newPassword,
      requestMeta(request),
    );
    return reply.status(204).send();
  };
}
