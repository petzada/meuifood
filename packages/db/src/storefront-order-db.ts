// Storefront do Ticket 24a no D1: estado público da Loja, criação idempotente do Pedido,
// acompanhamento por token e busca de dados pelo telefone. Sem StoreContext (Consumidor anônimo):
// a Loja sai SÓ do Slug, sempre `active`, e cada consulta filtra pela Loja do Slug.
//
// Criação do Pedido (achado 19.1): um único `batch` (transação do D1) com INSERT…SELECT
// condicional. A Loja `active`, a Pausa, o horário (dia e HH:MM civis de São Paulo calculados
// pela api no mesmo instante da cotação), a Retirada/Delivery, o bairro ativo com a taxa cotada, o
// pedido mínimo e os itens disponíveis com o preço cotado são conferidos NA MESMA escrita; se
// qualquer condição falhou, nada é gravado e a api recalcula com o estado novo (que diz o motivo).
// Idempotência: UNIQUE (store_id, idempotency_key) + ON CONFLICT DO NOTHING; o batch devolve o
// Pedido gravado com a chave (o nosso, ou o de uma tentativa anterior).
//
// Cupom e conta (Ticket 13): o Pedido nasce ligado à conta do Consumidor autenticado
// (`customer_account_id`). Cupom promocional: a MESMA escrita confere que o Cupom segue ativo, na
// versão cotada (`updated_at`) e com uso livre (`used_count < usage_limit`), conta +1 e grava o uso
// (`coupon_redemptions`); o CHECK `used_count <= usage_limit` é a última barreira. Boas-vindas: a
// escrita confere o programa ativo na versão cotada e que a conta (ou o telefone verificado dela)
// não tem Pedido nem uso de boas-vindas NESTA Loja (UNIQUE parcial por conta e Loja).
//
// Dados pessoais: nada aqui registra log. A busca por telefone grava em `phone_lookups` só o hash
// do IP truncado e o resultado; o telefone não é gravado (só comparado com o do Pedido).
import { newId } from "./conventions";
import { publicMenuForStore, type PublicStoreMenu } from "./menu";
import type {
  OperationEta,
  OperationSettings,
  OrderAddressData,
  OrderFulfillment,
  OrderLineData,
  OrderLineRowView,
  OrderPaymentMethod,
  OrderRowView,
} from "./store-operation-db";
import {
  readOperationSettings,
  SELECT_ORDER_COLUMNS,
  SELECT_ORDER_LINES,
  toOrderAddress,
  toOrderLines,
} from "./store-operation-db";

