// Leads da landing (Ticket 31, decisão 70). Duas portas:
// - `createLeadOps(d1)`: gravação pública (a api já passou o Turnstile, o rate limit por IP e o
//   Zod de @foode/shared/lead); sem StoreContext — lead não é dado de Loja;
// - `createOpsLeadOps(d1, ctx)`: lista e troca de status, só atrás de um OpsContext emitido por
//   este pacote. A troca grava `lead.status_changed` (before/after) no MESMO batch, condicionada ao
//   status lido (versão otimista: mudou no meio = `conflict`, nada gravado).
import { assertIssued, type OpsContext } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError } from "./errors";
import type { LeadStatus, LEAD_ORDERS_PER_DAY } from "./schema";

export type LeadOrdersPerDay = (typeof LEAD_ORDERS_PER_DAY)[number];

/** Entrada já validada e normalizada pelo Zod da api. */
export type LeadCreateData = {
  name: string;
  whatsapp: string;
  storeName: string;
  city: string;
  ordersPerDay: LeadOrdersPerDay;
  source?: string | undefined;
};

export type LeadRow = {
  id: string;
  name: string;
  whatsapp: string;
  storeName: string;
  city: string;
  ordersPerDay: LeadOrdersPerDay;
  source: string | null;
  status: LeadStatus;
  statusChangedAt: string | null;
  statusChangedByEmail: string | null;
  createdAt: string;
};

/** Teto da lista do Ops (mais recentes primeiro). */
export const LEADS_LIST_MAX = 200;

export const LEAD_AUDIT_ACTIONS = ["lead.status_changed"] as const;

const LEAD_SELECT = `SELECT l.id AS id, l.name AS name, l.whatsapp AS whatsapp,
  l.store_name AS storeName, l.city AS city, l.orders_per_day AS ordersPerDay, l.source AS source,
  l.status AS status, l.status_changed_at AS statusChangedAt, u.email AS statusChangedByEmail,
  l.created_at AS createdAt
  FROM leads l LEFT JOIN users u ON u.id = l.status_changed_by_user_id`;

export function createLeadOps(d1: D1Database) {
  return {
    /** Grava o lead (status `new`). */
    async create(input: LeadCreateData): Promise<{ leadId: string }> {
      const leadId = newId();
      const now = utcNow();
      await d1
        .prepare(
          `INSERT INTO leads (id, name, whatsapp, store_name, city, orders_per_day, source, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
        )
        .bind(
          leadId,
          input.name,
          input.whatsapp,
          input.storeName,
          input.city,
          input.ordersPerDay,
          input.source ?? null,
          now,
          now,
        )
        .run();
      return { leadId };
    },
  };
}

export function createOpsLeadOps(d1: D1Database, context: OpsContext) {
  assertIssued(context);
  const actor = context.userId;

  return {
    /** Leads mais recentes primeiro; `status` filtra. */
    async listLeads(filter: { status?: LeadStatus | undefined } = {}): Promise<LeadRow[]> {
      const { results } = await d1
        .prepare(
          `${LEAD_SELECT} ${filter.status ? "WHERE l.status = ?" : ""}
           ORDER BY l.created_at DESC, l.id LIMIT ${LEADS_LIST_MAX}`,
        )
        .bind(...(filter.status ? [filter.status] : []))
        .all<LeadRow>();
      return results;
    },

    /**
     * Troca o status (idempotente: o mesmo status não grava nem audita). Lead inexistente =
     * `not_found`; status mudou entre a leitura e a escrita = `conflict`.
     */
    async setLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
      const row = await d1
        .prepare("SELECT status FROM leads WHERE id = ?")
        .bind(leadId)
        .first<{ status: LeadStatus }>();
      if (!row) throw new FoodeDbError("not_found");
      if (row.status === status) return;
      const now = utcNow();
      const [, update] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, NULL, 'lead.status_changed', 'lead', id,
               json_object('before', json_object('status', status), 'after', json_object('status', ?))
             FROM leads WHERE id = ? AND status = ?`,
          )
          .bind(newId(), now, actor, status, leadId, row.status),
        d1
          .prepare(
            `UPDATE leads SET status = ?, status_changed_at = ?, status_changed_by_user_id = ?, updated_at = ?
             WHERE id = ? AND status = ?`,
          )
          .bind(status, now, actor, now, leadId, row.status),
      ]);
      if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("conflict");
    },
  };
}

export type OpsLeadOps = ReturnType<typeof createOpsLeadOps>;
