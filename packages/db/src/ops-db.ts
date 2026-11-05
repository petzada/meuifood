// Operações da área Ops (Ticket 29; decisões 60, 61, 62; ADR 0006/0007). Só existem atrás de um
// OpsContext emitido por este pacote (`db.ops(context)`), e toda mutação grava auditoria com
// `before`/`after` NO MESMO `batch` da escrita.
//
// O D1 não tem transação interativa: escrita que depende de leitura usa
// - INSERT…SELECT condicional (a condição é avaliada no banco, no mesmo batch atômico), ou
// - versão otimista (`stores.updated_at` / valor de `valid_to` lido): auditoria e UPDATE só
//   acontecem se a linha ainda estiver como foi lida; senão nada é gravado e volta `conflict`.
//
// Vigência meio-aberta [valid_from, valid_to) — mesma regra de `periodsOverlap` em
// @foode/shared/ops. A não-sobreposição por chave é conferida contra o que está gravado dentro do
// próprio INSERT…SELECT (o SQLite não tem exclusion constraint).
//
// Os tipos de entrada/saída repetem, estruturalmente, os de @foode/shared/ops (este pacote não
// depende de `@foode/shared`); a api valida a entrada com o Zod antes de chegar aqui.
import type { OpsContext } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";
import {
  ownerProfileOf,
  type OwnerProfileRow,
  slugChangeStatements,
  slugReservationGuard,
} from "./onboarding-db";
import type { BILLING_CYCLES, CardMode, StoreStatus } from "./schema";

type BillingCycle = (typeof BILLING_CYCLES)[number];
type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";
type FeePaymentMethod = "pix" | "credit";
type PaymentProvider = "abacatepay" | "efi";
type ProviderOperation = "pix_charge" | "card_charge" | "pix_payout";

// ---- Entradas (já validadas e normalizadas pelo Zod da api) ----

export type OpsStoreAddress = {
  postalCode: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
};

export type OpsPayoutAccount = {
  pixKey: { type: PixKeyType; value: string };
  holderName: string;
  holderDocument: string;
};

export type OpsStoreProfileData = {
  cnpj: string;
  whatsapp: string;
  address: OpsStoreAddress;
  payout: OpsPayoutAccount;
};

export type OpsCreateStoreData = OpsStoreProfileData & { slug: string; name: string };

export type OpsUpdateStoreData = {
  [K in keyof OpsCreateStoreData]?: OpsCreateStoreData[K] | undefined;
};

export type OpsPlanTierData = { minOrders: number; maxOrders: number | null; priceCents: number };

export type OpsPaymentFeeData = {
  method: FeePaymentMethod;
  cardMode: CardMode | null;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
};

export type OpsProviderCostData = {
  provider: PaymentProvider;
  operation: ProviderOperation;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
};

// ---- Leituras (mesma forma das views de @foode/shared/ops) ----

export const ONBOARDING_CHECKS = [
  "profile",
  "payout",
  "owner_invited",
  "owner_accepted",
  "plan",
  "card_mode",
  "pix_fee",
  "credit_fee",
] as const;
export type OnboardingCheck = (typeof ONBOARDING_CHECKS)[number];

/**
 * O que precisa estar feito para ativar a Loja (além da transição válida): cadastro completo
 * (perfil + conta de repasse), Dono convidado e Plano vigente. Taxas e modo do cartão não
 * bloqueiam: meio sem taxa vigente só fica fora do checkout (decisão 61).
 */
export const ACTIVATION_REQUIRED_CHECKS = [
  "profile",
  "payout",
  "owner_invited",
  "plan",
] as const satisfies readonly OnboardingCheck[];

export type OpsStorePlan = {
  id: string;
  cycle: BillingCycle;
  validFrom: string;
  validTo: string | null;
};

export type OpsStoreMonthTier = {
  month: string;
  orderCount: number;
  tier: OpsPlanTierData | null;
};

export type OpsStoreListRow = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  cnpj: string | null;
  cardMode: CardMode | null;
  plan: OpsStorePlan | null;
  monthTier: OpsStoreMonthTier | null;
  onboarding: { check: OnboardingCheck; done: boolean }[];
  createdAt: string;
};

export type OpsStoreOwner = {
  membershipId: string;
  userId: string;
  email: string;
  name: string;
  accepted: boolean;
};

export type OpsStoreDetailRow = OpsStoreListRow & {
  whatsapp: string | null;
  address: OpsStoreAddress | null;
  payout: {
    pixKeyType: PixKeyType;
    pixKey: string;
    holderName: string;
    holderDocument: string;
  } | null;
  owners: OpsStoreOwner[];
  planHistory: OpsStorePlan[];
  /** Respostas de perfil do Dono (Ticket 28, P-ONB-4); null = não respondidas. */
  ownerProfile: OwnerProfileRow | null;
  updatedAt: string;
};

export type OpsPlanTierTable = {
  validFrom: string;
  validTo: string | null;
  monthlyTiers: (OpsPlanTierData & { id: string })[];
  annual: { id: string; priceCents: number } | null;
};

export type OpsPaymentFeeRow = {
  id: string;
  storeId: string | null;
  method: FeePaymentMethod;
  cardMode: CardMode | null;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

export type OpsProviderCostRow = {
  id: string;
  provider: PaymentProvider;
  operation: ProviderOperation;
  percentBps: number;
  fixedCents: number;
  validFrom: string;
  validTo: string | null;
  createdAt: string;
  createdByUserId: string | null;
};

/** Taxa vigente que o checkout usa: override da Loja vence o padrão. */
export type EffectivePaymentFee = {
  feeId: string;
  source: "store" | "default";
  method: FeePaymentMethod;
  cardMode: CardMode | null;
  percentBps: number;
  fixedCents: number;
};

export type OpsAuditRow = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
};

