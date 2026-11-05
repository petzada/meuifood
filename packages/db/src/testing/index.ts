// Fixture "app com duas Lojas" para testes com D1 (vitest-plugin, só no CI).
// Grava direto pelo Drizzle porque é setup de teste; o código de produção passa por
// createFoodeDb. Só testes importam `@foode/db/testing` (regra de lint).
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { newId } from "../conventions";
import {
  auditEvents,
  ledgerEntries,
  ledgerEntryPayouts,
  storeMemberships,
  stores,
  users,
} from "../schema";

export type TwoStoresFixture = Awaited<ReturnType<typeof seedTwoStores>>;

export async function seedTwoStores(d1: D1Database) {
  const db = drizzle(d1);
  const suffix = newId().slice(0, 8);

  const storeA = {
    id: newId(),
    slug: `loja-a-${suffix}`,
    name: "Loja A",
    status: "active" as const,
  };
  const storeB = {
    id: newId(),
    slug: `loja-b-${suffix}`,
    name: "Loja B",
    status: "active" as const,
  };
  const ownerA = { id: newId(), email: `dono-a-${suffix}@foode.test`, name: "Dono A" };
  const ownerB = { id: newId(), email: `dono-b-${suffix}@foode.test`, name: "Dono B" };
  const operatorA = { id: newId(), email: `operador-a-${suffix}@foode.test`, name: "Operador A" };
  // Mesmo usuário em duas Lojas: Dono de A e Operador de B (multi-Loja).
  const multi = { id: newId(), email: `multi-${suffix}@foode.test`, name: "Multi" };
  const ops = {
    id: newId(),
    email: `ops-${suffix}@foode.test`,
    name: "Ops",
    platformRole: "foode_ops" as const,
  };

  const memberships = {
    ownerA: { id: newId(), storeId: storeA.id, userId: ownerA.id, role: "owner" as const },
    operatorA: { id: newId(), storeId: storeA.id, userId: operatorA.id, role: "operator" as const },
    multiA: { id: newId(), storeId: storeA.id, userId: multi.id, role: "owner" as const },
    ownerB: { id: newId(), storeId: storeB.id, userId: ownerB.id, role: "owner" as const },
    multiB: { id: newId(), storeId: storeB.id, userId: multi.id, role: "operator" as const },
  };

  const auditB = {
    id: newId(),
    storeId: storeB.id,
    actorUserId: ownerB.id,
    action: "fixture.segredo_da_loja_b",
  };

  await db.batch([
    db.insert(stores).values([storeA, storeB]),
    db.insert(users).values([ownerA, ownerB, operatorA, multi, ops]),
    db.insert(storeMemberships).values(Object.values(memberships)),
    db.insert(auditEvents).values(auditB),
  ]);

  return { storeA, storeB, ownerA, ownerB, operatorA, multi, ops, memberships, auditB };
}

/** Cadastro válido de Loja (CNPJ/CPF com dígito verificador certo), já no formato normalizado. */
export function storeProfileFixture() {
  return {
    cnpj: "11222333000181",
    whatsapp: "5511987654321",
    address: {
      postalCode: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      complement: null,
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    payout: {
      pixKey: { type: "cpf" as const, value: "52998224725" },
      holderName: "Titular do Repasse",
      holderDocument: "52998224725",
    },
  };
}

/**
 * Marca como repassado ao lojista o lançamento do Ledger da intenção (o que o lote pago do
 * Ticket 14 fará): base do "Estorno depois do repasse" (débito compensado, Ticket 12).
 */
export async function markLedgerPaidOut(d1: D1Database, intentId: string, paidOutAt: string) {
  const db = drizzle(d1);
  const [entry] = await db
    .select({ id: ledgerEntries.id, storeId: ledgerEntries.storeId })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.intentId, intentId));
  if (!entry) throw new Error("lançamento esperado no Ledger");
  await db
    .insert(ledgerEntryPayouts)
    .values({ ledgerEntryId: entry.id, storeId: entry.storeId, paidOutAt });
}

// ---- Financeiro (Ticket 14): Pedidos com lançamento no Ledger, contas e funil -------------------

function hex64(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}

function digits(length: number): string {
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => String(value % 10)).join("");
}

/** Conta do Consumidor na Foode (nome, telefone e CPF aleatórios e únicos). */
export async function seedCustomerAccount(d1: D1Database, name: string): Promise<string> {
  const id = newId();
  await d1
    .prepare(`INSERT INTO customer_accounts (id, phone_e164, cpf, name) VALUES (?, ?, ?, ?)`)
    .bind(id, `55119${digits(8)}`, digits(11), name)
    .run();
  return id;
}

export type FinanceOrderSeed = {
  storeId: string;
  /** Instante ISO UTC da criação do Pedido. */
  createdAt: string;
  status?: "received" | "preparing" | "ready_for_pickup" | "completed" | "cancelled";
  method?: "pix" | "credit" | "on_delivery";
  totalCents: number;
  customerName?: string;
  customerAccountId?: string | null;
  lines?: { menuItemId?: string | null; name: string; quantity: number; unitPriceCents: number }[];
  /** Lançamento do Ledger (só meios online pagos). */
  ledger?: {
    foodeFeeCents: number;
    providerCostCents?: number | null;
    releaseDate: string;
    expectedPayoutDate: string;
    cardMode?: "normal" | "rapido";
    retentions?: { amountCents: number; releaseDate: string; expectedPayoutDate: string }[];
  };
};

