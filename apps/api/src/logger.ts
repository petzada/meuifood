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
  return url?.split("?", 1)[0];
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
  serializers: {
    req(request: FastifyRequest) {
      return {
        method: request.method,
        path: pathWithoutQuery(request.url),
      };
    },
    res(response: { statusCode: number }) {
      return { statusCode: response.statusCode };
    },
  },
} satisfies LoggerOptions;
