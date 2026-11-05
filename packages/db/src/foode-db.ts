// Única porta de acesso ao D1 (ADR 0006). Rotas e entrypoints recebem um `FoodeDb` e só
// chegam a dados de uma Loja por um `StoreContext` emitido aqui depois de conferir a
// membership; o Storefront só enxerga Lojas `active`; Ops exige `foode_ops` no banco.
// Toda consulta de Loja filtra por `ctx.storeId` — nunca por id vindo do request sozinho.
import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import {
  assertIssued,
  issueOpsContext,
  issueStoreContext,
  type OpsContext,
  type StoreContext,
} from "./context";
import { newId, utcNow } from "./conventions";
import { createCouponCheckoutOps, createCouponOps } from "./coupon-db";
import { createCustomerOps, createOpsCustomerOps } from "./customer-db";
import { createMenuOps, publicMenuBySlug, type PublicStoreMenu } from "./menu";
import { FoodeDbError } from "./errors";
import {
  createOnboardingOps,
  currentSlugForHistorical,
  publicShowcaseOf,
  type PublicShowcaseRow,
  recordFunnelEvent,
} from "./onboarding-db";
import { createLeadOps, createOpsLeadOps } from "./lead-db";
import {
  createOpsOperations,
  type DefaultPaymentFee,
  defaultPaymentFeesOf,
  effectivePaymentFeesOf,
  type EffectivePaymentFee,
} from "./ops-db";
import { createCardPaymentOps } from "./card-payment-db";
import { createPaymentOps } from "./payment-db";
import { createRefundOps } from "./refund-db";
import { createOperationOps, createOrderOps } from "./store-operation-db";
import { createStorefrontOrderOps } from "./storefront-order-db";
import {
  auditEvents,
  MEMBERSHIP_ROLES,
  type MembershipRole,
  type FunnelEventName,
  storeMemberships,
  stores,
  type StoreStatus,
  users,
} from "./schema";

export type StoreSummary = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
};

export type PublicStore = {
  slug: string;
  name: string;
};

/** `active` = já definiu senha; `invited` = convite enviado, ainda sem senha (EQP-01). */
export type MemberStatus = "invited" | "active";

export type StoreMember = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
  status: MemberStatus;
};

/** Membership `m` cujo usuário já tem conta `credential` com senha (convite aceito). */
const HAS_PASSWORD_SQL = `EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = m.user_id AND a.provider_id = 'credential' AND a.password IS NOT NULL)`;

export type AuditEvent = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
};