/**
 * Pedido de Retirada já gravado como o checkout gravaria (código sequencial por Loja, linhas,
 * intenção paga e lançamento do Ledger no PIX/Cartão). Setup de teste: escreve direto no D1.
 */
export async function seedFinanceOrder(d1: D1Database, seed: FinanceOrderSeed) {
  const method = seed.method ?? "pix";
  const online = method !== "on_delivery";
  const serviceFee = online ? 150 : 0;
  const orderId = newId();
  const statements: D1PreparedStatement[] = [
    d1
      .prepare(
        `INSERT INTO orders (id, store_id, code, access_token_hash, idempotency_key,
           idempotency_payload_hash, status, fulfillment, payment_method, customer_name,
           customer_phone_e164, items_subtotal_cents, total_cents, customer_account_id,
           payment_status, service_fee_cents, created_at, updated_at)
         SELECT ?, ?, coalesce(max(code), 0) + 1, ?, ?, ?, ?, 'pickup', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         FROM orders WHERE store_id = ?`,
      )
      .bind(
        orderId,
        seed.storeId,
        hex64(),
        newId(),
        hex64(),
        seed.status ?? "completed",
        method,
        seed.customerName ?? "Cliente Guest",
        `55119${digits(8)}`,
        seed.totalCents,
        seed.totalCents,
        seed.customerAccountId ?? null,
        online ? "paid" : "not_required",
        serviceFee,
        seed.createdAt,
        seed.createdAt,
        seed.storeId,
      ),
    ...(seed.lines ?? []).map((line, position) =>
      d1
        .prepare(
          `INSERT INTO order_lines (id, store_id, order_id, position, menu_item_id, item_name,
             unit_price_cents, quantity, line_total_cents, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId(),
          seed.storeId,
          orderId,
          position,
          line.menuItemId ?? null,
          line.name,
          line.unitPriceCents,
          line.quantity,
          line.unitPriceCents * line.quantity,
          seed.createdAt,
        ),
    ),
  ];
  let intentId: string | null = null;
  let ledgerEntryId: string | null = null;
  if (online && seed.ledger) {
    const ledger = seed.ledger;
    const feeId = newId();
    intentId = newId();
    ledgerEntryId = newId();
    const provider = method === "pix" || ledger.cardMode !== "normal" ? "abacatepay" : "efi";
    const cardMode = method === "credit" ? (ledger.cardMode ?? "rapido") : null;
    const charged = seed.totalCents + serviceFee;
    statements.push(
      d1
        .prepare(
          `INSERT INTO payment_fees (id, store_id, method, card_mode, percent_bps, fixed_cents,
             valid_from, valid_to)
           VALUES (?, ?, ?, ?, 0, 0, '2000-01-01T00:00:00.000Z', '2000-01-02T00:00:00.000Z')`,
        )
        .bind(feeId, seed.storeId, method, cardMode),
      d1
        .prepare(
          `INSERT INTO payment_intents (id, store_id, order_id, provider, method, card_mode,
             amount_cents, service_fee_cents, foode_fee_id, foode_fee_percent_bps,
             foode_fee_fixed_cents, state, provider_charge_id, paid_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 'paid', ?, ?, ?, ?)`,
        )
        .bind(
          intentId,
          seed.storeId,
          orderId,
          provider,
          method,
          cardMode,
          charged,
          serviceFee,
          feeId,
          `charge_${newId()}`,
          seed.createdAt,
          seed.createdAt,
          seed.createdAt,
        ),
      d1
        .prepare(
          `INSERT INTO ledger_entries (id, store_id, order_id, intent_id, kind, provider, method,
             card_mode, charged_cents, order_total_cents, service_fee_cents, foode_fee_cents,
             foode_fee_id, provider_cost_cents, net_cents, release_date, expected_payout_date,
             occurred_at, created_at)
           VALUES (?, ?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ledgerEntryId,
          seed.storeId,
          orderId,
          intentId,
          provider,
          method,
          cardMode,
          charged,
          seed.totalCents,
          serviceFee,
          ledger.foodeFeeCents,
          feeId,
          ledger.providerCostCents === undefined ? 54 : ledger.providerCostCents,
          seed.totalCents - ledger.foodeFeeCents,
          ledger.releaseDate,
          ledger.expectedPayoutDate,
          seed.createdAt,
          seed.createdAt,
        ),
      ...(ledger.retentions ?? []).map((retention) =>
        d1
          .prepare(
            `INSERT INTO ledger_retentions (id, store_id, order_id, ledger_entry_id,
               amount_cents, release_date, expected_payout_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            newId(),
            seed.storeId,
            orderId,
            ledgerEntryId,
            retention.amountCents,
            retention.releaseDate,
            retention.expectedPayoutDate,
            seed.createdAt,
          ),
      ),
    );
  }
  await d1.batch(statements);
  const row = await d1
    .prepare("SELECT code FROM orders WHERE id = ?")
    .bind(orderId)
    .first<{ code: number }>();
  return { orderId, code: row!.code, intentId, ledgerEntryId };
}

/** Contador agregado do funil (o que o Storefront grava, Ticket 28). */
export async function seedFunnelCounter(
  d1: D1Database,
  storeId: string,
  day: string,
  event: "visit" | "item_view" | "add_to_cart" | "checkout_start" | "order",
  count: number,
): Promise<void> {
  await d1
    .prepare(`INSERT INTO store_funnel_daily (store_id, day, event, count) VALUES (?, ?, ?, ?)`)
    .bind(storeId, day, event, count)
    .run();
}
