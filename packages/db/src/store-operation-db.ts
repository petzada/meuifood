// Configuração operacional da Loja e Pedidos no Painel (Ticket 24a é dono do contrato; o 24b
// consome pelas RPCs). Só este pacote fala SQL: o Painel chega aqui por
// `db.store(ctx).operation()` e `db.store(ctx).orders()` com StoreContext emitido pelo pacote.
//
// Regras:
// - Toda leitura e escrita filtra por `ctx.storeId`; Pedido/bairro de outra Loja é indistinguível
//   de inexistente (`not_found`).
// - Configuração (horários, entrega, bandeiras, "Imprimir ao aceitar") só do Dono; Pausa do Dono
//   e do Operador (P-OPE-4). Defesa em profundidade: a api já autorizou pela política única.
// - Escrita + auditoria no mesmo `batch` atômico. A Pausa audita só quando o estado mudou de fato
//   (INSERT…SELECT condicionado ao carimbo gravado), com quem e papel.
// - Transição de status: UPDATE condicional no estado que o Painel viu (`from`) e só para destino
//   válido do Fulfillment (mapa igual ao de @foode/shared/order, conferido em
//   apps/api/src/order-contract.test.ts). Sem regressão, sem conflito silencioso: estado atual
//   diferente de `from` = `conflict`, nada gravado.
// - Este pacote não depende de `@foode/shared`: os tipos repetem, estruturalmente, os de
//   `@foode/shared/order`; a api valida a entrada com o Zod antes de chegar aqui.
import { assertIssued, type StoreContext } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError } from "./errors";
import { type CancelOrderDbInput, cancelOrderWithRefund } from "./refund-db";
import {
  type DeliveryMode,
  type OrderCancelReasonValue,
  type OrderSystemCancelReasonValue,
  type OrderPaymentStatus,
  PAINEL_VISIBLE_PAYMENT_SQL,
  type RefundStateValue,
} from "./schema";

// ---- Máquina de estados (igual a @foode/shared/order/status.ts) ----

export type OrderStatus =
  "received" | "preparing" | "ready_for_pickup" | "out_for_delivery" | "completed" | "cancelled";
export type OrderFulfillment = "delivery" | "pickup";
export type OrderPaymentMethod = "pix" | "credit" | "on_delivery";

export const ORDER_TRANSITIONS: Readonly<
  Record<OrderFulfillment, Readonly<Record<OrderStatus, readonly OrderStatus[]>>>
> = {
  delivery: {
    received: ["preparing", "cancelled"],
    preparing: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["completed", "cancelled"],
    ready_for_pickup: [],
    completed: [],
    cancelled: [],
  },
  pickup: {
    received: ["preparing", "cancelled"],
    preparing: ["ready_for_pickup", "cancelled"],
    ready_for_pickup: ["completed", "cancelled"],
    out_for_delivery: [],
    completed: [],
    cancelled: [],
  },
};

const ACTIVE_STATUSES = ["received", "preparing", "ready_for_pickup", "out_for_delivery"] as const;

// ---- Configuração operacional ----

export type OperationPause =
  | { paused: false }
  | {
      paused: true;
      pausedAt: string;
      pausedBy: { userId: string; name: string; role: "owner" | "operator" };
    };

export type OperationPeriod = { weekday: number; opensAt: string; closesAt: string };
export type OperationNeighborhood = { id: string; name: string; feeCents: number; active: boolean };
export type OperationEta = { minMinutes: number; maxMinutes: number };

/** Mesma forma de `StoreOperationSettings` (@foode/shared/order). */
export type OperationSettings = {
  pause: OperationPause;
  hours: OperationPeriod[];
  pickupEnabled: boolean;
  deliveryMode: DeliveryMode | null;
  fixedFeeCents: number | null;
  neighborhoods: OperationNeighborhood[];
  deliveryMinimumOrderCents: number | null;
  deliveryEta: OperationEta | null;
  pickupEta: OperationEta | null;
  cardBrands: { debit: string[]; credit: string[] };
  printOnAccept: boolean;
  /** R$/km do Delivery em centavos (decisão 73); null = não configurado. */
  deliveryRatePerKmCents: number | null;
};

