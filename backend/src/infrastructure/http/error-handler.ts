import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from "fastify-type-provider-zod";
import type { EventLogger } from "../logging/event-logger.js";
import { AppError, type FieldIssue, type FieldLocation } from "../../shared/errors/app-error.js";
import {
  PG_CHECK_VIOLATION,
  PG_FOREIGN_KEY_VIOLATION,
  PG_INVALID_TEXT_REPRESENTATION,
  PG_UNIQUE_VIOLATION,
  findPgError,
} from "../../shared/errors/pg-errors.js";

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

function send(reply: FastifyReply, body: ErrorBody, headers: Record<string, string> = {}) {
  return reply.headers(headers).status(body.statusCode).send(body);
}

/** Erros do Fastify e dos plugins, com código estável e mensagem em português. */
const FRAMEWORK_ERRORS: Record<string, { statusCode: number; code: string; message: string }> = {
  FST_ERR_CTP_INVALID_JSON_BODY: {
    statusCode: 400,
    code: "INVALID_JSON",
    message: "O corpo da requisição não é um JSON válido.",
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: { statusCode: 400, code: "EMPTY_BODY", message: "O corpo da requisição está vazio." },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    statusCode: 415,
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "Formato não suportado. Envie o corpo em JSON (Content-Type: application/json).",
  },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    statusCode: 413,
    code: "PAYLOAD_TOO_LARGE",
    message: "O corpo da requisição excede o tamanho máximo permitido (1 MB).",
  },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    statusCode: 400,
    code: "INVALID_CONTENT_LENGTH",
    message: "O cabeçalho Content-Length não corresponde ao corpo enviado.",
  },
  FST_ERR_BAD_URL: { statusCode: 400, code: "INVALID_URL", message: "A URL da requisição é inválida." },
  FST_CP_ERR_INVALID_CONTENT_ENCODING: {
    statusCode: 415,
    code: "UNSUPPORTED_CONTENT_ENCODING",
    message: "Content-Encoding não suportado. Use br, gzip ou deflate.",
  },
  FST_CP_ERR_INVALID_CONTENT: {
    statusCode: 400,
    code: "INVALID_COMPRESSED_BODY",
    message: "Não foi possível descompactar o corpo da requisição.",
  },
};

interface ZodValidationItem {
  keyword: string;
  instancePath: string;
  message: string;
  params?: { keys?: string[]; expected?: string };
}

/** Converte os erros do schema (DTO) em `details`: um item por campo, com caminho legível. */
function toFieldIssues(location: FieldLocation, items: ZodValidationItem[]): FieldIssue[] {
  return items.flatMap((item): FieldIssue[] => {
    const base = item.instancePath.split("/").filter(Boolean);
    if (item.keyword === "unrecognized_keys") {
      return (item.params?.keys ?? []).map((key) => ({
        location,
        path: [...base, key].join("."),
        message: "Campo não reconhecido.",
      }));
    }
    if (base.length === 0 && location === "body" && item.keyword === "invalid_type" && item.params?.expected === "object") {
      return [{ location, message: "Envie os dados no corpo da requisição, em JSON." }];
    }
    return [{ location, ...(base.length > 0 ? { path: base.join(".") } : {}), message: item.message }];
  });
}

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
      const location = ((error as { validationContext?: string }).validationContext ?? "body") as FieldLocation;
      return send(reply, {
        statusCode: 400,
        code: "VALIDATION_ERROR",
        message: "Dados inválidos na requisição.",
        details: toFieldIssues(location, error.validation as unknown as ZodValidationItem[]),
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

    const known = FRAMEWORK_ERRORS[(error as FastifyError).code ?? ""];
    if (known) return send(reply, known);

    const statusCode = (error as FastifyError).statusCode;
    if (statusCode === 429) {
      return send(reply, {
        statusCode,
        code: "RATE_LIMITED",
        message: "Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.",
      });
    }
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      request.log.info({ err: error }, "Requisição inválida");
      return send(reply, { statusCode, code: "BAD_REQUEST", message: "Requisição inválida." });
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
