import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import type { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

import type {
  BusinessDatabase,
  MembershipContext,
  OrderDetailView,
  PublicPixChargeView,
  WooviPaymentAdapter,
} from "@foode/db";
import {
  buildWhatsAppMeUrl,
  canTransitionOrder,
  cartLineContractSchema,
  fulfillmentTypeSchema,
  normalizeBrazilianMobilePhone,
  orderStatusSchema,
  paymentMethodSchema,
  type MembershipRole,
  type OrderStatus,
} from "@foode/shared";

import { fingerprintIdempotentPayload } from "./order-idempotency.js";
import { calculateStoreOperation } from "./store-operation.js";

const deliveryAddressSchema = z.object({
  complement: z.string().trim().max(120).optional().nullable(),
  neighborhood: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(160).optional().nullable(),
  streetLine: z.string().trim().min(1).max(200),
});

const createGuestOrderSchema = z
  .object({
    address: deliveryAddressSchema.optional().nullable(),
    /** Preview-only; servidor recalcula e ignora se divergir. */
    deliveryFeeCents: z.number().int().min(0).optional(),
    fulfillmentType: fulfillmentTypeSchema,
    guest: z.object({
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().min(8).max(40),
    }),
    lines: z.array(cartLineContractSchema).min(1).max(40),
    paymentMethod: paymentMethodSchema,
    /** Preview-only; servidor recalcula. */
    totalCents: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillmentType === "delivery") {
      if (!value.address) {
        ctx.addIssue({
          code: "custom",
          message: "address_required",
          path: ["address"],
        });
      }
    } else if (value.address != null) {
      ctx.addIssue({
        code: "custom",
        message: "address_not_allowed",
        path: ["address"],
      });
    }
  });

const transitionSchema = z.object({
  to: orderStatusSchema,
});

type RegisterOrderRoutesOptions = {
  businessDatabase: BusinessDatabase;
  now: () => Temporal.Instant;
  requireMembership: (
    request: FastifyRequest,
    reply: FastifyReply,
    requiredRole?: MembershipRole,
  ) => Promise<MembershipContext | undefined>;
  wooviAdapter?: WooviPaymentAdapter;
};

function publicPixCharge(charge: PublicPixChargeView) {
  return {
    brCode: charge.brCode,
    correlationId: charge.correlationId,
    expiresAt: charge.expiresAt,
    qrCodeImage: charge.qrCodeImage,
    status: charge.status,
  };
}