export type FulfillmentSettingsData = {
  pickupEnabled: boolean;
  deliveryMode: DeliveryMode | null;
  fixedFeeCents: number | null;
  /** Lista completa: com `id` atualiza, sem `id` cria, ausente apaga. `normalizedName` vem da api. */
  neighborhoods: Array<{
    id?: string | undefined;
    name: string;
    normalizedName: string;
    feeCents: number;
    active: boolean;
  }>;
  deliveryMinimumOrderCents: number | null;
  deliveryEta: OperationEta | null;
  pickupEta: OperationEta | null;
};

/** Ações de auditoria (iguais a STORE_OPERATION_AUDIT_ACTIONS de @foode/shared/order). */
export const STORE_OPERATION_AUDIT = {
  pause: "store.pause",
  resume: "store.resume",
  hours: "store.hours.update",
  fulfillment: "store.fulfillment.update",
  cardBrands: "store.card_brands.update",
  printOnAccept: "store.print_on_accept.update",
  deliveryRate: "store.delivery_rate.update",
} as const;

export type OperationResult<T> =
  { ok: true; data: T } | { ok: false; error: "not_found" | "conflict" | "invalid_input" };

type SettingsRow = {
  paused: number;
  pausedAt: string | null;
  pausedByUserId: string | null;
  pausedByRole: "owner" | "operator" | null;
  pausedByName: string | null;
  pickupEnabled: number;
  deliveryMode: DeliveryMode | null;
  fixedFeeCents: number | null;
  minimumOrderCents: number | null;
  deliveryEtaMin: number | null;
  deliveryEtaMax: number | null;
  pickupEtaMin: number | null;
  pickupEtaMax: number | null;
  debitBrands: string;
  creditBrands: string;
  printOnAccept: number;
  deliveryRatePerKmCents: number | null;
};
type NeighborhoodRow = { id: string; name: string; feeCents: number; active: number };

const SELECT_SETTINGS = `SELECT st.paused AS paused, st.paused_at AS pausedAt,
  st.paused_by_user_id AS pausedByUserId, st.paused_by_role AS pausedByRole, u.name AS pausedByName,
  st.pickup_enabled AS pickupEnabled, st.delivery_mode AS deliveryMode,
  st.delivery_fixed_fee_cents AS fixedFeeCents, st.delivery_minimum_order_cents AS minimumOrderCents,
  st.delivery_eta_min_minutes AS deliveryEtaMin, st.delivery_eta_max_minutes AS deliveryEtaMax,
  st.pickup_eta_min_minutes AS pickupEtaMin, st.pickup_eta_max_minutes AS pickupEtaMax,
  st.debit_brands AS debitBrands, st.credit_brands AS creditBrands, st.print_on_accept AS printOnAccept,
  st.delivery_rate_per_km_cents AS deliveryRatePerKmCents
  FROM store_operation_settings st LEFT JOIN users u ON u.id = st.paused_by_user_id
  WHERE st.store_id = ?`;
const SELECT_HOURS = `SELECT weekday, opens_at AS opensAt, closes_at AS closesAt
  FROM store_opening_periods WHERE store_id = ? ORDER BY weekday, opens_at`;
const SELECT_NEIGHBORHOODS = `SELECT id, name, fee_cents AS feeCents, active
  FROM delivery_neighborhoods WHERE store_id = ? ORDER BY position, name`;

function eta(min: number | null, max: number | null): OperationEta | null {
  return min === null || max === null ? null : { minMinutes: min, maxMinutes: max };
}

