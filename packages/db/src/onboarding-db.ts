// Ticket 28 no D1: onboarding do Dono (perfil, checklist, Slug), dados e vitrine da Loja, leitura
// do perfil pelo Ops e o funil próprio agregado do Storefront.
// - Escritas do Dono: só com StoreContext de papel `owner` (a api já autorizou pela política
//   única; aqui é a segunda barreira) e sempre em `context.storeId`, com auditoria no mesmo batch.
// - Storefront: a Loja sai SÓ do Slug e precisa estar `active`; nada de dado interno.
// - Funil: UPSERT de contador por (Loja, dia, evento); nenhum dado pessoal é gravado.
import type { StoreContext } from "./context";
import { assertIssued } from "./context";
import { newId, utcNow } from "./conventions";
import { FoodeDbError, isUniqueViolation } from "./errors";
import type { FunnelEventName } from "./schema";

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type OnboardingChecklistFacts = {
  hasWhatsapp: boolean;
  slugConfirmed: boolean;
  openingPeriods: number;
  pickupEnabled: boolean;
  deliveryConfigured: boolean;
  availableMenuItems: number;
  planActive: boolean;
  readyAcknowledged: boolean;
};

export type OwnerProfileData = {
  cuisine: string;
  cuisineOther: string | null;
  goal: string;
  goalOther: string | null;
};

export type OwnerProfileRow = OwnerProfileData & { answeredAt: string };

export type StoreSettingsRow = {
  name: string;
  slug: string;
  whatsapp: string | null;
  instagram: string | null;
  address: {
    postalCode: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
  } | null;
  registration: {
    cnpj: string;
    payoutPixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random";
    payoutPixKey: string;
    payoutHolderName: string;
  } | null;
  description: string | null;
  logoObjectKey: string | null;
  coverObjectKey: string | null;
  metaPixelId: string | null;
  googleTagId: string | null;
};

export type StoreContactData = {
  whatsapp?: string | undefined;
  instagram?: string | null | undefined;
  address?: NonNullable<StoreSettingsRow["address"]> | undefined;
};

export type StoreShowcaseData = {
  description?: string | null | undefined;
  logoObjectKey?: string | null | undefined;
  coverObjectKey?: string | null | undefined;
};

/** Vitrine pública crua (a api monta as URLs das imagens). */
export type PublicShowcaseRow = {
  description: string | null;
  logoObjectKey: string | null;
  coverObjectKey: string | null;
  instagram: string | null;
  metaPixelId: string | null;
  googleTagId: string | null;
};

export type FunnelCounter = { day: string; event: FunnelEventName; count: number };

/** Ações de auditoria do Ticket 28 (`audit_events.action`). */
export const ONBOARDING_AUDIT_ACTIONS = [
  "store.slug_changed",
  "store.slug_confirmed",
  "store.contact_updated",
  "store.pixels_updated",
  "store.showcase_updated",
  "store.brand_image_uploaded",
  "onboarding.profile_answered",
  "onboarding.ready_acknowledged",
] as const;
export type OnboardingAuditAction = (typeof ONBOARDING_AUDIT_ACTIONS)[number];

type SettingsJoinRow = {
  name: string;
  slug: string;
  hasProfile: number | null;
  whatsapp: string | null;
  postalCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  cnpj: string | null;
  pixKeyType: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
  pixKey: string | null;
  holderName: string | null;
  description: string | null;
  logoObjectKey: string | null;
  coverObjectKey: string | null;
  instagram: string | null;
  metaPixelId: string | null;
  googleTagId: string | null;
};

const SHOWCASE_COLUMNS = `sc.description AS description, sc.logo_object_key AS logoObjectKey,
  sc.cover_object_key AS coverObjectKey, sc.instagram AS instagram,
  sc.meta_pixel_id AS metaPixelId, sc.google_tag_id AS googleTagId`;

/** Linha 1:1 garantida (UPSERT sem mudar nada além de `updated_at`). */
function ensureRow(
  d1: D1Database,
  table: "store_showcases" | "store_onboarding",
  storeId: string,
  now: string,
) {
  return d1
    .prepare(
      `INSERT INTO ${table} (store_id, created_at, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(store_id) DO UPDATE SET updated_at = excluded.updated_at`,
    )
    .bind(storeId, now, now);
}

