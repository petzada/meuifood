import Fastify, {
  type FastifyBaseLogger,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import pino, { type DestinationStream } from "pino";
import { z } from "zod";

import type { BusinessDatabase, MembershipContext } from "@foode/db";
import { healthResponseSchema, type MembershipRole } from "@foode/shared";

import { safeLoggerOptions } from "./logger.js";
import type { MemberInvitationService } from "./member-invitations.js";
import type { MenuImageStorage } from "./menu-image-storage.js";
import {
  assertMenuImageUploadRequest,
  isOwnedMenuImageObjectKey,
  menuImageObjectKey,
  publicMenuImageUrl,
} from "./menu-images.js";
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";
import { registerMenuCustomizationRoutes } from "./menu-customization-routes.js";

type BuildAppOptions = {
  businessDatabase?: BusinessDatabase;
  logger?: boolean;
  loggerDestination?: DestinationStream;
  memberInvitationService?: MemberInvitationService;
  menuImagePublicBaseUrl?: string;
  menuImageStorage?: MenuImageStorage;
  verifyAccessToken?: (token: string) => Promise<{ userId: string }>;
};

const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const operatorInvitationSchema = z.object({
  email: z.email().trim().toLowerCase(),
});

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const categoryUpdateSchema = categoryCreateSchema;

const categoryReorderSchema = z.object({
  orderedCategoryIds: z.array(z.uuid()).min(1),
});

const menuItemCreateSchema = z.object({
  available: z.boolean().optional(),
  categoryId: z.uuid(),
  description: z.string().trim().max(2000).optional(),
  imageObjectKey: z.string().trim().min(1).max(512).nullable().optional(),
  name: z.string().trim().min(1).max(160),
  priceCents: z.number().int().min(0).max(100_000_000),
});

const menuItemUpdateSchema = z
  .object({
    available: z.boolean().optional(),
    categoryId: z.uuid().optional(),
    description: z.string().trim().max(2000).optional(),
    imageObjectKey: z.string().trim().min(1).max(512).nullable().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    priceCents: z.number().int().min(0).max(100_000_000).optional(),
  })
  .refine(
    (value) =>
      value.available !== undefined ||
      value.categoryId !== undefined ||
      value.description !== undefined ||
      value.imageObjectKey !== undefined ||
      value.name !== undefined ||
      value.priceCents !== undefined,
    { message: "empty_update" },
  );

const imagePresignSchema = z.object({
  contentLength: z.number().int(),
  contentType: z.string().trim().min(1),
});

function serializeMenuItem(
  item: {
    available: boolean;
    categoryId: string;
    description: string;
    id: string;
    imageObjectKey: string | null;
    name: string;
    priceCents: number;
  },
  publicBaseUrl: string | undefined,
) {
  return {
    available: item.available,
    categoryId: item.categoryId,
    description: item.description,
    id: item.id,
    imageObjectKey: item.imageObjectKey,
    imageUrl:
      item.imageObjectKey && publicBaseUrl
        ? publicMenuImageUrl(publicBaseUrl, item.imageObjectKey)
        : null,
    name: item.name,
    priceCents: item.priceCents,
  };
}

export function buildApp(options: BuildAppOptions = {}) {
  initializeObservability();

  const app =
    options.logger === false
      ? Fastify({ logger: false })
      : options.loggerDestination
        ? Fastify({
            loggerInstance: pino(
              safeLoggerOptions,
              options.loggerDestination,
            ) as FastifyBaseLogger,
          })
        : Fastify({ logger: safeLoggerOptions });

  app.get("/health", async (_request, reply) => {
    const body = healthResponseSchema.parse({ status: "ok", service: "api" });
    return reply.code(200).send(body);
  });

  const {
    businessDatabase,
    memberInvitationService,
    menuImagePublicBaseUrl,
    menuImageStorage,
    verifyAccessToken,
  } = options;

  if (businessDatabase) {
    app.get<{ Params: { slug: string } }>(
      "/public/stores/:slug/menu",
      async (request, reply) => {
        const slug = request.params.slug.trim().toLowerCase();
        if (!slug || slug.length > 80) {
          return reply.code(404).send({ error: "store_not_found" });
        }

        const storefront = await businessDatabase.findPublicStorefrontBySlug(
          slug,
          (objectKey) =>
            menuImagePublicBaseUrl
              ? publicMenuImageUrl(menuImagePublicBaseUrl, objectKey)
              : null,
        );
        if (!storefront) {
          return reply.code(404).send({ error: "store_not_found" });
        }

        return reply.code(200).send({ storefront });
      },
    );
  }

  if (businessDatabase && verifyAccessToken) {
    const requireMembership = async (
      request: FastifyRequest,
      reply: FastifyReply,
      requiredRole?: MembershipRole,
    ): Promise<MembershipContext | undefined> => {
      const bearer = /^Bearer ([^\s]+)$/u.exec(
        request.headers.authorization ?? "",
      );
      const token = bearer?.[1];
      if (!token) {
        await reply.code(401).send({ error: "unauthorized" });
        return undefined;
      }

      let identity: { userId: string };
      try {
        identity = await verifyAccessToken(token);
      } catch {
        await reply.code(401).send({ error: "unauthorized" });
        return undefined;
      }

      const context = await businessDatabase.resolveMembershipContext(
        identity.userId,
      );
      if (!context) {
        await reply.code(403).send({ error: "membership_required" });
        return undefined;
      }
      if (requiredRole && context.role !== requiredRole) {
        await reply.code(403).send({ error: "forbidden" });
        return undefined;
      }
      return context;
    };

    app.get("/team/context", async (request, reply) => {
      const context = await requireMembership(request, reply);
      if (!context) return reply;

      return reply.code(200).send({
        context: { role: context.role, storeId: context.storeId },
      });
    });

    app.get("/team/members", async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const members = await businessDatabase.listTeamMembers(context);
      const emails = memberInvitationService
        ? await memberInvitationService.findEmailsByUserIds(
            members.map(({ userId }) => userId),
          )
        : {};
      return reply.code(200).send({
        members: members.map((member) => ({
          ...member,
          email: emails[member.userId] ?? null,
        })),
      });
    });

    if (memberInvitationService) {
      app.post<{ Body: unknown }>(
        "/team/operators/invitations",
        async (request, reply) => {
          const context = await requireMembership(request, reply, "owner");
          if (!context) return reply;

          const body = operatorInvitationSchema.safeParse(request.body);
          if (!body.success) {
            return reply.code(400).send({ error: "invalid_invitation" });
          }

          const invited = await memberInvitationService.inviteMember(
            body.data.email,
          );
          try {
            const member = await businessDatabase.addOperator(
              context,
              invited.userId,
            );
            return reply.code(201).send({
              member: { ...member, email: body.data.email },
            });
          } catch (error) {
            await memberInvitationService.revokeInvitedUser(invited.userId);
            throw error;
          }
        },
      );
    }

    app.delete<{ Params: { membershipId: string } }>(
      "/team/members/:membershipId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const removed = await businessDatabase.removeOperator(
          context,
          request.params.membershipId,
        );
        if (!removed) {
          return reply.code(404).send({ error: "member_not_found" });
        }
        return reply.code(204).send();
      },
    );

    app.get<{ Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const store = await businessDatabase.findStore(
          context,
          request.params.storeId,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );

    app.patch<{ Body: unknown; Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const body = storeUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_store_update" });
        }

        const store = await businessDatabase.updateStoreName(
          context,
          request.params.storeId,
          body.data.name,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );

    app.get("/menu", async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const catalog = await businessDatabase.listMenuCatalog(context);
      return reply.code(200).send({
        additionals: catalog.additionals,
        categories: catalog.categories,
        complementGroups: catalog.complementGroups,
        items: catalog.items.map((item) =>
          serializeMenuItem(item, menuImagePublicBaseUrl),
        ),
      });
    });

    app.post<{ Body: unknown }>("/menu/categories", async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = categoryCreateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_category" });
      }

      const category = await businessDatabase.createMenuCategory(
        context,
        body.data,
      );
      return reply.code(201).send({ category });
    });

    app.patch<{ Body: unknown; Params: { categoryId: string } }>(
      "/menu/categories/:categoryId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const body = categoryUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_category" });
        }

        const category = await businessDatabase.updateMenuCategory(
          context,
          request.params.categoryId,
          body.data,
        );
        if (!category) {
          return reply.code(404).send({ error: "category_not_found" });
        }
        return reply.code(200).send({ category });
      },
    );

    app.put<{ Body: unknown }>("/menu/categories/order", async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = categoryReorderSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_category_order" });
      }

      const categories = await businessDatabase.reorderMenuCategories(
        context,
        body.data.orderedCategoryIds,
      );
      if (!categories) {
        return reply.code(400).send({ error: "invalid_category_order" });
      }
      return reply.code(200).send({ categories });
    });

    app.delete<{ Params: { categoryId: string } }>(
      "/menu/categories/:categoryId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const result = await businessDatabase.deleteMenuCategory(
          context,
          request.params.categoryId,
        );
        if (result === "not_found") {
          return reply.code(404).send({ error: "category_not_found" });
        }
        if (result === "has_items") {
          return reply.code(409).send({ error: "category_has_items" });
        }
        return reply.code(204).send();
      },
    );

    app.post<{ Body: unknown }>("/menu/items", async (request, reply) => {
      const context = await requireMembership(request, reply, "owner");
      if (!context) return reply;

      const body = menuItemCreateSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid_item" });
      }
      if (
        body.data.imageObjectKey &&
        !isOwnedMenuImageObjectKey(context.storeId, body.data.imageObjectKey)
      ) {
        return reply.code(400).send({ error: "invalid_image_object_key" });
      }

      const item = await businessDatabase.createMenuItem(context, {
        categoryId: body.data.categoryId,
        name: body.data.name,
        priceCents: body.data.priceCents,
        ...(body.data.available === undefined
          ? {}
          : { available: body.data.available }),
        ...(body.data.description === undefined
          ? {}
          : { description: body.data.description }),
        ...(body.data.imageObjectKey === undefined
          ? {}
          : { imageObjectKey: body.data.imageObjectKey }),
      });
      if (!item) {
        return reply.code(404).send({ error: "category_not_found" });
      }
      return reply.code(201).send({
        item: serializeMenuItem(item, menuImagePublicBaseUrl),
      });
    });

    app.patch<{ Body: unknown; Params: { itemId: string } }>(
      "/menu/items/:itemId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const body = menuItemUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_item" });
        }
        if (
          body.data.imageObjectKey &&
          !isOwnedMenuImageObjectKey(context.storeId, body.data.imageObjectKey)
        ) {
          return reply.code(400).send({ error: "invalid_image_object_key" });
        }

        const existing = await businessDatabase.getMenuItem(
          context,
          request.params.itemId,
        );
        if (!existing) {
          return reply.code(404).send({ error: "item_not_found" });
        }

        const item = await businessDatabase.updateMenuItem(
          context,
          request.params.itemId,
          {
            ...(body.data.available === undefined
              ? {}
              : { available: body.data.available }),
            ...(body.data.categoryId === undefined
              ? {}
              : { categoryId: body.data.categoryId }),
            ...(body.data.description === undefined
              ? {}
              : { description: body.data.description }),
            ...(body.data.imageObjectKey === undefined
              ? {}
              : { imageObjectKey: body.data.imageObjectKey }),
            ...(body.data.name === undefined ? {} : { name: body.data.name }),
            ...(body.data.priceCents === undefined
              ? {}
              : { priceCents: body.data.priceCents }),
          },
        );
        if (!item) {
          return reply.code(404).send({ error: "item_not_found" });
        }

        const previousKey = existing.imageObjectKey;
        const nextKey = item.imageObjectKey;
        if (
          menuImageStorage &&
          previousKey &&
          previousKey !== nextKey &&
          isOwnedMenuImageObjectKey(context.storeId, previousKey)
        ) {
          try {
            await menuImageStorage.deleteObject(previousKey);
          } catch (error) {
            request.log.warn(
              { err: error, objectKey: previousKey, storeId: context.storeId },
              "menu_image_cleanup_failed",
            );
          }
        }

        return reply.code(200).send({
          item: serializeMenuItem(item, menuImagePublicBaseUrl),
        });
      },
    );

    app.delete<{ Params: { itemId: string } }>(
      "/menu/items/:itemId",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        const deleted = await businessDatabase.deleteMenuItem(
          context,
          request.params.itemId,
        );
        if (!deleted) {
          return reply.code(404).send({ error: "item_not_found" });
        }

        if (
          menuImageStorage &&
          deleted.imageObjectKey &&
          isOwnedMenuImageObjectKey(context.storeId, deleted.imageObjectKey)
        ) {
          try {
            await menuImageStorage.deleteObject(deleted.imageObjectKey);
          } catch (error) {
            request.log.warn(
              {
                err: error,
                objectKey: deleted.imageObjectKey,
                storeId: context.storeId,
              },
              "menu_image_cleanup_failed",
            );
          }
        }

        return reply.code(204).send();
      },
    );

    app.post<{ Body: unknown }>(
      "/menu/images/presign",
      async (request, reply) => {
        const context = await requireMembership(request, reply, "owner");
        if (!context) return reply;

        if (!menuImageStorage || !menuImagePublicBaseUrl) {
          return reply.code(503).send({ error: "image_storage_unavailable" });
        }

        const body = imagePresignSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_image_upload" });
        }

        const validated = assertMenuImageUploadRequest(body.data);
        if (!validated.ok) {
          return reply.code(400).send({ error: validated.error });
        }

        const objectKey = menuImageObjectKey(
          context.storeId,
          validated.contentType,
        );
        const signed = await menuImageStorage.createPresignedUpload({
          contentLength: validated.contentLength,
          contentType: validated.contentType,
          objectKey,
        });

        return reply.code(200).send({
          objectKey,
          publicUrl: signed.publicUrl,
          uploadUrl: signed.uploadUrl,
        });
      },
    );

    registerMenuCustomizationRoutes(app, {
      businessDatabase,
      requireMembership,
    });
  }

  registerErrorObservability(app);

  return app;
}