function brandList(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** Monta a configuração a partir das linhas (Loja sem linha de configuração = tudo desligado). */
export function buildOperationSettings(
  row: SettingsRow | undefined,
  hours: OperationPeriod[],
  neighborhoods: NeighborhoodRow[],
): OperationSettings {
  const pause: OperationPause =
    row && row.paused === 1 && row.pausedAt && row.pausedByUserId && row.pausedByRole
      ? {
          paused: true,
          pausedAt: row.pausedAt,
          pausedBy: {
            userId: row.pausedByUserId,
            name: row.pausedByName ?? "",
            role: row.pausedByRole,
          },
        }
      : { paused: false };
  return {
    pause,
    hours,
    pickupEnabled: row?.pickupEnabled === 1,
    deliveryMode: row?.deliveryMode ?? null,
    fixedFeeCents: row?.fixedFeeCents ?? null,
    neighborhoods: neighborhoods.map((n) => ({
      id: n.id,
      name: n.name,
      feeCents: n.feeCents,
      active: n.active === 1,
    })),
    deliveryMinimumOrderCents: row?.minimumOrderCents ?? null,
    deliveryEta: row ? eta(row.deliveryEtaMin, row.deliveryEtaMax) : null,
    pickupEta: row ? eta(row.pickupEtaMin, row.pickupEtaMax) : null,
    cardBrands: {
      debit: row ? brandList(row.debitBrands) : [],
      credit: row ? brandList(row.creditBrands) : [],
    },
    printOnAccept: row?.printOnAccept === 1,
    deliveryRatePerKmCents: row?.deliveryRatePerKmCents ?? null,
  };
}

/** Lê a configuração operacional de uma Loja num `batch` (um snapshot só). */
export async function readOperationSettings(
  d1: D1Database,
  storeId: string,
): Promise<OperationSettings> {
  const [settings, hours, neighborhoods] = await d1.batch([
    d1.prepare(SELECT_SETTINGS).bind(storeId),
    d1.prepare(SELECT_HOURS).bind(storeId),
    d1.prepare(SELECT_NEIGHBORHOODS).bind(storeId),
  ]);
  return buildOperationSettings(
    (settings?.results as SettingsRow[] | undefined)?.[0],
    (hours?.results ?? []) as OperationPeriod[],
    (neighborhoods?.results ?? []) as NeighborhoodRow[],
  );
}

function changed(result: D1Result | undefined): boolean {
  return (result?.meta.changes ?? 0) > 0;
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return message.includes("UNIQUE constraint failed");
}

/** Configuração operacional da Loja do contexto. */
export function createOperationOps(d1: D1Database, context: StoreContext) {
  assertIssued(context);
  const storeId = context.storeId;
  const actor = context.userId;

  function requireOwner(): void {
    if (context.role !== "owner") throw new FoodeDbError("forbidden");
  }

  /** Garante a linha de configuração (Loja nova começa com tudo desligado). */
  function ensureRow(): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO store_operation_settings (store_id) VALUES (?) ON CONFLICT(store_id) DO NOTHING`,
      )
      .bind(storeId);
  }

  function audit(action: string, now: string, metadata: Record<string, unknown> = {}) {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, 'store', ?, ?)`,
      )
      .bind(newId(), now, actor, storeId, action, storeId, JSON.stringify(metadata));
  }

  return {
    get: (): Promise<OperationSettings> => readOperationSettings(d1, storeId),

    /**
     * Liga/retoma a Pausa (Dono e Operador). Idempotente: pedir o estado atual não grava nem
     * audita. A auditoria leva o papel e só é gravada se esta chamada mudou o estado.
     */
    async setPause(paused: boolean): Promise<OperationPause> {
      const now = utcNow();
      const role = context.role;
      if (paused) {
        await d1.batch([
          ensureRow(),
          d1
            .prepare(
              `UPDATE store_operation_settings
               SET paused = 1, paused_at = ?, paused_by_user_id = ?, paused_by_role = ?, updated_at = ?
               WHERE store_id = ? AND paused = 0`,
            )
            .bind(now, actor, role, now, storeId),
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, store_id, ?, 'store', store_id, json_object('role', ?)
               FROM store_operation_settings
               WHERE store_id = ? AND paused = 1 AND paused_at = ? AND paused_by_user_id = ?`,
            )
            .bind(newId(), now, actor, STORE_OPERATION_AUDIT.pause, role, storeId, now, actor),
        ]);
      } else {
        await d1.batch([
          ensureRow(),
          d1
            .prepare(
              `UPDATE store_operation_settings
               SET paused = 0, paused_at = NULL, paused_by_user_id = NULL, paused_by_role = NULL, updated_at = ?
               WHERE store_id = ? AND paused = 1`,
            )
            .bind(now, storeId),
          d1
            .prepare(
              `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
               SELECT ?, ?, ?, store_id, ?, 'store', store_id, json_object('role', ?)
               FROM store_operation_settings WHERE store_id = ? AND paused = 0 AND updated_at = ?`,
            )
            .bind(newId(), now, actor, STORE_OPERATION_AUDIT.resume, role, storeId, now),
        ]);
      }
      return (await readOperationSettings(d1, storeId)).pause;
    },

    /** Grade inteira, atômica (decisão 58): apaga e regrava num batch. Só Dono. */
    async setHours(periods: OperationPeriod[]): Promise<void> {
      requireOwner();
      const now = utcNow();
      await d1.batch([
        d1.prepare("DELETE FROM store_opening_periods WHERE store_id = ?").bind(storeId),
        ...periods.map((period) =>
          d1
            .prepare(
              `INSERT INTO store_opening_periods (id, store_id, weekday, opens_at, closes_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .bind(newId(), storeId, period.weekday, period.opensAt, period.closesAt, now),
        ),
        audit(STORE_OPERATION_AUDIT.hours, now, { periods: periods.length }),
      ]);
    },

    /**
     * Seção "Entrega" (só Dono): Retirada, modo do Delivery, Taxa fixa, bairros (lista completa),
     * mínimo e tempos. Bairro com `id` de outra Loja/inexistente = `not_found`; nome repetido =
     * `conflict`. Tudo num batch: ou grava inteiro ou nada.
     */
    async setFulfillment(input: FulfillmentSettingsData): Promise<OperationResult<null>> {
      requireOwner();
      const { results: current } = await d1
        .prepare("SELECT id FROM delivery_neighborhoods WHERE store_id = ?")
        .bind(storeId)
        .all<{ id: string }>();
      const currentIds = new Set(current.map((row) => row.id));
      const keptIds = input.neighborhoods.flatMap((n) => (n.id ? [n.id] : []));
      if (keptIds.some((id) => !currentIds.has(id))) return { ok: false, error: "not_found" };

      const now = utcNow();
      const statements: D1PreparedStatement[] = [
        ensureRow(),
        d1
          .prepare(
            `UPDATE store_operation_settings SET pickup_enabled = ?, delivery_mode = ?,
               delivery_fixed_fee_cents = ?, delivery_minimum_order_cents = ?,
               delivery_eta_min_minutes = ?, delivery_eta_max_minutes = ?,
               pickup_eta_min_minutes = ?, pickup_eta_max_minutes = ?, updated_at = ?
             WHERE store_id = ?`,
          )
          .bind(
            input.pickupEnabled ? 1 : 0,
            input.deliveryMode,
            input.fixedFeeCents,
            input.deliveryMinimumOrderCents,
            input.deliveryEta?.minMinutes ?? null,
            input.deliveryEta?.maxMinutes ?? null,
            input.pickupEta?.minMinutes ?? null,
            input.pickupEta?.maxMinutes ?? null,
            now,
            storeId,
          ),
        d1
          .prepare(
            `DELETE FROM delivery_neighborhoods WHERE store_id = ?
             AND id NOT IN (SELECT value FROM json_each(?))`,
          )
          .bind(storeId, JSON.stringify(keptIds)),
        // Nome provisório único antes de regravar: troca de nomes entre bairros não esbarra no
        // UNIQUE (store_id, normalized_name) no meio do batch.
        d1
          .prepare(
            `UPDATE delivery_neighborhoods SET normalized_name = '~' || id WHERE store_id = ?`,
          )
          .bind(storeId),
      ];
      input.neighborhoods.forEach((n, position) => {
        statements.push(
          n.id
            ? d1
                .prepare(
                  `UPDATE delivery_neighborhoods SET name = ?, normalized_name = ?, fee_cents = ?,
                     active = ?, position = ?, updated_at = ? WHERE id = ? AND store_id = ?`,
                )
                .bind(
                  n.name,
                  n.normalizedName,
                  n.feeCents,
                  n.active ? 1 : 0,
                  position,
                  now,
                  n.id,
                  storeId,
                )
            : d1
                .prepare(
                  `INSERT INTO delivery_neighborhoods (id, store_id, name, normalized_name, fee_cents, active, position, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                )
                .bind(
                  newId(),
                  storeId,
                  n.name,
                  n.normalizedName,
                  n.feeCents,
                  n.active ? 1 : 0,
                  position,
                  now,
                  now,
                ),
        );
      });
      statements.push(
        audit(STORE_OPERATION_AUDIT.fulfillment, now, {
          pickupEnabled: input.pickupEnabled,
          deliveryMode: input.deliveryMode,
          neighborhoods: input.neighborhoods.length,
          activeNeighborhoods: input.neighborhoods.filter((n) => n.active).length,
        }),
      );
      try {
        await d1.batch(statements);
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, error: "conflict" };
        throw error;
      }
      return { ok: true, data: null };
    },

    /** Bandeiras da maquininha (só Dono). */
    async setCardBrands(input: { debit: string[]; credit: string[] }): Promise<void> {
      requireOwner();
      const now = utcNow();
      await d1.batch([
        ensureRow(),
        d1
          .prepare(
            `UPDATE store_operation_settings SET debit_brands = ?, credit_brands = ?, updated_at = ?
             WHERE store_id = ?`,
          )
          .bind(JSON.stringify(input.debit), JSON.stringify(input.credit), now, storeId),
        audit(STORE_OPERATION_AUDIT.cardBrands, now, { debit: input.debit, credit: input.credit }),
      ]);
    },

    /** "Imprimir ao aceitar" (só Dono). */
    async setPrintOnAccept(printOnAccept: boolean): Promise<void> {
      requireOwner();
      const now = utcNow();
      await d1.batch([
        ensureRow(),
        d1
          .prepare(
            `UPDATE store_operation_settings SET print_on_accept = ?, updated_at = ? WHERE store_id = ?`,
          )
          .bind(printOnAccept ? 1 : 0, now, storeId),
        audit(STORE_OPERATION_AUDIT.printOnAccept, now, { printOnAccept }),
      ]);
    },

    /**
     * R$/km do Delivery (decisão 73; só Dono). `null` limpa. Idempotente: o mesmo valor não grava
     * nem audita. O valor (1..MENU_MAX_CENTS) já vem validado pelo Zod; o UPDATE confere de novo.
     */
    async setDeliveryRate(ratePerKmCents: number | null): Promise<void> {
      requireOwner();
      if (
        ratePerKmCents !== null &&
        !(Number.isSafeInteger(ratePerKmCents) && ratePerKmCents > 0)
      ) {
        throw new FoodeDbError("invalid_input", "R$/km inválido");
      }
      const current = await readOperationSettings(d1, storeId);
      if (current.deliveryRatePerKmCents === ratePerKmCents) return;
      const now = utcNow();
      await d1.batch([
        ensureRow(),
        audit(STORE_OPERATION_AUDIT.deliveryRate, now, {
          before: current.deliveryRatePerKmCents,
          after: ratePerKmCents,
        }),
        d1
          .prepare(
            `UPDATE store_operation_settings SET delivery_rate_per_km_cents = ?, updated_at = ?
             WHERE store_id = ?`,
          )
          .bind(ratePerKmCents, now, storeId),
      ]);
    },
  };
}

// ---- Pedidos no Painel ----

export type OrderLineData = {
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  complements: Array<{ groupName: string; optionName: string; priceCents: number }>;
  additionals: Array<{ name: string; priceCents: number }>;
};

export type OrderAddressData = {
  postalCode: string | null;
  street: string;
  number: string;
  complement: string | null;
  reference: string | null;
  neighborhood: string;
};

export type OrderQueueRow = {
  id: string;
  code: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  createdAt: string;
  customerName: string;
  neighborhood: string | null;
  paymentMethod: OrderPaymentMethod;
  totalCents: number;
  /** Estado gravado do Estorno mais recente (Ticket 12); null = sem Estorno. */
  refundState: RefundStateValue | null;
};

export type OrderDetailRow = Omit<OrderQueueRow, "neighborhood" | "refundState"> & {
  customerPhone: string;
  address: OrderAddressData | null;
  lines: OrderLineData[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  /** Tarifa de serviço do pagamento online (decisão 71): item da Foode, fora do total. */
  serviceFeeCents: number;
  changeForCents: number | null;
  note: string | null;
  eta: OperationEta | null;
  /** Estado do pagamento online (Ticket 26): base da pré-visualização do cancelamento. */
  paymentStatus: OrderPaymentStatus;
  /** Motivo e instante do cancelamento (Ticket 12); null fora do Cancelado. */
  cancellation: {
    reason: OrderCancelReasonValue | OrderSystemCancelReasonValue | null;
    at: string;
  } | null;
  /** Estorno mais recente do Pedido (Ticket 12); null = sem Estorno. */
  refund: { state: RefundStateValue; amountCents: number } | null;
  history: Array<{
    from: OrderStatus | null;
    to: OrderStatus;
    at: string;
    actor: { name: string; role: "owner" | "operator" } | null;
  }>;
};

export type OrderTransitionData = {
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  printOnAccept: boolean;
};

type OrderRowFull = {
  id: string;
  code: number;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  paymentMethod: OrderPaymentMethod;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  neighborhood: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  serviceFeeCents: number;
  changeForCents: number | null;
  note: string | null;
  etaMin: number | null;
  etaMax: number | null;
};
type LineRow = {
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  complements: string;
  additionals: string;
};

export const SELECT_ORDER_COLUMNS = `o.id AS id, o.code AS code, o.status AS status,
  o.fulfillment AS fulfillment, o.created_at AS createdAt, o.customer_name AS customerName,
  o.customer_phone_e164 AS customerPhone, o.payment_method AS paymentMethod,
  o.delivery_postal_code AS postalCode, o.delivery_street AS street, o.delivery_number AS number,
  o.delivery_complement AS complement, o.delivery_reference AS reference,
  o.delivery_neighborhood AS neighborhood, o.items_subtotal_cents AS subtotalCents,
  o.delivery_fee_cents AS deliveryFeeCents, o.discount_cents AS discountCents,
  o.total_cents AS totalCents, o.change_for_cents AS changeForCents, o.note AS note,
  o.eta_min_minutes AS etaMin, o.eta_max_minutes AS etaMax,
  o.service_fee_cents AS serviceFeeCents, o.payment_status AS paymentStatus`;

export const SELECT_ORDER_LINES = `SELECT item_name AS itemName, quantity,
  unit_price_cents AS unitPriceCents, line_total_cents AS totalCents, complements, additionals
  FROM order_lines WHERE store_id = ? AND order_id = ? ORDER BY position`;

function jsonArray<T>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function toOrderLines(rows: LineRow[]): OrderLineData[] {
  return rows.map((row) => ({
    itemName: row.itemName,
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    totalCents: row.totalCents,
    complements: jsonArray(row.complements),
    additionals: jsonArray(row.additionals),
  }));
}

export function toOrderAddress(row: {
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  reference: string | null;
  neighborhood: string | null;
}): OrderAddressData | null {
  if (row.street === null || row.number === null || row.neighborhood === null) return null;
  return {
    postalCode: row.postalCode,
    street: row.street,
    number: row.number,
    complement: row.complement,
    reference: row.reference,
    neighborhood: row.neighborhood,
  };
}

export type OrderRowView = OrderRowFull;
export type OrderLineRowView = LineRow;

/** Pedidos da Loja do contexto (Dono e Operador). */
export function createOrderOps(d1: D1Database, context: StoreContext) {
  assertIssued(context);
  const storeId = context.storeId;
  const actor = context.userId;

  async function transition(
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
  ): Promise<OperationResult<OrderTransitionData>> {
    const fulfillments = (Object.keys(ORDER_TRANSITIONS) as OrderFulfillment[]).filter((f) =>
      ORDER_TRANSITIONS[f][from].includes(to),
    );
    if (fulfillments.length === 0) {
      // Pode ser estado final (nada sai dele) ou destino inválido: confere se o Pedido existe.
      const row = await d1
        .prepare(
          `SELECT status FROM orders WHERE id = ? AND store_id = ? AND ${PAINEL_VISIBLE_PAYMENT_SQL}`,
        )
        .bind(orderId, storeId)
        .first<{ status: OrderStatus }>();
      if (!row) return { ok: false, error: "not_found" };
      if (row.status !== from) return { ok: false, error: "conflict" };
      return { ok: false, error: "invalid_input" };
    }
    const now = utcNow();
    const [update] = await d1.batch([
      d1
        .prepare(
          `UPDATE orders SET status = ?, updated_at = ?
           WHERE id = ? AND store_id = ? AND status = ? AND ${PAINEL_VISIBLE_PAYMENT_SQL}
             AND fulfillment IN (SELECT value FROM json_each(?))`,
        )
        .bind(to, now, orderId, storeId, from, JSON.stringify(fulfillments)),
      d1
        .prepare(
          `INSERT INTO order_status_events (id, store_id, order_id, from_status, to_status, actor_user_id, actor_role, occurred_at)
           SELECT ?, store_id, id, ?, ?, ?, ?, ? FROM orders
           WHERE id = ? AND store_id = ? AND status = ? AND updated_at = ?`,
        )
        .bind(newId(), from, to, actor, context.role, now, orderId, storeId, to, now),
    ]);
    if (!changed(update)) {
      const row = await d1
        .prepare(
          `SELECT status FROM orders WHERE id = ? AND store_id = ? AND ${PAINEL_VISIBLE_PAYMENT_SQL}`,
        )
        .bind(orderId, storeId)
        .first<{ status: OrderStatus }>();
      if (!row) return { ok: false, error: "not_found" };
      if (row.status !== from) return { ok: false, error: "conflict" };
      return { ok: false, error: "invalid_input" };
    }
    const after = await d1
      .prepare(
        `SELECT o.fulfillment AS fulfillment, COALESCE(st.print_on_accept, 0) AS printOnAccept
         FROM orders o LEFT JOIN store_operation_settings st ON st.store_id = o.store_id
         WHERE o.id = ? AND o.store_id = ?`,
      )
      .bind(orderId, storeId)
      .first<{ fulfillment: OrderFulfillment; printOnAccept: number }>();
    return {
      ok: true,
      data: {
        status: to,
        fulfillment: after?.fulfillment ?? fulfillments[0]!,
        printOnAccept: after?.printOnAccept === 1,
      },
    };
  }

  return {
    /**
     * Fila (`active`, mais antigo primeiro) ou fechados desde `closedSince` (início do dia civil
     * de São Paulo, calculado pela api), com contagem do dia. Até 200 Pedidos.
     */
    async list(input: {
      filter: "all" | "delivery" | "pickup";
      scope: "active" | "closed_today";
      closedSince: string;
    }): Promise<{
      orders: OrderQueueRow[];
      closedToday: { completed: number; cancelled: number };
    }> {
      const fulfillmentFilter = input.filter === "all" ? null : input.filter;
      const base = `SELECT id, code, status, fulfillment, created_at AS createdAt,
        customer_name AS customerName, delivery_neighborhood AS neighborhood,
        payment_method AS paymentMethod, total_cents AS totalCents,
        (SELECT r.state FROM refunds r WHERE r.store_id = orders.store_id
          AND r.order_id = orders.id ORDER BY r.created_at DESC, r.rowid DESC LIMIT 1) AS refundState
        FROM orders WHERE store_id = ? AND ${PAINEL_VISIBLE_PAYMENT_SQL}
          AND (? IS NULL OR fulfillment = ?)`;
      const listStatement =
        input.scope === "active"
          ? d1
              .prepare(
                `${base} AND status IN (SELECT value FROM json_each(?)) ORDER BY created_at, code LIMIT 200`,
              )
              .bind(storeId, fulfillmentFilter, fulfillmentFilter, JSON.stringify(ACTIVE_STATUSES))
          : d1
              .prepare(
                `${base} AND status IN ('completed', 'cancelled') AND updated_at >= ?
                 ORDER BY updated_at DESC, code DESC LIMIT 200`,
              )
              .bind(storeId, fulfillmentFilter, fulfillmentFilter, input.closedSince);
      const [list, counts] = await d1.batch([
        listStatement,
        d1
          .prepare(
            `SELECT COALESCE(SUM(status = 'completed'), 0) AS completed,
                    COALESCE(SUM(status = 'cancelled'), 0) AS cancelled
             FROM orders WHERE store_id = ? AND status IN ('completed', 'cancelled')
               AND ${PAINEL_VISIBLE_PAYMENT_SQL}
               AND updated_at >= ? AND (? IS NULL OR fulfillment = ?)`,
          )
          .bind(storeId, input.closedSince, fulfillmentFilter, fulfillmentFilter),
      ]);
      const count = (
        counts?.results as { completed: number; cancelled: number }[] | undefined
      )?.[0];
      return {
        orders: (list?.results ?? []) as OrderQueueRow[],
        closedToday: { completed: count?.completed ?? 0, cancelled: count?.cancelled ?? 0 },
      };
    },

    /** Detalhe com linhas e histórico (quem e papel); null = de outra Loja ou inexistente. */
    async get(orderId: string): Promise<OrderDetailRow | null> {
      const [order, lines, events, cancellation, refund] = await d1.batch([
        d1
          .prepare(
            `SELECT ${SELECT_ORDER_COLUMNS} FROM orders o
             WHERE o.id = ? AND o.store_id = ? AND o.${PAINEL_VISIBLE_PAYMENT_SQL}`,
          )
          .bind(orderId, storeId),
        d1.prepare(SELECT_ORDER_LINES).bind(storeId, orderId),
        d1
          .prepare(
            `SELECT e.from_status AS "from", e.to_status AS "to", e.occurred_at AS at,
                    e.actor_role AS actorRole, u.name AS actorName
             FROM order_status_events e LEFT JOIN users u ON u.id = e.actor_user_id
             WHERE e.store_id = ? AND e.order_id = ? ORDER BY e.rowid`,
          )
          .bind(storeId, orderId),
        d1
          .prepare(
            // Motivo de sistema fora do CHECK de `reason` (0011): o contrato vê um motivo só.
            `SELECT COALESCE(system_reason, reason) AS reason, cancelled_at AS at
             FROM order_cancellations WHERE store_id = ? AND order_id = ?`,
          )
          .bind(storeId, orderId),
        d1
          .prepare(
            `SELECT state, amount_cents AS amountCents FROM refunds
             WHERE store_id = ? AND order_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
          )
          .bind(storeId, orderId),
      ]);
      const row = (
        order?.results as (OrderRowFull & { paymentStatus: OrderPaymentStatus })[] | undefined
      )?.[0];
      if (!row) return null;
      type EventRow = {
        from: OrderStatus | null;
        to: OrderStatus;
        at: string;
        actorRole: "owner" | "operator" | null;
        actorName: string | null;
      };
      return {
        id: row.id,
        code: row.code,
        status: row.status,
        fulfillment: row.fulfillment,
        createdAt: row.createdAt,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        paymentMethod: row.paymentMethod,
        totalCents: row.totalCents,
        address: toOrderAddress(row),
        lines: toOrderLines((lines?.results ?? []) as LineRow[]),
        subtotalCents: row.subtotalCents,
        deliveryFeeCents: row.deliveryFeeCents,
        discountCents: row.discountCents,
        serviceFeeCents: row.serviceFeeCents,
        changeForCents: row.changeForCents,
        note: row.note,
        eta: eta(row.etaMin, row.etaMax),
        paymentStatus: row.paymentStatus,
        cancellation:
          (
            cancellation?.results as
              | {
                  reason: OrderCancelReasonValue | OrderSystemCancelReasonValue | null;
                  at: string;
                }[]
              | undefined
          )?.[0] ?? null,
        refund:
          (
            refund?.results as { state: RefundStateValue; amountCents: number }[] | undefined
          )?.[0] ?? null,
        history: ((events?.results ?? []) as EventRow[]).map((event) => ({
          from: event.from,
          to: event.to,
          at: event.at,
          actor: event.actorRole ? { name: event.actorName ?? "", role: event.actorRole } : null,
        })),
      };
    },

    /**
     * Avança o Pedido: só destino válido do Fulfillment (senão `invalid_input`), só a partir do
     * estado que o Painel viu (senão `conflict`), com evento de quem e papel. Cancelar = `cancel`.
     */
    advance(orderId: string, from: OrderStatus, to: OrderStatus) {
      if (to === "cancelled") {
        return Promise.resolve<OperationResult<OrderTransitionData>>({
          ok: false,
          error: "invalid_input",
        });
      }
      return transition(orderId, from, to);
    },

    /**
     * Cancela (Ticket 12): Pedido, histórico, motivo, obrigação de Estorno de cada cobrança paga e
     * reversão do Ledger num único batch (refund-db.ts). Já final ou ≠ `from` = `conflict`.
     */
    cancel(input: CancelOrderDbInput) {
      return cancelOrderWithRefund(d1, context, input);
    },
  };
}
