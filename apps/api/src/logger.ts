import type { FastifyRequest } from "fastify";

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
      "authorization",
      "cookie",
      "password",
      "cardNumber",
      "cvv",
      "cvc",
      "email",
      "phone",
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
};
