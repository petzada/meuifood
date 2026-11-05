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
import {
  auditEvents,
  type MembershipRole,
  storeMemberships,
  stores,
  type StoreStatus,
  STORE_STATUSES,
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

export type StoreMember = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  role: MembershipRole;
};

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

export class FoodeDbError extends Error {
  constructor(
    readonly code: "forbidden" | "slug_unavailable" | "invalid_input",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "FoodeDbError";
  }
}

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return message.includes("UNIQUE constraint failed");
}

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
    },

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
    },

    /** Operações de uma Loja. Todas filtram por `ctx.storeId`. */
    store(context: StoreContext) {
      assertIssued(context);
      const storeId = context.storeId;

      return {
        get: () => storeOf(context),

        async members(): Promise<StoreMember[]> {
          return db
            .select({
              membershipId: storeMemberships.id,
              userId: users.id,
              email: users.email,
              name: users.name,
              role: storeMemberships.role,
            })
            .from(storeMemberships)
            .innerJoin(users, eq(users.id, storeMemberships.userId))
            .where(eq(storeMemberships.storeId, storeId))
            .orderBy(asc(users.email));
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

    /** Área Ops (`foode_ops`): cadastro e estado das Lojas, com auditoria. */
    ops(context: OpsContext) {
      assertIssued(context);

      return {
        async listStores(): Promise<StoreSummary[]> {
          return db
            .select({ id: stores.id, slug: stores.slug, name: stores.name, status: stores.status })
            .from(stores)
            .orderBy(asc(stores.name));
        },

        async createStore(input: { slug: string; name: string }): Promise<StoreSummary> {
          const slug = input.slug.trim().toLowerCase();
          const name = input.name.trim();
          if (!SLUG_PATTERN.test(slug)) throw new FoodeDbError("invalid_input", "slug inválido");
          if (!name) throw new FoodeDbError("invalid_input", "nome vazio");
          const id = newId();
          const now = utcNow();
          try {
            await d1.batch([
              d1
                .prepare(
                  "INSERT INTO stores (id, slug, name, status, created_at, updated_at) VALUES (?, ?, ?, 'onboarding', ?, ?)",
                )
                .bind(id, slug, name, now, now),
              auditInsert(context.userId, id, {
                action: "store.created",
                targetType: "store",
                targetId: id,
                metadata: { slug },
              }),
            ]);
          } catch (error) {
            if (isUniqueViolation(error)) throw new FoodeDbError("slug_unavailable");
            throw error;
          }
          return { id, slug, name, status: "onboarding" };
        },

        async setStoreStatus(storeId: string, status: StoreStatus): Promise<boolean> {
          if (!STORE_STATUSES.includes(status)) throw new FoodeDbError("invalid_input");
          const [update] = await d1.batch([
            d1
              .prepare("UPDATE stores SET status = ?, updated_at = ? WHERE id = ?")
              .bind(status, utcNow(), storeId),
            d1
              .prepare(
                `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
                 SELECT ?, ?, ?, id, 'store.status_changed', 'store', id, json_object('status', ?)
                 FROM stores WHERE id = ?`,
              )
              .bind(newId(), utcNow(), context.userId, status, storeId),
          ]);
          return (update?.meta.changes ?? 0) > 0;
        },
      };
    },
  };
}

export type FoodeDb = ReturnType<typeof createFoodeDb>;