export function createOnboardingOps(d1: D1Database, context: StoreContext) {
  assertIssued(context);
  const storeId = context.storeId;

  function requireOwner(): void {
    if (context.role !== "owner") throw new FoodeDbError("forbidden");
  }

  function audit(action: OnboardingAuditAction, metadata: Record<string, unknown>, now: string) {
    return d1
      .prepare(
        `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
         VALUES (?, ?, ?, ?, ?, 'store', ?, ?)`,
      )
      .bind(newId(), now, context.userId, storeId, action, storeId, JSON.stringify(metadata));
  }

  async function showcaseKeys(): Promise<{ logo: string | null; cover: string | null }> {
    const row = await d1
      .prepare(
        `SELECT logo_object_key AS logo, cover_object_key AS cover FROM store_showcases WHERE store_id = ?`,
      )
      .bind(storeId)
      .first<{ logo: string | null; cover: string | null }>();
    return row ?? { logo: null, cover: null };
  }

  async function settings(): Promise<StoreSettingsRow> {
    const row = await d1
      .prepare(
        `SELECT s.name AS name, s.slug AS slug, p.store_id IS NOT NULL AS hasProfile,
                p.whatsapp AS whatsapp, p.address_postal_code AS postalCode,
                p.address_street AS street, p.address_number AS number,
                p.address_complement AS complement, p.address_district AS district,
                p.address_city AS city, p.address_state AS state, p.cnpj AS cnpj,
                p.payout_pix_key_type AS pixKeyType, p.payout_pix_key AS pixKey,
                p.payout_holder_name AS holderName, ${SHOWCASE_COLUMNS}
         FROM stores s
         LEFT JOIN store_profiles p ON p.store_id = s.id
         LEFT JOIN store_showcases sc ON sc.store_id = s.id
         WHERE s.id = ?`,
      )
      .bind(storeId)
      .first<SettingsJoinRow>();
    if (!row) throw new FoodeDbError("forbidden");
    const hasProfile = row.hasProfile === 1;
    return {
      name: row.name,
      slug: row.slug,
      whatsapp: row.whatsapp,
      instagram: row.instagram,
      address: hasProfile
        ? {
            postalCode: row.postalCode!,
            street: row.street!,
            number: row.number!,
            complement: row.complement,
            district: row.district!,
            city: row.city!,
            state: row.state!,
          }
        : null,
      registration: hasProfile
        ? {
            cnpj: row.cnpj!,
            payoutPixKeyType: row.pixKeyType!,
            payoutPixKey: row.pixKey!,
            payoutHolderName: row.holderName!,
          }
        : null,
      description: row.description,
      logoObjectKey: row.logoObjectKey,
      coverObjectKey: row.coverObjectKey,
      metaPixelId: row.metaPixelId,
      googleTagId: row.googleTagId,
    };
  }

  return {
    /** Fatos do checklist do Dono (ONB-01) num único SELECT; `at` = instante do Plano vigente. */
    async checklistFacts(at = utcNow()): Promise<OnboardingChecklistFacts> {
      const row = await d1
        .prepare(
          `SELECT
             (SELECT whatsapp FROM store_profiles WHERE store_id = ?1) AS whatsapp,
             (SELECT slug_confirmed_at FROM store_onboarding WHERE store_id = ?1) AS slugConfirmedAt,
             (SELECT ready_acknowledged_at FROM store_onboarding WHERE store_id = ?1) AS readyAt,
             (SELECT count(*) FROM store_opening_periods WHERE store_id = ?1) AS periods,
             (SELECT pickup_enabled FROM store_operation_settings WHERE store_id = ?1) AS pickup,
             (SELECT CASE
                WHEN o.delivery_mode = 'fixed' THEN o.delivery_fixed_fee_cents IS NOT NULL
                WHEN o.delivery_mode = 'neighborhood' THEN EXISTS (
                  SELECT 1 FROM delivery_neighborhoods n WHERE n.store_id = ?1 AND n.active = 1)
                ELSE 0 END
              FROM store_operation_settings o WHERE o.store_id = ?1) AS delivery,
             (SELECT count(*) FROM menu_items WHERE store_id = ?1 AND available = 1) AS items,
             EXISTS (SELECT 1 FROM store_plans WHERE store_id = ?1 AND valid_from <= ?2
                     AND (valid_to IS NULL OR valid_to > ?2)) AS plan`,
        )
        .bind(storeId, at)
        .first<{
          whatsapp: string | null;
          slugConfirmedAt: string | null;
          readyAt: string | null;
          periods: number;
          pickup: number | null;
          delivery: number | null;
          items: number;
          plan: number;
        }>();
      return {
        hasWhatsapp: Boolean(row?.whatsapp),
        slugConfirmed: Boolean(row?.slugConfirmedAt),
        openingPeriods: row?.periods ?? 0,
        pickupEnabled: row?.pickup === 1,
        deliveryConfigured: row?.delivery === 1,
        availableMenuItems: row?.items ?? 0,
        planActive: row?.plan === 1,
        readyAcknowledged: Boolean(row?.readyAt),
      };
    },

    /** Respostas de perfil desta Loja; null = ainda não respondidas. */
    async ownerProfile(): Promise<OwnerProfileRow | null> {
      return ownerProfileOf(d1, storeId);
    },

    /**
     * Grava as duas respostas uma única vez (P-ONB-4). Já respondidas = `conflict` sem mudar
     * nada (o UPDATE só passa com `profile_answered_at IS NULL`).
     */
    async answerProfile(profile: OwnerProfileData): Promise<void> {
      requireOwner();
      const now = utcNow();
      const [, update] = await d1.batch([
        ensureRow(d1, "store_onboarding", storeId, now),
        d1
          .prepare(
            `UPDATE store_onboarding SET profile_cuisine = ?, profile_cuisine_other = ?,
               profile_goal = ?, profile_goal_other = ?, profile_answered_at = ?,
               profile_answered_by_user_id = ?, updated_at = ?
             WHERE store_id = ? AND profile_answered_at IS NULL`,
          )
          .bind(
            profile.cuisine,
            profile.cuisineOther,
            profile.goal,
            profile.goalOther,
            now,
            context.userId,
            now,
            storeId,
          ),
        d1
          .prepare(
            `INSERT INTO audit_events (id, occurred_at, actor_user_id, store_id, action, target_type, target_id, metadata)
             SELECT ?, ?, ?, store_id, 'onboarding.profile_answered', 'store', store_id, '{}'
             FROM store_onboarding WHERE store_id = ? AND profile_answered_at = ? AND profile_answered_by_user_id = ?`,
          )
          .bind(newId(), now, context.userId, storeId, now, context.userId),
      ]);
      if ((update?.meta.changes ?? 0) === 0) throw new FoodeDbError("conflict");
    },

    /** Marca "Sua Loja está pronta" como vista (aparece uma vez, ONB-04). Idempotente. */
    async acknowledgeReady(): Promise<void> {
      requireOwner();
      const now = utcNow();
      await d1.batch([
        ensureRow(d1, "store_onboarding", storeId, now),
        d1
          .prepare(
            `UPDATE store_onboarding SET ready_acknowledged_at = ?, updated_at = ?
             WHERE store_id = ? AND ready_acknowledged_at IS NULL`,
          )
          .bind(now, now, storeId),
        audit("onboarding.ready_acknowledged", {}, now),
      ]);
    },

    /** Dados e vitrine da Loja para as telas do Dono. */
    settings,

    /** O Slug está livre? (sem reservar; a gravação confere de novo pelo UNIQUE). */
    async slugStatus(slug: string): Promise<"current" | "taken" | "free"> {
      const row = await d1
        .prepare(`SELECT id FROM stores WHERE slug = ?`)
        .bind(slug)
        .first<{ id: string }>();
      if (!row) return "free";
      return row.id === storeId ? "current" : "taken";
    },

    /**
     * Troca (ou confirma) o Slug: UPDATE + Slug confirmado + auditoria `before`/`after` num batch.
     * Slug de outra Loja = `slug_unavailable` (UNIQUE), nada gravado. Sem histórico/redirect:
     * links e QR antigos param de funcionar (aviso na UI, LNK-02).
     */
    async setSlug(slug: string): Promise<void> {
      requireOwner();
      if (!SLUG_PATTERN.test(slug)) throw new FoodeDbError("invalid_input");
      const current = await d1
        .prepare(`SELECT slug FROM stores WHERE id = ?`)
        .bind(storeId)
        .first<{ slug: string }>();
      if (!current) throw new FoodeDbError("forbidden");
      const now = utcNow();
      const changed = current.slug !== slug;
      try {
        await d1.batch([
          d1
            .prepare(`UPDATE stores SET slug = ?, updated_at = ? WHERE id = ? AND slug = ?`)
            .bind(slug, now, storeId, current.slug),
          ensureRow(d1, "store_onboarding", storeId, now),
          d1
            .prepare(`UPDATE store_onboarding SET slug_confirmed_at = ? WHERE store_id = ?`)
            .bind(now, storeId),
          audit(
            changed ? "store.slug_changed" : "store.slug_confirmed",
            { before: { slug: current.slug }, after: { slug } },
            now,
          ),
        ]);
      } catch (error) {
        if (isUniqueViolation(error)) throw new FoodeDbError("slug_unavailable");
        throw error;
      }
    },

    /**
     * Contato e endereço. WhatsApp e endereço moram no cadastro do Ops (`store_profiles`): sem
     * cadastro = `conflict` (CNPJ/repasse são do Ops). Instagram fica na vitrine.
     */
    async setContact(data: StoreContactData): Promise<void> {
      requireOwner();
      const touchesProfile = data.whatsapp !== undefined || data.address !== undefined;
      const before = await settings();
      if (touchesProfile && before.address === null) throw new FoodeDbError("conflict");
      const now = utcNow();
      const statements: D1PreparedStatement[] = [];
      if (touchesProfile) {
        const address = data.address ?? before.address!;
        statements.push(
          d1
            .prepare(
              `UPDATE store_profiles SET whatsapp = ?, address_postal_code = ?, address_street = ?,
                 address_number = ?, address_complement = ?, address_district = ?,
                 address_city = ?, address_state = ?, updated_at = ?
               WHERE store_id = ?`,
            )
            .bind(
              data.whatsapp ?? before.whatsapp,
              address.postalCode,
              address.street,
              address.number,
              address.complement,
              address.district,
              address.city,
              address.state,
              now,
              storeId,
            ),
        );
      }
      if (data.instagram !== undefined) {
        statements.push(
          ensureRow(d1, "store_showcases", storeId, now),
          d1
            .prepare(`UPDATE store_showcases SET instagram = ? WHERE store_id = ?`)
            .bind(data.instagram, storeId),
        );
      }
      statements.push(
        audit(
          "store.contact_updated",
          {
            before: {
              whatsapp: before.whatsapp,
              instagram: before.instagram,
              address: before.address,
            },
            after: {
              whatsapp: data.whatsapp ?? before.whatsapp,
              instagram: data.instagram === undefined ? before.instagram : data.instagram,
              address: data.address ?? before.address,
            },
          },
          now,
        ),
      );
      await d1.batch(statements);
    },

    /** IDs de Pixel (null apaga). */
    async setPixels(data: { metaPixelId: string | null; googleTagId: string | null }) {
      requireOwner();
      const now = utcNow();
      await d1.batch([
        ensureRow(d1, "store_showcases", storeId, now),
        d1
          .prepare(
            `UPDATE store_showcases SET meta_pixel_id = ?, google_tag_id = ? WHERE store_id = ?`,
          )
          .bind(data.metaPixelId, data.googleTagId, storeId),
        audit("store.pixels_updated", { after: data }, now),
      ]);
    },

    /**
     * Descrição, logo e capa (só os campos enviados). Devolve as chaves que deixaram de ser usadas
     * (a api apaga do R2 depois de gravar).
     */
    async setShowcase(data: StoreShowcaseData): Promise<string[]> {
      requireOwner();
      const before = await showcaseKeys();
      const now = utcNow();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (data.description !== undefined) {
        sets.push("description = ?");
        params.push(data.description);
      }
      if (data.logoObjectKey !== undefined) {
        sets.push("logo_object_key = ?");
        params.push(data.logoObjectKey);
      }
      if (data.coverObjectKey !== undefined) {
        sets.push("cover_object_key = ?");
        params.push(data.coverObjectKey);
      }
      if (sets.length === 0) throw new FoodeDbError("invalid_input");
      await d1.batch([
        ensureRow(d1, "store_showcases", storeId, now),
        d1
          .prepare(`UPDATE store_showcases SET ${sets.join(", ")} WHERE store_id = ?`)
          .bind(...params, storeId),
        audit("store.showcase_updated", { after: data }, now),
      ]);
      const discarded: string[] = [];
      if (data.logoObjectKey !== undefined && before.logo && before.logo !== data.logoObjectKey) {
        discarded.push(before.logo);
      }
      if (
        data.coverObjectKey !== undefined &&
        before.cover &&
        before.cover !== data.coverObjectKey
      ) {
        discarded.push(before.cover);
      }
      return discarded;
    },

    async recordBrandImageUpload(kind: "logo" | "cover", objectKey: string): Promise<void> {
      requireOwner();
      await audit("store.brand_image_uploaded", { kind, objectKey }, utcNow()).run();
    },

    /** Contadores do funil desta Loja no período [from, to] (dias civis, inclusivo). */
    async funnelCounters(from: string, to: string): Promise<FunnelCounter[]> {
      const { results } = await d1
        .prepare(
          `SELECT day, event, count FROM store_funnel_daily
           WHERE store_id = ? AND day BETWEEN ? AND ? ORDER BY day, event`,
        )
        .bind(storeId, from, to)
        .all<FunnelCounter>();
      return results;
    },
  };
}