/** Ações de auditoria do Ticket 29 (iguais a OPS_AUDIT_ACTIONS de @foode/shared/ops). */
export const OPS_AUDIT_ACTIONS = [
  "store.created",
  "store.updated",
  "store.status_changed",
  "store.card_mode_set",
  "store.plan_set",
  "plan_tiers.published",
  "payment_fee.created",
  "payment_fee.ended",
  "provider_cost.created",
  "provider_cost.ended",
] as const;
type OpsAuditAction = (typeof OPS_AUDIT_ACTIONS)[number];

// ---- Funções puras ----

const SAO_PAULO_MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
});

/** Mês civil `YYYY-MM` em America/Sao_Paulo do instante ISO `at`. */
export function saoPauloMonth(at: string): string {
  const parts = SAO_PAULO_MONTH.formatToParts(new Date(at));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function effectiveAt(period: { validFrom: string; validTo: string | null }, at: string): boolean {
  return period.validFrom <= at && (period.validTo === null || at < period.validTo);
}

function tierFor(tiers: readonly OpsPlanTierData[], orders: number): OpsPlanTierData | null {
  return (
    tiers.find(
      (tier) => orders >= tier.minOrders && (tier.maxOrders === null || orders <= tier.maxOrders),
    ) ?? null
  );
}

/** Condição SQL "vigente em ?" (dois parâmetros: o mesmo instante). */
const EFFECTIVE_SQL = `valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`;

const HAS_PASSWORD_SQL = `EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.provider_id = 'credential' AND a.password IS NOT NULL)`;

// ---- Linhas cruas do D1 ----

type StoreJoinRow = {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
  hasProfile: number;
  cnpj: string | null;
  whatsapp: string | null;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  pixKeyType: PixKeyType | null;
  pixKey: string | null;
  holderName: string | null;
  holderDocument: string | null;
  cardMode: CardMode | null;
};

const STORE_JOIN_SELECT = `
  SELECT s.id AS id, s.slug AS slug, s.name AS name, s.status AS status,
         s.created_at AS createdAt, s.updated_at AS updatedAt,
         (p.store_id IS NOT NULL) AS hasProfile,
         p.cnpj AS cnpj, p.whatsapp AS whatsapp,
         p.address_postal_code AS postalCode, p.address_street AS street,
         p.address_number AS number, p.address_complement AS complement,
         p.address_district AS district, p.address_city AS city, p.address_state AS state,
         p.payout_pix_key_type AS pixKeyType, p.payout_pix_key AS pixKey,
         p.payout_holder_name AS holderName, p.payout_holder_document AS holderDocument,
         p.card_mode AS cardMode
  FROM stores s LEFT JOIN store_profiles p ON p.store_id = s.id`;

type PlanRow = OpsStorePlan & { storeId: string };
type OwnerRow = OpsStoreOwner & { storeId: string; acceptedInt: number };

const FEE_SELECT = `
  SELECT id, store_id AS storeId, method, card_mode AS cardMode, percent_bps AS percentBps,
         fixed_cents AS fixedCents, valid_from AS validFrom, valid_to AS validTo,
         created_at AS createdAt, created_by_user_id AS createdByUserId
  FROM payment_fees`;

const COST_SELECT = `
  SELECT id, provider, operation, percent_bps AS percentBps, fixed_cents AS fixedCents,
         valid_from AS validFrom, valid_to AS validTo, created_at AS createdAt,
         created_by_user_id AS createdByUserId
  FROM provider_costs`;

/** Perfil completo como objeto (auditoria e leitura); null se a Loja não tem perfil. */
function profileOf(
  row: StoreJoinRow,
): (OpsStoreProfileData & { cardMode: CardMode | null }) | null {
  if (!row.hasProfile) return null;
  return {
    cnpj: row.cnpj!,
    whatsapp: row.whatsapp!,
    address: {
      postalCode: row.postalCode!,
      street: row.street!,
      number: row.number!,
      complement: row.complement,
      district: row.district!,
      city: row.city!,
      state: row.state!,
    },
    payout: {
      pixKey: { type: row.pixKeyType!, value: row.pixKey! },
      holderName: row.holderName!,
      holderDocument: row.holderDocument!,
    },
    cardMode: row.cardMode,
  };
}

/** Estado auditável da Loja (o `before`/`after` de store.*). */
function storeSnapshot(row: StoreJoinRow) {
  return { slug: row.slug, name: row.name, status: row.status, profile: profileOf(row) };
}

/**
 * Fonte da contagem de Pedidos do mês (decisão 61: Pedidos não cancelados do Canal próprio no
 * mês civil de America/Sao_Paulo).
 * TODO(24): a tabela de Pedidos nasce no Ticket 24; até lá a contagem é 0 para toda Loja. O
 * contrato (Loja → contagem do mês `YYYY-MM`) já é o definitivo.
 */
async function monthOrderCounts(
  _d1: D1Database,
  storeIds: readonly string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TODO(24): filtro do mês na query de Pedidos
  _month: string,
): Promise<Map<string, number>> {
  return new Map(storeIds.map((id) => [id, 0]));
}

export function createOpsOperations(d1: D1Database, context: OpsContext) {
  const actor = context.userId;

  /** Auditoria condicional: só grava se `guard` (SQL) for verdadeira no momento do batch. */
  function audit(
    entry: {
      storeId: string | null;
      action: OpsAuditAction;
      targetType: string;
      targetId: string;
      before: unknown;
      after: unknown;
      extra?: Record<string, unknown> | undefined;
    },
    guard: { sql: string; params: unknown[] } = { sql: "1", params: [] },
    at = utcNow(),
  ): D1PreparedStatement {
    const metadata = JSON.stringify({
      ...entry.extra,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
      )
      .bind(
        newId(),
        at,
        actor,
        entry.storeId,
        entry.action,
        entry.targetType,
        entry.targetId,
        metadata,
        ...guard.params,
      );
  }

  async function storeRow(storeId: string): Promise<StoreJoinRow | null> {
    return d1.prepare(`${STORE_JOIN_SELECT} WHERE s.id = ?`).bind(storeId).first<StoreJoinRow>();
  }

  async function requireStore(storeId: string): Promise<StoreJoinRow> {
    const row = await storeRow(storeId);
    if (!row) throw new FoodeDbError("not_found");
    return row;
  }

  /** Guard de versão otimista da Loja (2 parâmetros). */
  function storeVersion(row: StoreJoinRow) {
    return {
      sql: `EXISTS (SELECT 1 FROM stores WHERE id = ? AND updated_at = ?)`,
      params: [row.id, row.updatedAt],
    };
  }

  async function plansOf(storeId?: string): Promise<PlanRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT id, store_id AS storeId, cycle, valid_from AS validFrom, valid_to AS validTo
         FROM store_plans ${storeId ? "WHERE store_id = ?" : ""}
         ORDER BY valid_from DESC`,
      )
      .bind(...(storeId ? [storeId] : []))
      .all<PlanRow>();
    return results;
  }

  async function ownersOf(storeId?: string): Promise<OwnerRow[]> {
    const { results } = await d1
      .prepare(
        `SELECT m.id AS membershipId, m.store_id AS storeId, u.id AS userId, u.email AS email,
                u.name AS name, ${HAS_PASSWORD_SQL} AS acceptedInt
         FROM store_memberships m JOIN users u ON u.id = m.user_id
         WHERE m.role = 'owner' ${storeId ? "AND m.store_id = ?" : ""}
         ORDER BY u.email`,
      )
      .bind(...(storeId ? [storeId] : []))
      .all<OwnerRow>();
    return results;
  }

  async function effectiveFeesAt(at: string, storeId?: string): Promise<OpsPaymentFeeRow[]> {
    const { results } = await d1
      .prepare(
        `${FEE_SELECT} WHERE ${EFFECTIVE_SQL} ${storeId ? "AND (store_id IS NULL OR store_id = ?)" : ""}`,
      )
      .bind(at, at, ...(storeId ? [storeId] : []))
      .all<OpsPaymentFeeRow>();
    return results;
  }

  async function effectiveMonthlyTiers(at: string): Promise<OpsPlanTierData[]> {
    const { results } = await d1
      .prepare(
        `SELECT min_orders AS minOrders, max_orders AS maxOrders, price_cents AS priceCents
         FROM plan_price_tiers WHERE cycle = 'monthly' AND ${EFFECTIVE_SQL}
         ORDER BY min_orders`,
      )
      .bind(at, at)
      .all<OpsPlanTierData>();
    return results;
  }

  /** Override da Loja vence o padrão; Crédito só no modo do cartão da Loja. */
  function pickFee(
    fees: readonly OpsPaymentFeeRow[],
    storeId: string,
    method: FeePaymentMethod,
    cardMode: CardMode | null,
  ): OpsPaymentFeeRow | null {
    const match = (fee: OpsPaymentFeeRow) => fee.method === method && fee.cardMode === cardMode;
    return (
      fees.find((fee) => fee.storeId === storeId && match(fee)) ??
      fees.find((fee) => fee.storeId === null && match(fee)) ??
      null
    );
  }

  type Lookups = {
    now: string;
    month: string;
    plans: PlanRow[];
    owners: OwnerRow[];
    fees: OpsPaymentFeeRow[];
    tiers: OpsPlanTierData[];
    orderCounts: Map<string, number>;
  };

  async function lookups(storeIds: string[], storeId?: string): Promise<Lookups> {
    const now = utcNow();
    const month = saoPauloMonth(now);
    const [plans, owners, fees, tiers, orderCounts] = await Promise.all([
      plansOf(storeId),
      ownersOf(storeId),
      effectiveFeesAt(now, storeId),
      effectiveMonthlyTiers(now),
      monthOrderCounts(d1, storeIds, month),
    ]);
    return { now, month, plans, owners, fees, tiers, orderCounts };
  }

  function listItem(row: StoreJoinRow, data: Lookups): OpsStoreListRow {
    const plans = data.plans.filter((plan) => plan.storeId === row.id);
    const owners = data.owners.filter((owner) => owner.storeId === row.id);
    const current = plans.find((plan) => effectiveAt(plan, data.now)) ?? null;
    const plan: OpsStorePlan | null = current
      ? {
          id: current.id,
          cycle: current.cycle,
          validFrom: current.validFrom,
          validTo: current.validTo,
        }
      : null;
    const orderCount = data.orderCounts.get(row.id) ?? 0;
    const done: Record<OnboardingCheck, boolean> = {
      profile: Boolean(row.hasProfile),
      payout: Boolean(row.hasProfile && row.pixKey),
      owner_invited: owners.length > 0,
      owner_accepted: owners.some((owner) => owner.acceptedInt === 1),
      plan: plan !== null,
      card_mode: row.cardMode !== null,
      pix_fee: pickFee(data.fees, row.id, "pix", null) !== null,
      credit_fee:
        row.cardMode !== null && pickFee(data.fees, row.id, "credit", row.cardMode) !== null,
    };
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      status: row.status,
      cnpj: row.cnpj,
      cardMode: row.cardMode,
      plan,
      monthTier: plan
        ? {
            month: data.month,
            orderCount,
            tier: plan.cycle === "monthly" ? tierFor(data.tiers, orderCount) : null,
          }
        : null,
      onboarding: ONBOARDING_CHECKS.map((check) => ({ check, done: done[check] })),
      createdAt: row.createdAt,
    };
  }

  async function storeDetail(storeId: string): Promise<OpsStoreDetailRow> {
    const row = await requireStore(storeId);
    const [data, ownerProfile] = await Promise.all([
      lookups([row.id], row.id),
      ownerProfileOf(d1, row.id),
    ]);
    const profile = profileOf(row);
    return {
      ...listItem(row, data),
      whatsapp: profile?.whatsapp ?? null,
      address: profile?.address ?? null,
      payout: profile
        ? {
            pixKeyType: profile.payout.pixKey.type,
            pixKey: profile.payout.pixKey.value,
            holderName: profile.payout.holderName,
            holderDocument: profile.payout.holderDocument,
          }
        : null,
      owners: data.owners.map((owner) => ({
        membershipId: owner.membershipId,
        userId: owner.userId,
        email: owner.email,
        name: owner.name,
        accepted: owner.acceptedInt === 1,
      })),
      planHistory: data.plans.map(({ id, cycle, validFrom, validTo }) => ({
        id,
        cycle,
        validFrom,
        validTo,
      })),
      ownerProfile,
      updatedAt: row.updatedAt,
    };
  }

  /** UPSERT do perfil completo, condicionado à versão da Loja (cria sob demanda). */
  function upsertProfile(
    storeId: string,
    profile: OpsStoreProfileData & { cardMode: CardMode | null },
    now: string,
    guard: { sql: string; params: unknown[] },
  ): D1PreparedStatement {
    return d1
      .prepare(
        `INSERT INTO store_profiles (store_id, cnpj, whatsapp, address_postal_code, address_street,
           address_number, address_complement, address_district, address_city, address_state,
           payout_pix_key_type, payout_pix_key, payout_holder_name, payout_holder_document,
           card_mode, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}
         ON CONFLICT(store_id) DO UPDATE SET
           cnpj = excluded.cnpj, whatsapp = excluded.whatsapp,
           address_postal_code = excluded.address_postal_code,
           address_street = excluded.address_street, address_number = excluded.address_number,
           address_complement = excluded.address_complement,
           address_district = excluded.address_district, address_city = excluded.address_city,
           address_state = excluded.address_state,
           payout_pix_key_type = excluded.payout_pix_key_type,
           payout_pix_key = excluded.payout_pix_key,
           payout_holder_name = excluded.payout_holder_name,
           payout_holder_document = excluded.payout_holder_document,
           card_mode = excluded.card_mode, updated_at = excluded.updated_at`,
      )
      .bind(
        storeId,
        profile.cnpj,
        profile.whatsapp,
        profile.address.postalCode,
        profile.address.street,
        profile.address.number,
        profile.address.complement,
        profile.address.district,
        profile.address.city,
        profile.address.state,
        profile.payout.pixKey.type,
        profile.payout.pixKey.value,
        profile.payout.holderName,
        profile.payout.holderDocument,
        profile.cardMode,
        now,
        now,
        ...guard.params,
      );
  }

  /** Grava Loja + perfil + auditoria com versão otimista; `conflict` se mudou no meio. */
  async function writeStore(
    before: StoreJoinRow,
    next: { slug: string; name: string; status: StoreStatus },
    profile: (OpsStoreProfileData & { cardMode: CardMode | null }) | null,
    action: OpsAuditAction,
    options: {
      extra?: Record<string, unknown> | undefined;
      extraGuard?: { sql: string; params: unknown[] } | undefined;
    } = {},
  ): Promise<void> {
    const now = utcNow();
    const version = storeVersion(before);
    const guard = options.extraGuard
      ? {
          sql: `${version.sql} AND ${options.extraGuard.sql}`,
          params: [...version.params, ...options.extraGuard.params],
        }
      : version;
    const statements: D1PreparedStatement[] = [
      audit(
        {
          storeId: before.id,
          action,
          targetType: "store",
          targetId: before.id,
          before: storeSnapshot(before),
          after: { ...next, profile: profile ?? profileOf(before) },
          extra: options.extra,
        },
        guard,
        now,
      ),
    ];
    if (profile) statements.push(upsertProfile(before.id, profile, now, guard));
    // Decisão 69: troca de Link personalizado pelo Ops também guarda o anterior e respeita a
    // reserva de links antigos de outras Lojas (UNIQUE → `slug_unavailable`).
    if (next.slug !== before.slug) {
      statements.unshift(
        ...slugChangeStatements(d1, before.id, before.slug, next.slug, now, guard),
      );
    }
    // Por último: muda `updated_at` (a versão que os passos anteriores conferiram).
    statements.push(
      d1
        .prepare(
          `UPDATE stores SET slug = ?, name = ?, status = ?, updated_at = ?
           WHERE id = ? AND updated_at = ? ${options.extraGuard ? `AND ${options.extraGuard.sql}` : ""}`,
        )
        .bind(
          next.slug,
          next.name,
          next.status,
          now,
          before.id,
          before.updatedAt,
          ...(options.extraGuard?.params ?? []),
        ),
    );
    let results: D1Result[];
    try {
      results = await d1.batch(statements);
    } catch (error) {
      // O perfil é UPSERT; os UNIQUE que sobram no batch são do Slug (atual ou histórico).
      if (isUniqueViolation(error)) throw new FoodeDbError("slug_unavailable");
      throw error;
    }
    if ((results.at(-1)?.meta.changes ?? 0) === 0) throw new FoodeDbError("conflict");
  }

  /** Encerra uma vigência (só encurta: nunca reabre nem estende — não cria sobreposição). */
  async function endPeriod(
    table: "payment_fees" | "provider_costs",
    action: "payment_fee.ended" | "provider_cost.ended",
    targetType: "payment_fee" | "provider_cost",
    id: string,
    validTo: string,
  ): Promise<void> {
    const row = await d1.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<
      Record<string, unknown> & {
        valid_from: string;
        valid_to: string | null;
        store_id?: string | null;
      }
    >();
    if (!row) throw new FoodeDbError("not_found");
    if (!(row.valid_from < validTo) || (row.valid_to !== null && validTo >= row.valid_to)) {
      throw new FoodeDbError("conflict", "fim fora da vigência atual");
    }
    const now = utcNow();
    const guardSql = `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND valid_to IS ?)`;
    const [, update] = await d1.batch([
      audit(
        {
          storeId: (row.store_id as string | null | undefined) ?? null,
          action,
          targetType,
          targetId: id,
          before: { validFrom: row.valid_from, validTo: row.valid_to },
          after: { validFrom: row.valid_from, validTo },
        },
        { sql: guardSql, params: [id, row.valid_to] },
        now,
      ),
      d1
        .prepare(`UPDATE ${table} SET valid_to = ? WHERE id = ? AND valid_to IS ?`)
        .bind(validTo, id, row.valid_to),
    ]);
    if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("conflict");
  }

  return {
    // ---- Lojas ----

    /** Lojas com estado, Plano vigente, faixa do mês e checklist de onboarding. */
    async listStores(): Promise<OpsStoreListRow[]> {
      const { results } = await d1
        .prepare(`${STORE_JOIN_SELECT} ORDER BY s.name, s.id`)
        .all<StoreJoinRow>();
      const data = await lookups(results.map((row) => row.id));
      return results.map((row) => listItem(row, data));
    },

    /**
     * Detalhe da Loja. Loja anterior ao Ticket 29 (sem `store_profiles`) vem com perfil null; o
     * perfil é criado sob demanda no primeiro `updateStore` com o cadastro completo.
     */
    getStore: storeDetail,

    /** Cadastra a Loja em `onboarding` com o perfil completo (1:1), num batch com auditoria. */
    async createStore(input: OpsCreateStoreData): Promise<{ storeId: string }> {
      const storeId = newId();
      const now = utcNow();
      const profile = {
        cnpj: input.cnpj,
        whatsapp: input.whatsapp,
        address: input.address,
        payout: input.payout,
        cardMode: null,
      };
      try {
        await d1.batch([
          // Link antigo reservado a outra Loja (decisão 69) = UNIQUE → `slug_unavailable`.
          slugReservationGuard(d1, storeId, input.slug),
          d1
            .prepare(
              `INSERT INTO stores (id, slug, name, status, created_at, updated_at)
               VALUES (?, ?, ?, 'onboarding', ?, ?)`,
            )
            .bind(storeId, input.slug, input.name, now, now),
          upsertProfile(storeId, profile, now, { sql: "1", params: [] }),
          audit(
            {
              storeId,
              action: "store.created",
              targetType: "store",
              targetId: storeId,
              before: null,
              after: { slug: input.slug, name: input.name, status: "onboarding", profile },
            },
            undefined,
            now,
          ),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new FoodeDbError("slug_unavailable");
        throw error;
      }
      return { storeId };
    },

    /**
     * Edita só os campos enviados. Loja sem perfil (anterior ao Ticket 29) precisa receber o
     * cadastro completo (CNPJ, WhatsApp, endereço e repasse) para o perfil nascer; senão `conflict`.
     */
    async updateStore(storeId: string, patch: OpsUpdateStoreData): Promise<void> {
      const before = await requireStore(storeId);
      const current = profileOf(before);
      const touchesProfile =
        patch.cnpj !== undefined ||
        patch.whatsapp !== undefined ||
        patch.address !== undefined ||
        patch.payout !== undefined;
      let profile: (OpsStoreProfileData & { cardMode: CardMode | null }) | null = null;
      if (touchesProfile) {
        const cnpj = patch.cnpj ?? current?.cnpj;
        const whatsapp = patch.whatsapp ?? current?.whatsapp;
        const address = patch.address ?? current?.address;
        const payout = patch.payout ?? current?.payout;
        if (!cnpj || !whatsapp || !address || !payout) {
          throw new FoodeDbError("conflict", "cadastro incompleto para criar o perfil");
        }
        profile = { cnpj, whatsapp, address, payout, cardMode: current?.cardMode ?? null };
      }
      await writeStore(
        before,
        { slug: patch.slug ?? before.slug, name: patch.name ?? before.name, status: before.status },
        profile,
        "store.updated",
      );
    },

    /**
     * Muda o estado da Loja. `allowedFrom` = estados de onde a transição vale (a api deriva de
     * STORE_STATUS_TRANSITIONS). Ativar exige, no mesmo batch, perfil, Dono convidado e Plano
     * vigente (ACTIVATION_REQUIRED_CHECKS); suspender leva o motivo para a auditoria.
     */
    async changeStoreStatus(
      storeId: string,
      to: StoreStatus,
      options: { allowedFrom: readonly StoreStatus[]; reason?: string },
    ): Promise<void> {
      const before = await requireStore(storeId);
      if (!options.allowedFrom.includes(before.status)) {
        throw new FoodeDbError("conflict", `transição ${before.status} → ${to} não permitida`);
      }
      const now = utcNow();
      const statusGuard = {
        sql: `EXISTS (SELECT 1 FROM stores WHERE id = ? AND status = ?)`,
        params: [storeId, before.status],
      };
      const extraGuard =
        to === "active"
          ? {
              sql: `${statusGuard.sql}
                AND EXISTS (SELECT 1 FROM store_profiles WHERE store_id = ?)
                AND EXISTS (SELECT 1 FROM store_memberships WHERE store_id = ? AND role = 'owner')
                AND EXISTS (SELECT 1 FROM store_plans WHERE store_id = ? AND ${EFFECTIVE_SQL})`,
              params: [...statusGuard.params, storeId, storeId, storeId, now, now],
            }
          : statusGuard;
      if (to === "active") {
        const detail = await storeDetail(storeId);
        const missing = ACTIVATION_REQUIRED_CHECKS.filter(
          (check) => !detail.onboarding.find((item) => item.check === check)?.done,
        );
        if (missing.length > 0) {
          throw new FoodeDbError("conflict", `falta para ativar: ${missing.join(", ")}`);
        }
      }
      await writeStore(
        before,
        { slug: before.slug, name: before.name, status: to },
        null,
        "store.status_changed",
        { extra: options.reason ? { reason: options.reason } : {}, extraGuard },
      );
    },

    /** Modo do cartão (Normal = Efí, Rápido = AbacatePay). Loja sem perfil = `conflict`. */
    async setCardMode(storeId: string, cardMode: CardMode): Promise<void> {
      const before = await requireStore(storeId);
      const current = profileOf(before);
      if (!current) throw new FoodeDbError("conflict", "Loja sem cadastro completo");
      await writeStore(
        before,
        { slug: before.slug, name: before.name, status: before.status },
        { ...current, cardMode },
        "store.card_mode_set",
      );
    },

    // ---- Plano e faixas ----

    /**
     * Plano a partir de `validFrom`; o vigente nesse instante termina ali. Já existir Plano que
     * comece em `validFrom` ou depois = `conflict` (não se insere Plano antes de outro agendado).
     */
    async setStorePlan(
      storeId: string,
      input: { cycle: BillingCycle; validFrom: string },
    ): Promise<{ planId: string }> {
      await requireStore(storeId);
      const planId = newId();
      const now = utcNow();
      const exists = { sql: `EXISTS (SELECT 1 FROM store_plans WHERE id = ?)`, params: [planId] };
      const previousSql = `store_id = ? AND id <> ? AND valid_from < ? AND (valid_to IS NULL OR valid_to > ?)`;
      const previousParams = [storeId, planId, input.validFrom, input.validFrom];
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO store_plans (id, store_id, cycle, valid_from, valid_to, created_at, created_by_user_id)
             SELECT ?, id, ?, ?, NULL, ?, ? FROM stores
             WHERE id = ? AND NOT EXISTS (
               SELECT 1 FROM store_plans WHERE store_id = ? AND valid_from >= ?)`,
          )
          .bind(
            planId,
            input.cycle,
            input.validFrom,
            now,
            actor,
            storeId,
            storeId,
            input.validFrom,
          ),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, n.store_id, 'store.plan_set', 'store_plan', n.id,
               json_object(
                 'before', json((SELECT json_object('id', o.id, 'cycle', o.cycle, 'validFrom', o.valid_from, 'validTo', o.valid_to)
                                 FROM store_plans o WHERE ${previousSql} ORDER BY o.valid_from DESC LIMIT 1)),
                 'after', json_object('id', n.id, 'cycle', n.cycle, 'validFrom', n.valid_from, 'validTo', n.valid_to,
                   'previousEndsAt', CASE WHEN EXISTS (SELECT 1 FROM store_plans o WHERE ${previousSql}) THEN n.valid_from END))
             FROM store_plans n WHERE n.id = ?`,
          )
          .bind(newId(), now, actor, ...previousParams, ...previousParams, planId),
        d1
          .prepare(`UPDATE store_plans SET valid_to = ? WHERE ${previousSql} AND ${exists.sql}`)
          .bind(input.validFrom, ...previousParams, ...exists.params),
      ]);
      if ((insert?.meta.changes ?? 0) === 0) {
        throw new FoodeDbError("conflict", "já há Plano a partir desta data");
      }
      return { planId };
    },

    /** Tabelas de faixas (vigente, futuras e histórico), mais recente primeiro. */
    async listPlanTierTables(): Promise<OpsPlanTierTable[]> {
      const { results } = await d1
        .prepare(
          `SELECT id, cycle, min_orders AS minOrders, max_orders AS maxOrders,
                  price_cents AS priceCents, valid_from AS validFrom, valid_to AS validTo
           FROM plan_price_tiers ORDER BY valid_from DESC, cycle DESC, min_orders`,
        )
        .all<
          OpsPlanTierData & {
            id: string;
            cycle: BillingCycle;
            validFrom: string;
            validTo: string | null;
          }
        >();
      const tables = new Map<string, OpsPlanTierTable>();
      for (const row of results) {
        const table = tables.get(row.validFrom) ?? {
          validFrom: row.validFrom,
          validTo: row.validTo,
          monthlyTiers: [],
          annual: null,
        };
        if (row.cycle === "annual") table.annual = { id: row.id, priceCents: row.priceCents };
        else {
          table.monthlyTiers.push({
            id: row.id,
            minOrders: row.minOrders,
            maxOrders: row.maxOrders,
            priceCents: row.priceCents,
          });
        }
        tables.set(row.validFrom, table);
      }
      return [...tables.values()];
    },

    /**
     * Publica nova tabela de faixas (mensais + anual) a partir de `validFrom`; a vigente termina
     * ali. Já existir tabela que comece em `validFrom` ou depois = `conflict`.
     */
    async publishPlanTiers(input: {
      validFrom: string;
      monthlyTiers: readonly OpsPlanTierData[];
      annualPriceCents: number;
    }): Promise<void> {
      const now = utcNow();
      const rows = [
        ...input.monthlyTiers.map((tier) => ({ id: newId(), cycle: "monthly", ...tier })),
        {
          id: newId(),
          cycle: "annual",
          minOrders: 0,
          maxOrders: null,
          priceCents: input.annualPriceCents,
        },
      ];
      const firstId = rows[0]!.id;
      const previousSql = `valid_from < ? AND (valid_to IS NULL OR valid_to > ?) AND id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))`;
      const rowsJson = JSON.stringify(rows);
      const previousParams = [input.validFrom, input.validFrom, rowsJson];
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO plan_price_tiers (id, cycle, min_orders, max_orders, price_cents, valid_from, valid_to, created_at, created_by_user_id)
             SELECT json_extract(value, '$.id'), json_extract(value, '$.cycle'),
                    json_extract(value, '$.minOrders'), json_extract(value, '$.maxOrders'),
                    json_extract(value, '$.priceCents'), ?, NULL, ?, ?
             FROM json_each(?)
             WHERE NOT EXISTS (SELECT 1 FROM plan_price_tiers WHERE valid_from >= ?)`,
          )
          .bind(input.validFrom, now, actor, rowsJson, input.validFrom),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, NULL, 'plan_tiers.published', 'plan_price_tiers', ?,
               json_object(
                 'before', json((SELECT json_group_array(json_object('id', id, 'cycle', cycle, 'minOrders', min_orders, 'maxOrders', max_orders, 'priceCents', price_cents, 'validFrom', valid_from, 'validTo', valid_to))
                                 FROM plan_price_tiers WHERE ${previousSql})),
                 'after', json_object('validFrom', ?, 'tiers', json(?)))
             WHERE EXISTS (SELECT 1 FROM plan_price_tiers WHERE id = ?)`,
          )
          .bind(
            newId(),
            now,
            actor,
            input.validFrom,
            ...previousParams,
            input.validFrom,
            rowsJson,
            firstId,
          ),
        d1
          .prepare(
            `UPDATE plan_price_tiers SET valid_to = ? WHERE ${previousSql}
             AND EXISTS (SELECT 1 FROM plan_price_tiers WHERE id = ?)`,
          )
          .bind(input.validFrom, ...previousParams, firstId),
      ]);
      if ((insert?.meta.changes ?? 0) === 0) {
        throw new FoodeDbError("conflict", "já há tabela de faixas a partir desta data");
      }
    },

    // ---- Taxa Foode ----

    /** Taxas da tabela padrão (`storeId` null) ou overrides da Loja, com histórico. */
    async listPaymentFees(storeId: string | null): Promise<OpsPaymentFeeRow[]> {
      if (storeId) await requireStore(storeId);
      const { results } = await d1
        .prepare(`${FEE_SELECT} WHERE store_id IS ? ORDER BY method, card_mode, valid_from DESC`)
        .bind(storeId)
        .all<OpsPaymentFeeRow>();
      return results;
    },

    /**
     * Cadastra taxas (padrão ou override da Loja). A sobreposição com o que já está gravado no
     * mesmo meio/modo é conferida no próprio INSERT…SELECT: ou entram todas, ou nenhuma
     * (`conflict`). A sobreposição entre as novas já foi barrada pelo Zod (findFeeOverlap).
     */
    async createPaymentFees(
      storeId: string | null,
      fees: readonly OpsPaymentFeeData[],
    ): Promise<{ feeIds: string[] }> {
      if (storeId) await requireStore(storeId);
      const now = utcNow();
      const rows = fees.map((fee) => ({ ...fee, id: newId(), auditId: newId() }));
      const rowsJson = JSON.stringify(rows);
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO payment_fees (id, store_id, method, card_mode, percent_bps, fixed_cents, valid_from, valid_to, created_at, created_by_user_id)
             SELECT json_extract(n.value, '$.id'), ?, json_extract(n.value, '$.method'),
                    json_extract(n.value, '$.cardMode'), json_extract(n.value, '$.percentBps'),
                    json_extract(n.value, '$.fixedCents'), json_extract(n.value, '$.validFrom'),
                    json_extract(n.value, '$.validTo'), ?, ?
             FROM json_each(?) n
             WHERE NOT EXISTS (
               SELECT 1 FROM payment_fees p, json_each(?) x
               WHERE p.store_id IS ?
                 AND p.id NOT IN (SELECT json_extract(value, '$.id') FROM json_each(?))
                 AND p.method = json_extract(x.value, '$.method')
                 AND p.card_mode IS json_extract(x.value, '$.cardMode')
                 AND (p.valid_to IS NULL OR p.valid_to > json_extract(x.value, '$.validFrom'))
                 AND (json_extract(x.value, '$.validTo') IS NULL OR p.valid_from < json_extract(x.value, '$.validTo')))`,
          )
          .bind(storeId, now, actor, rowsJson, rowsJson, storeId, rowsJson),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT json_extract(n.value, '$.auditId'), ?, ?, f.store_id, 'payment_fee.created', 'payment_fee', f.id,
               json_object('before', NULL, 'after', json_object(
                 'storeId', f.store_id, 'method', f.method, 'cardMode', f.card_mode,
                 'percentBps', f.percent_bps, 'fixedCents', f.fixed_cents,
                 'validFrom', f.valid_from, 'validTo', f.valid_to))
             FROM json_each(?) n JOIN payment_fees f ON f.id = json_extract(n.value, '$.id')`,
          )
          .bind(now, actor, rowsJson),
      ]);
      if ((insert?.meta.changes ?? 0) !== rows.length) {
        throw new FoodeDbError("conflict", "vigência sobreposta com taxa já cadastrada");
      }
      return { feeIds: rows.map((row) => row.id) };
    },

    /** Encerra a vigência de uma taxa (`validTo`); não apaga nem reescreve o valor. */
    endPaymentFee(feeId: string, validTo: string): Promise<void> {
      return endPeriod("payment_fees", "payment_fee.ended", "payment_fee", feeId, validTo);
    },

    /** Taxa vigente da Loja em `at` (o mesmo cálculo do checkout; vale para qualquer estado). */
    async effectivePaymentFees(storeId: string, at = utcNow()): Promise<EffectivePaymentFee[]> {
      const row = await requireStore(storeId);
      return effectivePaymentFeesOf(d1, row.id, row.cardMode, at);
    },

    // ---- Custos dos provedores (Ops-only) ----

    async listProviderCosts(): Promise<OpsProviderCostRow[]> {
      const { results } = await d1
        .prepare(`${COST_SELECT} ORDER BY provider, operation, valid_from DESC`)
        .all<OpsProviderCostRow>();
      return results;
    },

    /** Novo custo; sobreposição no mesmo provedor/operação com o gravado = `conflict`. */
    async createProviderCost(input: OpsProviderCostData): Promise<{ costId: string }> {
      const costId = newId();
      const now = utcNow();
      const [insert] = await d1.batch([
        d1
          .prepare(
            `INSERT INTO provider_costs (id, provider, operation, percent_bps, fixed_cents, valid_from, valid_to, created_at, created_by_user_id)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
             WHERE NOT EXISTS (
               SELECT 1 FROM provider_costs
               WHERE provider = ? AND operation = ?
                 AND (valid_to IS NULL OR valid_to > ?)
                 AND (? IS NULL OR valid_from < ?))`,
          )
          .bind(
            costId,
            input.provider,
            input.operation,
            input.percentBps,
            input.fixedCents,
            input.validFrom,
            input.validTo,
            now,
            actor,
            input.provider,
            input.operation,
            input.validFrom,
            input.validTo,
            input.validTo,
          ),
        audit(
          {
            storeId: null,
            action: "provider_cost.created",
            targetType: "provider_cost",
            targetId: costId,
            before: null,
            after: input,
          },
          { sql: `EXISTS (SELECT 1 FROM provider_costs WHERE id = ?)`, params: [costId] },
          now,
        ),
      ]);
      if ((insert?.meta.changes ?? 0) === 0) {
        throw new FoodeDbError("conflict", "vigência sobreposta com custo já cadastrado");
      }
      return { costId };
    },

    endProviderCost(costId: string, validTo: string): Promise<void> {
      return endPeriod("provider_costs", "provider_cost.ended", "provider_cost", costId, validTo);
    },

    // ---- Auditoria e Pedidos ----

    /** Trilha da Loja, mais recente primeiro (até 200), com `before`/`after` do metadata. */
    async storeAudit(storeId: string): Promise<OpsAuditRow[]> {
      await requireStore(storeId);
      const { results } = await d1
        .prepare(
          `SELECT a.id AS id, a.occurred_at AS occurredAt, a.actor_user_id AS actorUserId,
                  u.email AS actorEmail, a.action AS action, a.target_type AS targetType,
                  a.target_id AS targetId, a.metadata AS metadata
           FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id
           WHERE a.store_id = ? ORDER BY a.occurred_at DESC, a.id DESC LIMIT 200`,
        )
        .bind(storeId)
        .all<Omit<OpsAuditRow, "before" | "after"> & { metadata: string }>();
      return results.map(({ metadata, ...row }) => {
        const parsed = JSON.parse(metadata) as Record<string, unknown>;
        const hasDiff = "before" in parsed || "after" in parsed;
        return {
          ...row,
          before: hasDiff ? (parsed.before ?? null) : null,
          after: hasDiff ? (parsed.after ?? null) : parsed,
        };
      });
    },

    /** Pedidos do mês civil (America/Sao_Paulo) da Loja. TODO(24): 0 até existir Pedido. */
    async monthOrderCount(storeId: string, month = saoPauloMonth(utcNow())): Promise<number> {
      const counts = await monthOrderCounts(d1, [storeId], month);
      return counts.get(storeId) ?? 0;
    },
  };
}

/**
 * Taxa Foode vigente da Loja em `at`: override da Loja vence o padrão; PIX sem modo; Crédito só
 * no modo do cartão da Loja (`cardMode` null = Crédito indisponível). Meio sem taxa vigente não
 * aparece — fica fora do checkout (decisão 61).
 */
export async function effectivePaymentFeesOf(
  d1: D1Database,
  storeId: string,
  cardMode: CardMode | null,
  at: string,
): Promise<EffectivePaymentFee[]> {
  const { results } = await d1
    .prepare(
      `${FEE_SELECT} WHERE (store_id IS NULL OR store_id = ?) AND ${EFFECTIVE_SQL}
       ORDER BY store_id IS NULL, valid_from DESC`,
    )
    .bind(storeId, at, at)
    .all<OpsPaymentFeeRow>();
  const wanted: { method: FeePaymentMethod; cardMode: CardMode | null }[] = [
    { method: "pix", cardMode: null },
    ...(cardMode ? [{ method: "credit" as const, cardMode }] : []),
  ];
  return wanted.flatMap((key) => {
    const fee = results.find((row) => row.method === key.method && row.cardMode === key.cardMode);
    return fee
      ? [
          {
            feeId: fee.id,
            source: fee.storeId === null ? ("default" as const) : ("store" as const),
            method: fee.method,
            cardMode: fee.cardMode,
            percentBps: fee.percentBps,
            fixedCents: fee.fixedCents,
          },
        ]
      : [];
  });
}

export type OpsOperations = ReturnType<typeof createOpsOperations>;
