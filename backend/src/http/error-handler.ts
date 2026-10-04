import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import type { EventLogger } from "../infra/event-log.js";
import { AppError } from "../shared/errors.js";
import {
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_INVALID_TEXT_REPRESENTATION,
  PG_UNIQUE_VIOLATION,
  findPgError,
} from "../shared/pg-errors.js";

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

function send(reply: FastifyReply, body: ErrorBody, headers: Record<string, string> = {}) {
  return reply.headers(headers).status(body.statusCode).send(body);
}

const FASTIFY_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  406: "NOT_ACCEPTABLE",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  429: "RATE_LIMITED",
};

/** Formato único de erro da API: { statusCode, code, message, details? }. */
export function createErrorHandler(eventLog: EventLogger) {
  return function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
    if (error instanceof AppError) {
      return send(
        reply,
        {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
        error.headers,
      );
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const where = (error as { validationContext?: string }).validationContext;
      return send(reply, {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Dados inválidos na requisição.",
        details: error.validation.map((issue) => ({
          location: where,
          path: issue.instancePath.replace(/^\//, "").replaceAll("/", ".") || undefined,
          message: issue.message,
        })),
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error, issues: error.cause.issues }, "Resposta não corresponde ao schema");
    }

    const pg = findPgError(error);
    if (pg?.code === PG_UNIQUE_VIOLATION) {
      return send(reply, { statusCode: 409, code: "CONFLICT", message: "Registro duplicado." });
    }
    if (pg?.code === PG_FOREIGN_KEY_VIOLATION) {
      return send(reply, {
        statusCode: 409,
        code: "REFERENCE_CONFLICT",
        message: "O registro está relacionado a outros dados e não pode ser alterado desta forma.",
      });
    }
    if (pg?.code === PG_CHECK_VIOLATION || pg?.code === PG_INVALID_TEXT_REPRESENTATION) {
      return send(reply, { statusCode: 400, code: "VALIDATION_ERROR", message: "Dados inválidos na requisição." });
    }

    const statusCode = (error as FastifyError).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return send(reply, {
        statusCode,
        code: FASTIFY_CODES[statusCode] ?? "BAD_REQUEST",
        message: statusCode === 429 ? "Muitas requisições. Aguarde um instante e tente novamente." : error.message,
      });
    }

    request.log.error({ err: error }, "Erro não tratado");
    eventLog.record("http.unhandled_error", {
      level: "error",
      message: error.message,
      requestId: request.id,
      userId: request.auth?.userId ?? null,
      context: { method: request.method, route: request.routeOptions.url ?? null, name: error.name },
    });
    return send(reply, {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Erro interno. Tente novamente mais tarde.",
    });
  };
}