export type AuditInput = {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

/** Entrada do provisionamento por convite (Ticket 22, achado 19.6: um único fluxo). */
export type MembershipInviteInput = {
  email: string;
  name?: string | undefined;
};

/**
 * Resultado do provisionamento: a membership (nova ou já existente) e o estado do usuário.
 * `membershipCreated = false` quer dizer que o usuário já era membro desta Loja; nesse caso
 * nada foi gravado, a não ser a auditoria de reenvio quando o usuário ainda não tem senha.
 */
export type MembershipInvite = {
  membershipId: string;
  userId: string;
  email: string;
  role: MembershipRole;
  storeId: string;
  storeName: string;
  membershipCreated: boolean;
  userCreated: boolean;
  /** Já tem conta `credential` com senha (o convite vira só um aviso). */
  hasPassword: boolean;
};

/** Eventos de autenticação sem Loja (trilha do usuário). */
export type AuthAuditAction = "auth.password_set" | "auth.sessions_revoked";

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function parseMetadata(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
}

function toAuditEvent(row: typeof auditEvents.$inferSelect): AuditEvent {
  return {
    id: row.id,
    occurredAt: row.occurredAt,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: parseMetadata(row.metadata),
  };
}

export { FoodeDbError };

export function createFoodeDb(d1: D1Database) {
  const db = drizzle(d1);

  async function storeOf(context: StoreContext): Promise<StoreSummary> {
    const [row] = await db
      .select({ id: stores.id, slug: stores.slug, name: stores.name, status: stores.status })
      .from(stores)
      .where(eq(stores.id, context.storeId))
      .limit(1);
    if (!row) throw new FoodeDbError("forbidden");
    return row;
  }

  function auditInsert(
    actorUserId: string | null,
    storeId: string | null,
    input: AuditInput,
  ): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId(),
        utcNow(),
        actorUserId,
        storeId,
        input.action,
        input.targetType ?? null,
        input.targetId ?? null,
        JSON.stringify(input.metadata ?? {}),
      );
  }

  /**
   * Provisionamento único (convite do Dono e convite do Ops): cria o usuário se o e-mail for
   * novo, cria a membership e audita, num batch atômico. Nada é gravado se a Loja não existe.
   * Membership já existente não muda de papel; se o usuário ainda não tem senha, registra o
   * reenvio do convite.
   */
  async function provisionMembership(
    actorUserId: string,
    storeId: string,
    role: MembershipRole,
    input: MembershipInviteInput,
    action: string,
  ): Promise<MembershipInvite | null> {
    const email = input.email.trim().toLowerCase();
    const name = (input.name ?? "").trim();
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      throw new FoodeDbError("invalid_input", "e-mail inválido");
    }
    const userId = newId();
    const membershipId = newId();
    const now = utcNow();

    const [userInsert] = await d1.batch([
      d1
        .prepare(
          `INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
           SELECT ?, ?, ?, 0, ?, ? WHERE EXISTS (SELECT 1 FROM stores WHERE id = ?)
           ON CONFLICT(email) DO NOTHING`,
        )
        .bind(userId, email, name, now, now, storeId),
      // Reenvio: a membership já existia e o usuário ainda não definiu senha.
      d1
        .prepare(
          `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
           SELECT ?, ?, ?, m.store_id, 'membership.invite_resent', 'store_membership', m.id, json_object('role', m.role)
           FROM store_memberships m JOIN users u ON u.id = m.user_id
           WHERE m.store_id = ? AND u.email = ? AND NOT ${HAS_PASSWORD_SQL}`,
        )
        .bind(newId(), now, actorUserId, storeId, email),
      d1
        .prepare(
          `INSERT INTO store_memberships (id, store_id, user_id, role, created_at)
           SELECT ?, s.id, u.id, ?, ? FROM stores s JOIN users u ON u.email = ? WHERE s.id = ?
           ON CONFLICT(store_id, user_id) DO NOTHING`,
        )
        .bind(membershipId, role, now, email, storeId),
      d1
        .prepare(
          `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
           SELECT ?, ?, ?, store_id, ?, 'store_membership', id, json_object('role', role, 'userId', user_id)
           FROM store_memberships WHERE id = ?`,
        )
        .bind(newId(), now, actorUserId, action, membershipId),
    ]);

    const row = await d1
      .prepare(
        `SELECT m.id AS membershipId, m.user_id AS userId, u.email AS email, m.role AS role,
                s.name AS storeName, ${HAS_PASSWORD_SQL} AS hasPassword
         FROM store_memberships m
         JOIN users u ON u.id = m.user_id
         JOIN stores s ON s.id = m.store_id
         WHERE m.store_id = ? AND u.email = ?`,
      )
      .bind(storeId, email)
      .first<{
        membershipId: string;
        userId: string;
        email: string;
        role: MembershipRole;
        storeName: string;
        hasPassword: number;
      }>();
    if (!row) return null;
    return {
      membershipId: row.membershipId,
      userId: row.userId,
      email: row.email,
      role: row.role,
      storeId,
      storeName: row.storeName,
      membershipCreated: row.membershipId === membershipId,
      userCreated: (userInsert?.meta.changes ?? 0) > 0,
      hasPassword: row.hasPassword === 1,
    };
  }

  return {
    /** Conectividade com o D1 (usado pelo `/health`); não lê dados de Loja. */
    async ping(): Promise<boolean> {
      const row = await d1.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      return row?.ok === 1;
    },

    /** Storefront público: só Lojas `active`, só campos públicos. */
    storefront: {
      async publicStoreBySlug(slug: string): Promise<PublicStore | null> {
        if (!SLUG_PATTERN.test(slug)) return null;
        const [row] = await db
          .select({ slug: stores.slug, name: stores.name })
          .from(stores)
          .where(and(eq(stores.slug, slug), eq(stores.status, "active")))
          .limit(1);
        return row ?? null;
      },

      /**
       * Cardápio público da Loja `active` do Slug; null para inexistente ou não ativa. Com
       * `includePreview`, a Loja em `onboarding` volta como prévia (`preview: true`, decisão 74).
       */
      publicMenuBySlug(
        slug: string,
        options?: { includePreview?: boolean },
      ): Promise<PublicStoreMenu | null> {
        return publicMenuBySlug(d1, slug, options);
      },

      /**
       * Checkout e Pedido do Consumidor (Ticket 24a): estado da Loja, criação idempotente com as
       * condições na mesma escrita, acompanhamento por token e busca por telefone auditada.
       */
      ...createStorefrontOrderOps(d1),

      /**
       * Vitrine pública do Ticket 28 (logo, capa, descrição, Instagram, Pixel). `storeId` só de
       * uma Loja já resolvida pelo Slug como `active` (`operationBySlug`); null = sem vitrine.
       */
      showcaseOf(storeId: string): Promise<PublicShowcaseRow | null> {
        return publicShowcaseOf(d1, storeId);
      },

      /**
       * Link personalizado antigo (decisão 69): o link atual da Loja dona, para o 308 do
       * Storefront (um salto, qualquer estado da Loja); null = não é link antigo.
       */
      currentSlugForHistorical(slug: string): Promise<string | null> {
        return currentSlugForHistorical(d1, slug);
      },

      /** Cupom pelo código e fatos do boas-vindas (Ticket 13), da Loja já resolvida pelo Slug. */
      ...createCouponCheckoutOps(d1),

      /** Funil próprio (Ticket 28): +1 no contador do dia para a Loja `active` do Slug. */
      recordFunnelEvent(slug: string, event: FunnelEventName, day: string): Promise<boolean> {
        return recordFunnelEvent(d1, slug, event, day);
      },
    },

    /**
     * Conta do Consumidor (Ticket 13): código do WhatsApp (uso único, atômico), sessão por hash do
     * token, cadastro com nome + CPF e "meus Pedidos" por Loja. Sem StoreContext (não é membro).
     */
    customer: createCustomerOps(d1),

    /**
     * Pagamento online (Ticket 26): intenção PIX, eventos de webhook (identidade única) e Ledger.
     * Sem StoreContext: a Loja sai da intenção gravada; quem chama é a criação do Pedido, a página
     * do Pedido (token conferido) ou o webhook autenticado do provedor.
     */
    payments: createPaymentOps(d1),

    /**
     * Cartão de crédito (Ticket 27): tentativas idempotentes, cobrança, recusa e confirmação
     * canônica com Ledger e retenções. Mesmo modelo sem StoreContext do PIX.
     */
    cardPayments: createCardPaymentOps(d1),

    /**
     * Estorno (Ticket 12): execução idempotente da obrigação gravada no cancelamento, webhooks de
     * Estorno, retentativa e o cancelamento automático do PIX vencido. Sem StoreContext: a Loja
     * sai da obrigação/intenção gravada. O cancelamento pelo Painel é `store(ctx).orders().cancel`.
     */
    refunds: createRefundOps(d1),

    /** Emissão de contextos: a Loja e o papel saem do banco, nunca do request. */
    access: {
      async storeContext(input: { userId: string; storeId: string }): Promise<StoreContext | null> {
        const [row] = await db
          .select({ storeId: storeMemberships.storeId, role: storeMemberships.role })
          .from(storeMemberships)
          .where(
            and(
              eq(storeMemberships.userId, input.userId),
              eq(storeMemberships.storeId, input.storeId),
            ),
          )
          .limit(1);
        if (!row) return null;
        return issueStoreContext({ storeId: row.storeId, userId: input.userId, role: row.role });
      },

      /** Lojas do usuário (seletor de Loja do Painel). */
      async storesOfUser(userId: string): Promise<(StoreSummary & { role: MembershipRole })[]> {
        return db
          .select({
            id: stores.id,
            slug: stores.slug,
            name: stores.name,
            status: stores.status,
            role: storeMemberships.role,
          })
          .from(storeMemberships)
          .innerJoin(stores, eq(stores.id, storeMemberships.storeId))
          .where(eq(storeMemberships.userId, userId))
          .orderBy(asc(stores.name));
      },

      async opsContext(userId: string): Promise<OpsContext | null> {
        const [row] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, userId), eq(users.platformRole, "foode_ops")))
          .limit(1);
        return row ? issueOpsContext({ userId: row.id }) : null;
      },

      /** Trilha de eventos de autenticação de um usuário (sem Loja); ator padrão = o próprio. */
      async recordAuthEvent(
        userId: string,
        action: AuthAuditAction,
        options: { actorUserId?: string; metadata?: Record<string, unknown> } = {},
      ): Promise<void> {
        await d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, NULL, ?, 'user', id, ? FROM users WHERE id = ?`,
          )
          .bind(
            newId(),
            utcNow(),
            options.actorUserId ?? userId,
            action,
            JSON.stringify(options.metadata ?? {}),
            userId,
          )
          .run();
      },
    },

    /**
     * Rate limit de janela fixa no D1 (mesma tabela do Better Auth, chaves com prefixo próprio).
     * Um único UPSERT atômico: conta a tentativa e devolve se ainda cabe na janela.
     */
    rateLimit: {
      async consume(key: string, rule: { windowSeconds: number; max: number }): Promise<boolean> {
        const now = Date.now();
        const windowMs = rule.windowSeconds * 1000;
        const row = await d1
          .prepare(
            `INSERT INTO rate_limits (id, key, count, last_request) VALUES (?, ?, 1, ?)
             ON CONFLICT(key) DO UPDATE SET
               "count" = CASE WHEN ? - last_request >= ? THEN 1 ELSE "count" + 1 END,
               last_request = CASE WHEN ? - last_request >= ? THEN ? ELSE last_request END
             RETURNING "count" AS count`,
          )
          .bind(newId(), key, now, now, windowMs, now, windowMs, now)
          .first<{ count: number }>();
        return (row?.count ?? Number.POSITIVE_INFINITY) <= rule.max;
      },
    },

    /** Operações de uma Loja. Todas filtram por `ctx.storeId`. */
    store(context: StoreContext) {
      assertIssued(context);
      const storeId = context.storeId;

      return {
        get: () => storeOf(context),

        /** Cardápio (Ticket 23): escrita só do Dono, sempre nesta Loja, com auditoria. */
        menu: () => createMenuOps(d1, context),

        /** Configuração operacional (Ticket 24a): Pausa (Dono e Operador); o resto só Dono. */
        operation: () => createOperationOps(d1, context),

        /** Pedidos no Painel (Ticket 24a/24b): fila, detalhe, avanço e cancelamento (Ticket 12). */
        orders: () => createOrderOps(d1, context),

        /** Onboarding, dados, vitrine, Slug, Pixel e funil (Ticket 28): escrita só do Dono. */
        onboarding: () => createOnboardingOps(d1, context),

        /** Cupons e boas-vindas (Ticket 13): só o Dono (`forbidden` para Operador). */
        coupons: () => createCouponOps(d1, context),

        /**
         * Equipe da Loja com a situação de cada membro (EQP-01): `active` se já definiu senha
         * (conta `credential` com senha, a mesma regra do convite); senão `invited`.
         */
        async members(): Promise<StoreMember[]> {
          const { results } = await d1
            .prepare(
              `SELECT m.id AS membershipId, u.id AS userId, u.email AS email, u.name AS name,
                      m.role AS role, ${HAS_PASSWORD_SQL} AS hasPassword
               FROM store_memberships m
               JOIN users u ON u.id = m.user_id
               WHERE m.store_id = ?
               ORDER BY u.email ASC`,
            )
            .bind(storeId)
            .all<Omit<StoreMember, "status"> & { hasPassword: number }>();
          return results.map(({ hasPassword, ...member }) => ({
            ...member,
            status: hasPassword === 1 ? "active" : "invited",
          }));
        },

        /** Só o Dono. Id de membership de outra Loja não remove nada (retorna false). */
        async removeMember(membershipId: string): Promise<boolean> {
          if (context.role !== "owner") throw new FoodeDbError("forbidden");
          // Auditoria e remoção no mesmo batch atômico; o INSERT…SELECT só grava se a
          // membership existir nesta Loja.
          const [, removal] = await d1.batch([
            d1
              .prepare(
                `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
                 SELECT ?, ?, ?, store_id, 'membership.removed', 'store_membership', id, '{}'
                 FROM store_memberships WHERE id = ? AND store_id = ?`,
              )
              .bind(newId(), utcNow(), context.userId, membershipId, storeId),
            d1
              .prepare("DELETE FROM store_memberships WHERE id = ? AND store_id = ?")
              .bind(membershipId, storeId),
          ]);
          return (removal?.meta.changes ?? 0) > 0;
        },

        /** Só o Dono: convida para ESTA Loja (a Loja vem do contexto, nunca do request). */
        async inviteMember(
          input: MembershipInviteInput & { role: MembershipRole },
        ): Promise<MembershipInvite> {
          if (context.role !== "owner") throw new FoodeDbError("forbidden");
          if (!MEMBERSHIP_ROLES.includes(input.role)) throw new FoodeDbError("invalid_input");
          const invite = await provisionMembership(
            context.userId,
            storeId,
            input.role,
            input,
            "membership.invited",
          );
          if (!invite) throw new FoodeDbError("forbidden");
          return invite;
        },

        async rename(name: string): Promise<void> {
          if (context.role !== "owner") throw new FoodeDbError("forbidden");
          const trimmed = name.trim();
          if (!trimmed) throw new FoodeDbError("invalid_input", "nome vazio");
          await d1.batch([
            d1
              .prepare("UPDATE stores SET name = ?, updated_at = ? WHERE id = ?")
              .bind(trimmed, utcNow(), storeId),
            auditInsert(context.userId, storeId, {
              action: "store.renamed",
              targetType: "store",
              targetId: storeId,
            }),
          ]);
        },

        async auditTrail(limit = 50): Promise<AuditEvent[]> {
          const rows = await db
            .select()
            .from(auditEvents)
            .where(eq(auditEvents.storeId, storeId))
            .orderBy(desc(auditEvents.occurredAt))
            .limit(Math.min(Math.max(limit, 1), 200));
          return rows.map(toAuditEvent);
        },

        async auditEvent(id: string): Promise<AuditEvent | null> {
          const [row] = await db
            .select()
            .from(auditEvents)
            .where(and(eq(auditEvents.id, id), eq(auditEvents.storeId, storeId)))
            .limit(1);
          return row ? toAuditEvent(row) : null;
        },

        async recordAudit(input: AuditInput): Promise<void> {
          await auditInsert(context.userId, storeId, input).run();
        },
      };
    },

    /**
     * Leitura do checkout (Tickets 26/27): taxa Foode vigente da Loja `active` em `at`. Loja que
     * não está `active` não tem meio online (lista vazia).
     */
    checkout: {
      async effectivePaymentFees(storeId: string, at = utcNow()): Promise<EffectivePaymentFee[]> {
        const row = await d1
          .prepare(
            `SELECT s.id AS id, p.card_mode AS cardMode FROM stores s
             LEFT JOIN store_profiles p ON p.store_id = s.id
             WHERE s.id = ? AND s.status = 'active'`,
          )
          .bind(storeId)
          .first<{ id: string; cardMode: "normal" | "rapido" | null }>();
        if (!row) return [];
        return effectivePaymentFeesOf(d1, row.id, row.cardMode, at);
      },

      /** Tabela padrão Foode vigente (landing, Ticket 31): só `store_id IS NULL`, nunca override. */
      defaultPaymentFees(at = utcNow()): Promise<DefaultPaymentFee[]> {
        return defaultPaymentFeesOf(d1, at);
      },
    },

    /** Leads da landing (Ticket 31): gravação pública; lista e status só no `ops(context)`. */
    leads: createLeadOps(d1),

    /** Área Ops (`foode_ops`): Lojas, Plano, faixas, taxas e custos, sempre com auditoria. */
    ops(context: OpsContext) {
      assertIssued(context);

      return {
        ...createOpsOperations(d1, context),

        /** Conta do Consumidor (Ticket 13): busca por telefone/CPF e troca de telefone auditada. */
        ...createOpsCustomerOps(d1, context),

        /** Leads da landing (Ticket 31): lista e troca de status auditada. */
        ...createOpsLeadOps(d1, context),

        /**
         * Ops convida o Dono de qualquer Loja; null se a Loja não existe (nada é gravado).
         * Reenvio = chamar de novo: membership existente sem senha audita o reenvio.
         */
        async inviteOwner(
          storeId: string,
          input: MembershipInviteInput,
        ): Promise<MembershipInvite | null> {
          return provisionMembership(
            context.userId,
            storeId,
            "owner",
            input,
            "membership.owner_invited_by_ops",
          );
        },
      };
    },
  };
}

export type FoodeDb = ReturnType<typeof createFoodeDb>;
