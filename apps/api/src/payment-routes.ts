import { timingSafeEqual } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Temporal } from "@js-temporal/polyfill";

import type { BusinessDatabase } from "@foode/db";

import type { WooviClientLike } from "./woovi-adapter.js";

type RegisterPaymentRoutesOptions = {
  businessDatabase: BusinessDatabase;
  now: () => Temporal.Instant;
  opsApiToken?: string;
  verifyAccessToken?: (token: string) => Promise<{ userId: string }>;
  wooviClient: WooviClientLike;
};

function opsTokenMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearerToken(request: FastifyRequest): string | undefined {
  const match = /^Bearer ([^\s]+)$/u.exec(
    String(request.headers.authorization ?? ""),
  );
  return match?.[1];
}

export function registerWooviWebhookRoutes(
  app: FastifyInstance,
  options: Pick<
    RegisterPaymentRoutesOptions,
    "businessDatabase" | "now" | "wooviClient"
  >,
) {
  const { businessDatabase, now, wooviClient } = options;

  app.post("/webhooks/woovi", async (request, reply) => {
    const rawBody =
      typeof (request as unknown as { rawBody?: string }).rawBody === "string"
        ? (request as unknown as { rawBody: string }).rawBody
        : typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? {});

    const signature = String(
      request.headers["x-webhook-signature"] ?? "",
    ).trim();

    const handler = wooviClient.webhook.handler({
      onChargeCompleted: async (payload) => {
        await businessDatabase.applyWooviWebhook({
          confirmedAtIso: now().toString(),
          payload,
        });
      },
      onChargeCreated: async (payload) => {
        await businessDatabase.applyWooviWebhook({
          confirmedAtIso: now().toString(),
          payload,
        });
      },
      onChargeExpired: async (payload) => {
        await businessDatabase.applyWooviWebhook({
          confirmedAtIso: now().toString(),
          payload,
        });
      },
    });

    const webRequest = new Request("http://localhost/webhooks/woovi", {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        ...(signature ? { "x-webhook-signature": signature } : {}),
      },
      method: "POST",
    });

    const response = await handler.POST(webRequest);
    const text = await response.text();
    return reply.code(response.status).type("text/plain").send(text);
  });
}

/**
 * Ops = hit autenticado com `FOODE_OPS_API_TOKEN` (Decisão 25: secret Railway).
 * Não é papel de Loja nem quarto app. Dono/Operador são rejeitados.
 */
export function registerOpsLedgerRoutes(
  app: FastifyInstance,
  options: Pick<
    RegisterPaymentRoutesOptions,
    "businessDatabase" | "now" | "opsApiToken" | "verifyAccessToken"
  >,
) {
  const { businessDatabase, now, opsApiToken, verifyAccessToken } = options;

  app.post<{ Params: { ledgerEntryId: string } }>(
    "/ops/ledger-entries/:ledgerEntryId/mark-paid",
    async (request, reply) => {
      const token = bearerToken(request);
      if (!token) {
        return reply.code(401).send({ error: "unauthorized" });
      }

      if (opsApiToken && opsTokenMatches(opsApiToken, token)) {
        const ledgerEntryId = request.params.ledgerEntryId.trim();
        if (!/^[0-9a-f-]{36}$/iu.test(ledgerEntryId)) {
          return reply.code(400).send({ error: "invalid_ledger_entry_id" });
        }
        const result = await businessDatabase.markLedgerPaid({
          ledgerEntryId,
          paidAtIso: now().toString(),
        });
        if (result.kind === "not_found") {
          return reply.code(404).send({ error: "ledger_entry_not_found" });
        }
        return reply.code(200).send({
          ledgerEntry: {
            id: ledgerEntryId,
            paidAt: result.paidAt,
          },
        });
      }

      if (verifyAccessToken) {
        try {
          await verifyAccessToken(token);
          return reply.code(403).send({ error: "ops_only" });
        } catch {
          return reply.code(401).send({ error: "unauthorized" });
        }
      }

      return reply.code(401).send({ error: "unauthorized" });
    },
  );
}
