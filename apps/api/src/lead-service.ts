// Leads da landing e tabela padrão de taxas (Ticket 31, decisão 70). Rotas públicas (o `web`
// repassa pelo service binding com `cf-connecting-ip`):
// - `POST /storefront/leads`: Zod (`leadCreateRequestSchema`) → rate limit por hash do IP
//   truncado (antes do siteverify: protege a cota do Turnstile) → Turnstile (falha fechada) →
//   grava → aviso por e-mail à Foode em segundo plano (falha só loga, sem dado pessoal);
// - `GET /storefront/taxas`: PIX e Crédito Normal/Rápido da tabela padrão vigente (só o que está
//   cadastrado; nunca override de Loja, nunca custo de provedor).
import type { FoodeDb } from "@foode/db";
import { LEAD_RATE_LIMIT, leadCreateRequestSchema } from "@foode/shared/lead";
import type { PublicDefaultFeesResponse } from "@foode/shared/ops";

import type { TurnstileVerifier } from "./auth/turnstile";
import { type EmailSender, sendInBackground } from "./email/sender";
import { leadNoticeEmail } from "./email/templates";
import { ipHash, requireSecret } from "./order-crypto";

export type LeadServiceDeps = {
  db: FoodeDb;
  turnstile: TurnstileVerifier;
  email: EmailSender;
  waitUntil: (promise: Promise<unknown>) => void;
  /** PHONE_LOOKUP_IP_SALT (o mesmo sal do hash de IP dos outros rate limits públicos). */
  ipSalt: string | undefined;
  /** LEADS_NOTIFY_EMAIL; vazio = sem aviso. */
  notifyEmail: string | undefined;
  /** Link do aviso: `/ops/leads` no Painel; null = sem Painel configurado. */
  opsLeadsUrl: string | null;
};

export type LeadReply =
  | { status: 201; body: { ok: true } }
  | { status: 400; body: { error: "invalid_input" } }
  | { status: 403; body: { error: "captcha_failed" } }
  | { status: 429; body: { error: "rate_limited" } };

export function createLeadService(deps: LeadServiceDeps) {
  const { db } = deps;
  return {
    async create(body: unknown, ip: string | null): Promise<LeadReply> {
      const parsed = leadCreateRequestSchema.safeParse(body);
      if (!parsed.success) return { status: 400, body: { error: "invalid_input" } };
      const salt = requireSecret(deps.ipSalt, "PHONE_LOOKUP_IP_SALT");
      const allowed = await db.rateLimit.consume(`lead:${await ipHash(salt, ip)}`, LEAD_RATE_LIMIT);
      if (!allowed) return { status: 429, body: { error: "rate_limited" } };
      const { turnstileToken, ...lead } = parsed.data;
      if (!(await deps.turnstile.verify(turnstileToken, ip))) {
        return { status: 403, body: { error: "captcha_failed" } };
      }
      const { leadId } = await db.leads.create(lead);
      const to = deps.notifyEmail?.trim();
      if (to) {
        sendInBackground(
          deps.email,
          deps.waitUntil,
          "lead_notice",
          leadNoticeEmail({
            to,
            lead,
            opsUrl: deps.opsLeadsUrl ?? "https://admin.foodedelivery.com.br/ops/leads",
            idempotencyKey: `lead-notice:${leadId}`,
          }),
        );
      }
      return { status: 201, body: { ok: true } };
    },

    async defaultFees(): Promise<PublicDefaultFeesResponse> {
      return { fees: await db.checkout.defaultPaymentFees() };
    },
  };
}

export type LeadService = ReturnType<typeof createLeadService>;