function publicConsumerOrder(
  order: OrderDetailView,
  pix?: PublicPixChargeView | null,
) {
  return {
    createdAt: order.createdAt,
    deliveryAddress: order.deliveryAddress,
    deliveryFeeCents: order.deliveryFeeCents,
    deliveryFeeModeSnapshot: order.deliveryFeeModeSnapshot,
    fulfillmentType: order.fulfillmentType,
    guestName: order.guestName,
    itemsTotalCents: order.itemsTotalCents,
    lines: order.lines.map((line) => ({
      additionalSnapshots: line.additionalSnapshots,
      complementSnapshots: line.complementSnapshots,
      itemName: line.itemName,
      lineTotalCents: line.lineTotalCents,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    ...(pix ? { pix: publicPixCharge(pix) } : {}),
    publicCode: order.publicCode,
    status: order.status,
    totalCents: order.totalCents,
  };
}

function staffOrder(order: OrderDetailView) {
  return {
    ...publicConsumerOrder(order),
    guestPhoneE164: order.guestPhoneE164,
    id: order.id,
    updatedAt: order.updatedAt,
  };
}

export function registerPublicOrderRoutes(
  app: FastifyInstance,
  options: Pick<
    RegisterOrderRoutesOptions,
    "businessDatabase" | "now" | "wooviAdapter"
  >,
) {
  const { businessDatabase, now, wooviAdapter } = options;

  app.post<{ Body: unknown; Params: { slug: string } }>(
    "/public/stores/:slug/orders",
    async (request, reply) => {
      const slug = request.params.slug.trim().toLowerCase();
      if (!slug || slug.length > 80) {
        return reply.code(404).send({ error: "store_not_found" });
      }

      const idempotencyKey = String(
        request.headers["idempotency-key"] ?? "",
      ).trim();
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        return reply.code(400).send({ error: "idempotency_key_required" });
      }

      const body = createGuestOrderSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_order" });
      }

      const phone = normalizeBrazilianMobilePhone(body.data.guest.phone);
      if (!phone.ok) {
        return reply.code(400).send({ error: "invalid_phone" });
      }

      const requestNow = now();
      const operationConfig =
        await businessDatabase.findPublicStoreOperationBySlug(slug);
      if (!operationConfig) {
        return reply.code(404).send({ error: "store_not_found" });
      }
      const operation = calculateStoreOperation({
        ...operationConfig,
        now: requestNow,
      });
      if (!operation.checkout.allowed) {
        return reply.code(409).send({
          error:
            operation.checkout.blockReason === "paused"
              ? "store_paused"
              : "store_outside_hours",
        });
      }

      const address =
        body.data.fulfillmentType === "delivery" && body.data.address
          ? {
              complement: body.data.address.complement ?? null,
              neighborhood: body.data.address.neighborhood,
              reference: body.data.address.reference ?? null,
              streetLine: body.data.address.streetLine,
            }
          : null;

      const payloadHash = fingerprintIdempotentPayload({
        address,
        fulfillmentType: body.data.fulfillmentType,
        guest: { name: body.data.guest.name, phone: phone.e164 },
        lines: body.data.lines,
        paymentMethod: body.data.paymentMethod,
        storeSlug: slug,
      });

      let result: Awaited<ReturnType<BusinessDatabase["createGuestOrder"]>>;
      try {
        result = await businessDatabase.createGuestOrder({
          address,
          fulfillmentType: body.data.fulfillmentType,
          guestName: body.data.guest.name,
          guestPhoneE164: phone.e164,
          idempotencyKey,
          lines: body.data.lines,
          nowIso: requestNow.toString(),
          payloadHash,
          paymentMethod: body.data.paymentMethod,
          storeSlug: slug,
        });
      } catch (error) {
        request.log.error({ err: error }, "order_create_failed");
        return reply.code(500).send({ error: "order_create_failed" });
      }

      if (result.kind === "store_not_found") {
        return reply.code(404).send({ error: "store_not_found" });
      }
      if (result.kind === "pickup_disabled") {
        return reply.code(409).send({ error: "pickup_disabled" });
      }
      if (result.kind === "delivery_not_configured") {
        return reply.code(409).send({ error: "delivery_not_configured" });
      }
      if (result.kind === "neighborhood_not_served") {
        return reply.code(409).send({ error: "neighborhood_not_served" });
      }
      if (result.kind === "invalid_address") {
        return reply.code(400).send({ error: "invalid_address" });
      }
      if (result.kind === "store_paused") {
        return reply.code(409).send({ error: "store_paused" });
      }
      if (result.kind === "store_outside_hours") {
        return reply.code(409).send({ error: "store_outside_hours" });
      }
      if (result.kind === "billing_mode_not_allowed") {
        return reply.code(409).send({ error: "billing_mode_not_allowed" });
      }
      if (result.kind === "conflict") {
        return reply.code(409).send({ error: "idempotency_key_conflict" });
      }
      if (result.kind === "recalculation_failed") {
        return reply.code(409).send({ error: result.error });
      }

      let pix: PublicPixChargeView | null = null;
      if (
        body.data.paymentMethod === "pix" &&
        (result.kind === "created" || result.kind === "replay")
      ) {
        if (!wooviAdapter) {
          return reply.code(503).send({ error: "pix_provider_unavailable" });
        }
        const activated = await businessDatabase.activatePixCharge({
          adapter: wooviAdapter,
          orderId: result.order.id,
          storeId: result.order.storeId,
        });
        if (activated.kind === "provider_error") {
          return reply.code(502).send({ error: "pix_provider_error" });
        }
        if (activated.kind !== "ready") {
          return reply.code(502).send({ error: "pix_charge_unavailable" });
        }
        pix = activated.charge;
      }

      if (result.kind === "created") {
        return reply.code(201).send({
          order: {
            ...publicConsumerOrder(result.order, pix),
            accessToken: result.accessToken,
          },
        });
      }

      return reply
        .code(200)
        .send({ order: publicConsumerOrder(result.order, pix) });
    },
  );

  app.get<{ Params: { accessToken: string } }>(
    "/public/orders/:accessToken",
    async (request, reply) => {
      const accessToken = request.params.accessToken.trim();
      if (accessToken.length < 32) {
        return reply.code(404).send({ error: "order_not_found" });
      }

      const tracking =
        await businessDatabase.findPublicOrderTracking(accessToken);
      if (!tracking) {
        return reply.code(404).send({ error: "order_not_found" });
      }

      const pix =
        tracking.order.paymentMethod === "pix"
          ? await businessDatabase.findPublicPixCharge({
              orderId: tracking.order.id,
              storeId: tracking.order.storeId,
            })
          : null;

      const whatsappUrl = tracking.contactPhoneE164
        ? buildWhatsAppMeUrl(
            tracking.contactPhoneE164,
            `Olá! Meu pedido é ${tracking.order.publicCode}.`,
          )
        : null;

      return reply.code(200).send({
        order: publicConsumerOrder(tracking.order, pix),
        store: {
          contactPhoneE164: tracking.contactPhoneE164,
          name: tracking.storeName,
          slug: tracking.storeSlug,
        },
        whatsappUrl,
      });
    },
  );
}

export function registerStaffOrderRoutes(
  app: FastifyInstance,
  options: Pick<
    RegisterOrderRoutesOptions,
    "businessDatabase" | "requireMembership"
  >,
) {
  const { businessDatabase, requireMembership } = options;

  app.get("/orders", async (request, reply) => {
    const context = await requireMembership(request, reply);
    if (!context) return reply;

    const orders = await businessDatabase.listOrders(context);
    return reply.code(200).send({ orders });
  });

  app.get<{ Params: { orderId: string } }>(
    "/orders/:orderId",
    async (request, reply) => {
      const context = await requireMembership(request, reply);
      if (!context) return reply;

      const orderId = z.uuid().safeParse(request.params.orderId);
      if (!orderId.success) {
        return reply.code(404).send({ error: "order_not_found" });
      }

      const order = await businessDatabase.findStoreOrder(
        context,
        orderId.data,
      );
      if (!order) {
        return reply.code(404).send({ error: "order_not_found" });
      }
      return reply.code(200).send({ order: staffOrder(order) });
    },
  );

  app.post<{ Body: unknown; Params: { orderId: string } }>(
    "/orders/:orderId/transitions",
    async (request, reply) => {
      const context = await requireMembership(request, reply);
      if (!context) return reply;

      const orderId = z.uuid().safeParse(request.params.orderId);
      if (!orderId.success) {
        return reply.code(404).send({ error: "order_not_found" });
      }

      const body = transitionSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_transition" });
      }

      const current = await businessDatabase.findStoreOrder(
        context,
        orderId.data,
      );
      if (!current) {
        return reply.code(404).send({ error: "order_not_found" });
      }
      if (
        !canTransitionOrder(
          current.fulfillmentType,
          current.status,
          body.data.to as OrderStatus,
        )
      ) {
        return reply.code(409).send({ error: "invalid_transition" });
      }

      const updated = await businessDatabase.transitionOrder(
        context,
        orderId.data,
        current.status,
        body.data.to,
      );
      if (updated.kind === "not_found") {
        return reply.code(404).send({ error: "order_not_found" });
      }
      if (updated.kind === "conflict") {
        return reply.code(409).send({ error: "invalid_transition" });
      }
      return reply.code(200).send({ order: staffOrder(updated.order) });
    },
  );
}
