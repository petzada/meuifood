import type { FastifyRequest } from "fastify";
import type { LoggerOptions } from "pino";

const sensitiveFields = [
  "accessToken",
  "address",
  "apiKey",
  "authorization",
  "cardNumber",
  "cardholderName",
  "cookie",
  "cvc",
  "cvv",
  "email",
  "password",
  "phone",
  "phoneNumber",
  "refreshToken",
  "secret",
  "token",
];

const nestedSensitivePaths = sensitiveFields.flatMap((field) => [
  field,
  `*.${field}`,
  `*.*.${field}`,
  `*.*.*.${field}`,
  `*.*.*.*.${field}`,
]);

function pathWithoutQuery(url: string | undefined) {
  return url?.split("?", 1)[0] ?? "";
}

/** Máscara o capability token em qualquer ocorrência de `/public/orders/:token`. */
export function redactPublicOrderAccessInText(value: string): string {
  return value.replace(
    /\/public\/orders\/[^/?\s"']+/gu,
    "/public/orders/[Redacted]",
  );
}

export function redactPublicOrderAccessPath(path: string): string {
  return redactPublicOrderAccessInText(path);
}

export const safeLoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "req.body",
      "req.query",
      "res.headers['set-cookie']",
      ...nestedSensitivePaths,
    ],
    censor: "[Redacted]",
  },
  hooks: {
    logMethod(args, method) {
      for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (typeof arg === "string") {
          args[index] = redactPublicOrderAccessInText(arg);
          continue;
        }
        if (arg && typeof arg === "object") {
          const record = { ...(arg as Record<string, unknown>) };
          if (typeof record.msg === "string") {
            record.msg = redactPublicOrderAccessInText(record.msg);
          }
          args[index] = record;
        }
      }
      return method.apply(this, args);
    },
  },
  serializers: {
    req(request: FastifyRequest) {
      return {
        method: request.method,
        path: redactPublicOrderAccessPath(pathWithoutQuery(request.url)),
      };
    },
    res(response: { statusCode: number }) {
      return { statusCode: response.statusCode };
    },
  },
} satisfies LoggerOptions;