const SLUG_PATTERN = /^(?=.{3,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type StorefrontStoreProfile = {
  whatsapp: string;
  address: {
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
  };
};

/** Loja `active` com a configuração operacional (estado público e base da cotação). */
export type StorefrontOperation = {
  store: { id: string; slug: string; name: string };
  profile: StorefrontStoreProfile | null;
  operation: OperationSettings;
};

export type CheckoutSnapshot = StorefrontOperation & { menu: PublicStoreMenu };

export type CreateOrderDelivery =
  | { mode: "fixed"; feeCents: number }
  | { mode: "neighborhood"; neighborhoodId: string; feeCents: number };

/** Cupom cotado para a escrita do Pedido (conferido e contado na mesma escrita). */
export type CreateOrderCoupon =
  | { source: "promo"; couponId: string; version: string; discountCents: number }
  | {
      source: "welcome";
      version: string;
      accountId: string;
      /** Telefone verificado da conta (Pedidos Guest com ele contam como compra na Loja). */
      accountPhoneE164: string;
      discountCents: number;
    };

export type CreateOrderData = {
  slug: string;
  orderId: string;
  accessTokenHash: string;
  idempotencyKey: string;
  payloadHash: string;
  /** Instante da cotação (ISO UTC) e o mesmo instante em São Paulo (dia ISO 1–7 e HH:MM). */
  now: string;
  civil: { weekday: number; time: string };
  fulfillment: OrderFulfillment;
  paymentMethod: OrderPaymentMethod;
  customerName: string;
  customerPhoneE164: string;
  delivery: (CreateOrderDelivery & { address: OrderAddressData }) | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  changeForCents: number | null;
  note: string | null;
  eta: OperationEta | null;
  lines: Array<OrderLineData & { menuItemId: string }>;
  /** Itens cotados com o preço base: o INSERT só passa se continuam disponíveis e com esse preço. */
  itemPrices: Array<{ id: string; priceCents: number }>;
  /** Conta do Consumidor autenticado (Ticket 13); null = Guest. */
  customerAccountId?: string | null;
  /** Cupom aplicado (Ticket 13); null = sem desconto (`discountCents` = 0). */
  coupon?: CreateOrderCoupon | null;
  /** Tarifa de serviço do pagamento online (decisão 71), fora de `totalCents`; 0 na entrega. */
  serviceFeeCents?: number;
  /**
   * Intenção de pagamento online (Ticket 26), gravada na MESMA escrita do Pedido e antes de
   * chamar o provedor. Presente = Pedido nasce `payment_status = 'awaiting'`.
   */
  paymentIntent?: CreatePaymentIntent | null;
};

/**
 * Snapshot da intenção gravado com o Pedido (o `intentId` é a chave de idempotência). PIX
 * (Ticket 26) ou a 1ª tentativa de Cartão (Ticket 27: provedor do modo da Loja, `card_payments`
 * com `attempt_key` = `idempotencyKey` do checkout, bandeira/últimos 4 só para exibir).
 */
export type CreatePaymentIntent =
  | {
      intentId: string;
      provider: "abacatepay";
      method: "pix";
      /** Valor cobrado = `totalCents + serviceFeeCents`. */
      amountCents: number;
      foodeFee: { feeId: string; percentBps: number; fixedCents: number };
    }
  | {
      intentId: string;
      provider: "efi" | "abacatepay";
      method: "credit";
      cardMode: "normal" | "rapido";
      amountCents: number;
      foodeFee: { feeId: string; percentBps: number; fixedCents: number };
      brand: "visa" | "mastercard" | "elo" | "amex" | "hipercard" | "diners" | "other" | null;
      lastFour: string | null;
    };

export type CreateOrderResult =
  | { kind: "created"; orderId: string; code: number }
  /** Já existia Pedido com a chave (retry ou corrida): a api compara o hash do corpo. */
  | { kind: "existing"; orderId: string; code: number; payloadHash: string }
  /** Alguma condição falhou na escrita: nada gravado; a api recalcula com o estado novo. */
  | { kind: "rejected" };

export type IdempotentOrder = { orderId: string; code: number; payloadHash: string };

/** Pedido pela página de acompanhamento. */
export type TrackedOrder = {
  store: { slug: string; name: string; whatsapp: string | null };
  order: Omit<OrderRowView, "customerPhone"> & { lines: OrderLineData[] };
  address: OrderAddressData | null;
};

export type PhoneLookupMatch =
  | { found: false }
  | { found: true; customerName: string; street: string | null; neighborhood: string | null };

export type PhoneLookupConfirmed = {
  customerName: string;
  customerPhone: string;
  address: OrderAddressData | null;
};

type StoreRow = {
  id: string;
  slug: string;
  name: string;
  whatsapp: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};

const ACTIVE_STORE_BY_SLUG = `(SELECT id FROM stores WHERE slug = ? AND status = 'active')`;

export function createStorefrontOrderOps(d1: D1Database) {
  async function operationBySlug(slug: string): Promise<StorefrontOperation | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    const store = await d1
      .prepare(
        `SELECT s.id AS id, s.slug AS slug, s.name AS name, p.whatsapp AS whatsapp,
                p.address_street AS street, p.address_number AS number,
                p.address_complement AS complement, p.address_district AS district,
                p.address_city AS city, p.address_state AS state
         FROM stores s LEFT JOIN store_profiles p ON p.store_id = s.id
         WHERE s.slug = ? AND s.status = 'active' LIMIT 1`,
      )
      .bind(slug)
      .first<StoreRow>();
    if (!store) return null;
    const operation = await readOperationSettings(d1, store.id);
    const profile: StorefrontStoreProfile | null =
      store.whatsapp && store.street && store.number && store.district && store.city && store.state
        ? {
            whatsapp: store.whatsapp,
            address: {
              street: store.street,
              number: store.number,
              complement: store.complement,
              district: store.district,
              city: store.city,
              state: store.state,
            },
          }
        : null;
    return { store: { id: store.id, slug: store.slug, name: store.name }, profile, operation };
  }

  async function findByIdempotencyKey(slug: string, key: string): Promise<IdempotentOrder | null> {
    if (!SLUG_PATTERN.test(slug)) return null;
    const row = await d1
      .prepare(
        `SELECT id AS orderId, code, idempotency_payload_hash AS payloadHash FROM orders
         WHERE store_id = ${ACTIVE_STORE_BY_SLUG} AND idempotency_key = ?`,
      )
      .bind(slug, key)
      .first<IdempotentOrder>();
    return row ?? null;
  }

  return {
    /** Estado público: Loja `active` do Slug + configuração; null = inexistente ou não ativa. */
    operationBySlug,

    /** Base da cotação/criação: estado + Cardápio público, lidos agora. */
    async checkoutSnapshot(slug: string): Promise<CheckoutSnapshot | null> {
      const state = await operationBySlug(slug);
      if (!state) return null;
      const menu = await publicMenuForStore(d1, state.store);
      return { ...state, menu };
    },

    /** Pedido já gravado com a chave nesta Loja (replay antes de recalcular). */
    findByIdempotencyKey,

    /** Cria o Pedido com todas as condições na mesma escrita (ver cabeçalho). */
    async createOrder(input: CreateOrderData): Promise<CreateOrderResult> {
      const guards: string[] = [
        "s.slug = ?",
        "s.status = 'active'",
        "st.paused = 0",
        `EXISTS (SELECT 1 FROM store_opening_periods p WHERE p.store_id = s.id
           AND p.weekday = ? AND p.opens_at <= ? AND p.closes_at > ?)`,
        `(SELECT COUNT(*) FROM json_each(?) j
           JOIN menu_items m ON m.store_id = s.id AND m.id = json_extract(j.value, '$.id')
             AND m.available = 1 AND m.price_cents = json_extract(j.value, '$.priceCents')
           JOIN menu_categories c ON c.store_id = s.id AND c.id = m.category_id AND c.available = 1
         ) = json_array_length(?)`,
      ];
      const itemsJson = JSON.stringify(input.itemPrices);
      const guardBinds: unknown[] = [
        input.slug,
        input.civil.weekday,
        input.civil.time,
        input.civil.time,
        itemsJson,
        itemsJson,
      ];
      const delivery = input.delivery;
      if (input.fulfillment === "pickup" || !delivery) {
        guards.push(
          "st.pickup_enabled = 1",
          "EXISTS (SELECT 1 FROM store_profiles sp WHERE sp.store_id = s.id)",
        );
      } else {
        guards.push(
          "(st.delivery_minimum_order_cents IS NULL OR st.delivery_minimum_order_cents <= ?)",
        );
        guardBinds.push(input.subtotalCents);
        if (delivery.mode === "fixed") {
          guards.push("st.delivery_mode = 'fixed'", "st.delivery_fixed_fee_cents = ?");
          guardBinds.push(delivery.feeCents);
        } else {
          guards.push(
            "st.delivery_mode = 'neighborhood'",
            `EXISTS (SELECT 1 FROM delivery_neighborhoods n WHERE n.store_id = s.id AND n.id = ?
               AND n.active = 1 AND n.fee_cents = ? AND n.name = ?)`,
          );
          guardBinds.push(
            delivery.neighborhoodId,
            delivery.feeCents,
            delivery.address.neighborhood,
          );
        }
      }
      const coupon = input.coupon ?? null;
      if (coupon?.source === "promo") {
        guards.push(
          `EXISTS (SELECT 1 FROM coupons c WHERE c.store_id = s.id AND c.id = ? AND c.active = 1
             AND c.updated_at = ? AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit))`,
        );
        guardBinds.push(coupon.couponId, coupon.version);
      } else if (coupon?.source === "welcome") {
        guards.push(
          `EXISTS (SELECT 1 FROM store_welcome_coupons w WHERE w.store_id = s.id AND w.active = 1
             AND w.updated_at = ?)`,
          `NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.store_id = s.id
             AND (o2.customer_account_id = ? OR o2.customer_phone_e164 = ?))`,
          `NOT EXISTS (SELECT 1 FROM coupon_redemptions r WHERE r.store_id = s.id
             AND r.source = 'welcome' AND r.customer_account_id = ?)`,
        );
        guardBinds.push(
          coupon.version,
          coupon.accountId,
          coupon.accountPhoneE164,
          coupon.accountId,
        );
      }
      if (coupon && coupon.discountCents !== input.discountCents) {
        throw new RangeError("checkout: desconto do Cupom diferente do desconto do Pedido");
      }
      const address = delivery?.address ?? null;
      const lines = input.lines.map((line) => ({ ...line, id: newId() }));
      const intent = input.paymentIntent ?? null;
      const serviceFeeCents = input.serviceFeeCents ?? 0;
      if (intent && intent.amountCents !== input.totalCents + serviceFeeCents) {
        throw new RangeError("checkout: valor da intenção diferente de total + tarifa de serviço");
      }
      if (intent && intent.method !== input.paymentMethod) {
        throw new RangeError("checkout: meio da intenção diferente do meio do Pedido");
      }
      if (!intent && serviceFeeCents !== 0) {
        throw new RangeError("checkout: tarifa de serviço só com pagamento online");
      }
      // A intenção só nasce se o Pedido desta chamada foi gravado (`WHERE id = ?` com o nosso id).
      const intentStatements: D1PreparedStatement[] = intent
        ? [
            d1
              .prepare(
                `INSERT INTO payment_intents (id, store_id, order_id, provider, method, card_mode,
                   custody, amount_cents, service_fee_cents, foode_fee_id, foode_fee_percent_bps,
                   foode_fee_fixed_cents, state, created_at, updated_at)
                 SELECT ?, store_id, id, ?, ?, ?, 'pilot_platform', ?, ?, ?, ?, ?, 'creating',
                   created_at, created_at
                 FROM orders WHERE id = ?`,
              )
              .bind(
                intent.intentId,
                intent.provider,
                intent.method,
                intent.method === "credit" ? intent.cardMode : null,
                intent.amountCents,
                serviceFeeCents,
                intent.foodeFee.feeId,
                intent.foodeFee.percentBps,
                intent.foodeFee.fixedCents,
                input.orderId,
              ),
            ...(intent.method === "credit"
              ? [
                  d1
                    .prepare(
                      `INSERT INTO card_payments (intent_id, store_id, order_id, attempt_key, state,
                         brand, last_four, created_at, updated_at)
                       SELECT id, store_id, order_id, ?, 'processing', ?, ?, created_at, created_at
                       FROM payment_intents WHERE id = ?`,
                    )
                    .bind(
                      input.idempotencyKey.toLowerCase(),
                      intent.brand,
                      intent.lastFour,
                      intent.intentId,
                    ),
                ]
              : []),
          ]
        : [];

      const couponStatements: D1PreparedStatement[] = [];
      if (coupon) {
        if (coupon.source === "promo") {
          couponStatements.push(
            d1
              .prepare(
                `UPDATE coupons SET used_count = used_count + 1
                 WHERE id = ? AND store_id = (SELECT store_id FROM orders WHERE id = ?)`,
              )
              .bind(coupon.couponId, input.orderId),
          );
        }
        couponStatements.push(
          d1
            .prepare(
              `INSERT INTO coupon_redemptions (id, store_id, order_id, source, coupon_id,
                 customer_account_id, discount_cents, created_at)
               SELECT ?, store_id, id, ?, ?, ?, ?, created_at FROM orders WHERE id = ?`,
            )
            .bind(
              newId(),
              coupon.source,
              coupon.source === "promo" ? coupon.couponId : null,
              coupon.source === "welcome" ? coupon.accountId : (input.customerAccountId ?? null),
              coupon.discountCents,
              input.orderId,
            ),
        );
      }

      const results = await d1.batch([
        d1
          .prepare(
            `INSERT INTO orders (id, store_id, code, access_token_hash, idempotency_key,
               idempotency_payload_hash, status, fulfillment, payment_method, customer_name,
               customer_phone_e164, delivery_postal_code, delivery_street, delivery_number,
               delivery_complement, delivery_reference, delivery_neighborhood, delivery_fee_mode,
               items_subtotal_cents, delivery_fee_cents, discount_cents, total_cents,
               change_for_cents, note, eta_min_minutes, eta_max_minutes, created_at, updated_at,
               customer_account_id, payment_status, service_fee_cents)
             SELECT ?, s.id, (SELECT COALESCE(MAX(o.code), 0) + 1 FROM orders o WHERE o.store_id = s.id),
               ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             FROM stores s JOIN store_operation_settings st ON st.store_id = s.id
             WHERE ${guards.join(" AND ")}
             ON CONFLICT(store_id, idempotency_key) DO NOTHING`,
          )
          .bind(
            input.orderId,
            input.accessTokenHash,
            input.idempotencyKey,
            input.payloadHash,
            input.fulfillment,
            input.paymentMethod,
            input.customerName,
            input.customerPhoneE164,
            address?.postalCode ?? null,
            address?.street ?? null,
            address?.number ?? null,
            address?.complement ?? null,
            address?.reference ?? null,
            address?.neighborhood ?? null,
            delivery?.mode ?? null,
            input.subtotalCents,
            input.deliveryFeeCents,
            input.discountCents,
            input.totalCents,
            input.changeForCents,
            input.note,
            input.eta?.minMinutes ?? null,
            input.eta?.maxMinutes ?? null,
            input.now,
            input.now,
            input.customerAccountId ?? null,
            intent ? "awaiting" : "not_required",
            serviceFeeCents,
            ...guardBinds,
          ),
        d1
          .prepare(
            `INSERT INTO order_lines (id, store_id, order_id, position, menu_item_id, item_name,
               unit_price_cents, quantity, line_total_cents, complements, additionals, created_at)
             SELECT json_extract(j.value, '$.id'), o.store_id, o.id, CAST(j.key AS INTEGER),
               json_extract(j.value, '$.menuItemId'), json_extract(j.value, '$.itemName'),
               json_extract(j.value, '$.unitPriceCents'), json_extract(j.value, '$.quantity'),
               json_extract(j.value, '$.totalCents'), json_extract(j.value, '$.complements'),
               json_extract(j.value, '$.additionals'), o.created_at
             FROM orders o, json_each(?) j WHERE o.id = ?`,
          )
          .bind(JSON.stringify(lines), input.orderId),
        d1
          .prepare(
            `INSERT INTO order_status_events (id, store_id, order_id, from_status, to_status, actor_user_id, actor_role, occurred_at)
             SELECT ?, store_id, id, NULL, 'received', NULL, NULL, created_at FROM orders WHERE id = ?`,
          )
          .bind(newId(), input.orderId),
        ...couponStatements,
        ...intentStatements,
        d1
          .prepare(
            `SELECT id AS orderId, code, idempotency_payload_hash AS payloadHash FROM orders
             WHERE store_id = ${ACTIVE_STORE_BY_SLUG} AND idempotency_key = ?`,
          )
          .bind(input.slug, input.idempotencyKey),
      ]);
      const saved = results[results.length - 1];
      const row = (saved?.results as IdempotentOrder[] | undefined)?.[0];
      if (!row) return { kind: "rejected" };
      if (row.orderId === input.orderId) {
        return { kind: "created", orderId: row.orderId, code: row.code };
      }
      return { kind: "existing", ...row };
    },

    /** Página do Pedido: token (hash) desta Loja `active`; outra Loja ou inexistente = null. */
    async orderByTokenHash(slug: string, tokenHash: string): Promise<TrackedOrder | null> {
      if (!SLUG_PATTERN.test(slug)) return null;
      const row = await d1
        .prepare(
          `SELECT ${SELECT_ORDER_COLUMNS}, o.store_id AS storeId, s.slug AS storeSlug,
                  s.name AS storeName, p.whatsapp AS storeWhatsapp
           FROM orders o JOIN stores s ON s.id = o.store_id
           LEFT JOIN store_profiles p ON p.store_id = s.id
           WHERE o.access_token_hash = ? AND s.slug = ? AND s.status = 'active'`,
        )
        .bind(tokenHash, slug)
        .first<
          OrderRowView & {
            storeId: string;
            storeSlug: string;
            storeName: string;
            storeWhatsapp: string | null;
          }
        >();
      if (!row) return null;
      const { results } = await d1
        .prepare(SELECT_ORDER_LINES)
        .bind(row.storeId, row.id)
        .all<OrderLineRowView>();
      // Sem telefone nem id da Loja: a página do Pedido não precisa deles.
      const order: TrackedOrder["order"] = {
        id: row.id,
        code: row.code,
        status: row.status,
        fulfillment: row.fulfillment,
        createdAt: row.createdAt,
        customerName: row.customerName,
        paymentMethod: row.paymentMethod,
        postalCode: row.postalCode,
        street: row.street,
        number: row.number,
        complement: row.complement,
        reference: row.reference,
        neighborhood: row.neighborhood,
        subtotalCents: row.subtotalCents,
        deliveryFeeCents: row.deliveryFeeCents,
        discountCents: row.discountCents,
        totalCents: row.totalCents,
        serviceFeeCents: row.serviceFeeCents,
        changeForCents: row.changeForCents,
        note: row.note,
        etaMin: row.etaMin,
        etaMax: row.etaMax,
        lines: toOrderLines(results),
      };
      return {
        store: { slug: row.storeSlug, name: row.storeName, whatsapp: row.storeWhatsapp },
        order,
        address: toOrderAddress(row),
      };
    },

    /**
     * Busca por telefone, passo 1: registra a consulta em `phone_lookups` (Loja `active` do Slug,
     * hash do IP) e decide o rate limit por IP na MESMA escrita (conta as consultas do IP nesta
     * Loja desde `windowStart`). null = Loja inexistente/não ativa (nada gravado).
     */
    async phoneLookupBegin(input: {
      slug: string;
      ipHash: string;
      now: string;
      windowStart: string;
      max: number;
    }): Promise<{ lookupId: string; rateLimited: boolean } | null> {
      if (!SLUG_PATTERN.test(input.slug)) return null;
      const lookupId = newId();
      const row = await d1
        .prepare(
          `INSERT INTO phone_lookups (id, store_id, occurred_at, ip_hash, result)
           SELECT ?, s.id, ?, ?, CASE WHEN (SELECT COUNT(*) FROM phone_lookups l
               WHERE l.ip_hash = ? AND l.store_id = s.id AND l.occurred_at > ?) >= ?
             THEN 'rate_limited' ELSE 'not_found' END
           FROM stores s WHERE s.slug = ? AND s.status = 'active'
           RETURNING result`,
        )
        .bind(
          lookupId,
          input.now,
          input.ipHash,
          input.ipHash,
          input.windowStart,
          input.max,
          input.slug,
        )
        .first<{ result: string }>();
      if (!row) return null;
      return { lookupId, rateLimited: row.result === "rate_limited" };
    },

    /** Passo 2 (falha): fecha a consulta como `rate_limited` (por telefone) ou `captcha_failed`. */
    async phoneLookupFail(
      lookupId: string,
      result: "rate_limited" | "captcha_failed",
    ): Promise<void> {
      await d1
        .prepare(`UPDATE phone_lookups SET result = ? WHERE id = ? AND result = 'not_found'`)
        .bind(result, lookupId)
        .run();
    },

    /**
     * Passo 2 (busca): Pedido mais recente do telefone NA MESMA Loja da consulta. Encontrado,
     * grava `found` com o Pedido e o hash do token do "Sou eu" (uso único, vence em `expiresAt`) e
     * devolve só o necessário para a máscara (a api corta o nome no primeiro nome).
     */
    async phoneLookupMatch(input: {
      lookupId: string;
      phoneE164: string;
      confirmTokenHash: string;
      expiresAt: string;
    }): Promise<PhoneLookupMatch> {
      const latest = `(SELECT o.id FROM orders o WHERE o.store_id = phone_lookups.store_id
        AND o.customer_phone_e164 = ? ORDER BY o.created_at DESC, o.code DESC LIMIT 1)`;
      const [, match] = await d1.batch([
        d1
          .prepare(
            `UPDATE phone_lookups SET result = 'found', matched_order_id = ${latest},
               confirm_token_hash = ?, confirm_expires_at = ?
             WHERE id = ? AND result = 'not_found' AND ${latest} IS NOT NULL`,
          )
          .bind(
            input.phoneE164,
            input.confirmTokenHash,
            input.expiresAt,
            input.lookupId,
            input.phoneE164,
          ),
        d1
          .prepare(
            `SELECT o.customer_name AS customerName, o.delivery_street AS street,
                    o.delivery_neighborhood AS neighborhood
             FROM phone_lookups l JOIN orders o ON o.store_id = l.store_id AND o.id = l.matched_order_id
             WHERE l.id = ? AND l.result = 'found'`,
          )
          .bind(input.lookupId),
      ]);
      const row = (
        match?.results as
          { customerName: string; street: string | null; neighborhood: string | null }[] | undefined
      )?.[0];
      return row ? { found: true, ...row } : { found: false };
    },

    /**
     * "Sou eu": consome o token (uso único, não vencido, desta Loja `active`) e devolve os dados
     * completos do Pedido encontrado. Token usado, vencido ou de outra Loja = null.
     */
    async phoneLookupConfirm(input: {
      slug: string;
      confirmTokenHash: string;
      now: string;
    }): Promise<PhoneLookupConfirmed | null> {
      if (!SLUG_PATTERN.test(input.slug)) return null;
      // Consome o token numa escrita só (uso único): só quem de fato marcou `confirmed_at`
      // recebe o id do Pedido; uma segunda chamada no mesmo instante não acha nada.
      const consumed = await d1
        .prepare(
          `UPDATE phone_lookups SET confirmed_at = ?
           WHERE confirm_token_hash = ? AND result = 'found' AND confirmed_at IS NULL
             AND confirm_expires_at > ? AND store_id = ${ACTIVE_STORE_BY_SLUG}
           RETURNING store_id AS storeId, matched_order_id AS orderId`,
        )
        .bind(input.now, input.confirmTokenHash, input.now, input.slug)
        .first<{ storeId: string; orderId: string | null }>();
      if (!consumed?.orderId) return null;
      const found = await d1
        .prepare(
          `SELECT o.customer_name AS customerName, o.customer_phone_e164 AS customerPhone,
                  o.delivery_postal_code AS postalCode, o.delivery_street AS street,
                  o.delivery_number AS number, o.delivery_complement AS complement,
                  o.delivery_reference AS reference, o.delivery_neighborhood AS neighborhood
           FROM orders o WHERE o.store_id = ? AND o.id = ?`,
        )
        .bind(consumed.storeId, consumed.orderId)
        .all();
      type Row = {
        customerName: string;
        customerPhone: string;
        postalCode: string | null;
        street: string | null;
        number: string | null;
        complement: string | null;
        reference: string | null;
        neighborhood: string | null;
      };
      const row = (found?.results as Row[] | undefined)?.[0];
      if (!row) return null;
      return {
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        address: toOrderAddress(row),
      };
    },
  };
}

export type StorefrontOrderOps = ReturnType<typeof createStorefrontOrderOps>;