/** Respostas de perfil da Loja (Dono da Loja e Ops); null = não respondidas. */
export async function ownerProfileOf(
  d1: D1Database,
  storeId: string,
): Promise<OwnerProfileRow | null> {
  const row = await d1
    .prepare(
      `SELECT profile_cuisine AS cuisine, profile_cuisine_other AS cuisineOther,
              profile_goal AS goal, profile_goal_other AS goalOther,
              profile_answered_at AS answeredAt
       FROM store_onboarding WHERE store_id = ? AND profile_answered_at IS NOT NULL`,
    )
    .bind(storeId)
    .first<OwnerProfileRow>();
  return row ?? null;
}

/** Storefront: vitrine pública da Loja (já resolvida pelo Slug como `active`). */
export async function publicShowcaseOf(
  d1: D1Database,
  storeId: string,
): Promise<PublicShowcaseRow | null> {
  const row = await d1
    .prepare(`SELECT ${SHOWCASE_COLUMNS} FROM store_showcases sc WHERE sc.store_id = ?`)
    .bind(storeId)
    .first<PublicShowcaseRow>();
  return row ?? null;
}

/**
 * Conta um evento do funil para a Loja `active` do Slug no dia civil dado. Slug inexistente ou
 * Loja não ativa = false (nada gravado). Nenhum dado pessoal entra aqui.
 */
export async function recordFunnelEvent(
  d1: D1Database,
  slug: string,
  event: FunnelEventName,
  day: string,
): Promise<boolean> {
  if (!SLUG_PATTERN.test(slug)) return false;
  const now = utcNow();
  const result = await d1
    .prepare(
      `INSERT INTO store_funnel_daily (store_id, day, event, count, updated_at)
       SELECT id, ?, ?, 1, ? FROM stores WHERE slug = ? AND status = 'active'
       ON CONFLICT(store_id, day, event) DO UPDATE SET
         "count" = "count" + 1, updated_at = excluded.updated_at`,
    )
    .bind(day, event, now, slug)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
