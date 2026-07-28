import Fastify, {
  type FastifyBaseLogger,
  type FastifyRequest,
} from "fastify";
import pino, { type DestinationStream } from "pino";
import { z } from "zod";

import type { BusinessDatabase, StaffContext, StoreContext } from "@foode/db";
import { healthResponseSchema } from "@foode/shared";

import { safeLoggerOptions } from "./logger.js";
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";
import type { StaffInvitationService } from "./staff-invitations.js";

type BuildAppOptions = {
  businessDatabase?: BusinessDatabase;
  logger?: boolean;
  loggerDestination?: DestinationStream;
  resolveStoreContext?: (
    request: FastifyRequest,
  ) => Promise<StoreContext | undefined>;
  staffInvitationService?: StaffInvitationService;
  verifyAccessToken?: (token: string) => Promise<{ userId: string }>;
};

type StaffAuthentication =
  | { context: StaffContext }
  | {
      error: "membership_required" | "unauthorized";
      status: 401 | 403;
    };

const storeUpdateSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const operatorInvitationSchema = z.object({
  email: z.email().trim().toLowerCase(),
});

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

  const { businessDatabase, resolveStoreContext } = options;
  const verifyAccessToken = options.verifyAccessToken;
  if (businessDatabase && verifyAccessToken) {
    const resolveAuthenticatedStaff = async (
      request: FastifyRequest,
    ): Promise<StaffAuthentication> => {
      const authorization = request.headers.authorization;
      const bearer = /^Bearer ([^\s]+)$/u.exec(authorization ?? "");
      const token = bearer?.[1];
      if (!token) return { error: "unauthorized", status: 401 };

      let identity: { userId: string };
      try {
        identity = await verifyAccessToken(token);
      } catch {
        return { error: "unauthorized", status: 401 };
      }
      const context = await businessDatabase.resolveStaffContext(identity.userId);
      if (!context) {
        return {
          error: "membership_required",
          status: 403,
        };
      }
      return { context };
    };

    app.get("/staff/context", async (request, reply) => {
      const authentication = await resolveAuthenticatedStaff(request);
      if ("error" in authentication) {
        return reply
          .code(authentication.status)
          .send({ error: authentication.error });
      }

      return reply.code(200).send({
        context: {
          role: authentication.context.role,
          storeId: authentication.context.storeId,
        },
      });
    });

    app.get("/staff/members", async (request, reply) => {
      const authentication = await resolveAuthenticatedStaff(request);
      if ("error" in authentication) {
        return reply
          .code(authentication.status)
          .send({ error: authentication.error });
      }
      if (authentication.context.role !== "owner") {
        return reply.code(403).send({ error: "forbidden" });
      }

      const members = await businessDatabase.listStaffMembers(
        authentication.context,
      );
      return reply.code(200).send({ members });
    });

    const staffInvitationService = options.staffInvitationService;
    if (staffInvitationService) {
      app.post<{ Body: unknown }>(
        "/staff/operators/invitations",
        async (request, reply) => {
          const authentication = await resolveAuthenticatedStaff(request);
          if ("error" in authentication) {
            return reply
              .code(authentication.status)
              .send({ error: authentication.error });
          }
          if (authentication.context.role !== "owner") {
            return reply.code(403).send({ error: "forbidden" });
          }

          const body = operatorInvitationSchema.safeParse(request.body);
          if (!body.success) {
            return reply.code(400).send({ error: "invalid_invitation" });
          }

          const invited = await staffInvitationService.inviteOperator(
            body.data.email,
          );
          try {
            const member = await businessDatabase.addOperator(
              authentication.context,
              invited.userId,
            );
            return reply.code(201).send({ member });
          } catch (error) {
            await staffInvitationService.revokeInvitedUser(
              invited.userId,
            );
            throw error;
          }
        },
      );
    }

    app.delete<{ Params: { membershipId: string } }>(
      "/staff/members/:membershipId",
      async (request, reply) => {
        const authentication = await resolveAuthenticatedStaff(request);
        if ("error" in authentication) {
          return reply
            .code(authentication.status)
            .send({ error: authentication.error });
        }
        if (authentication.context.role !== "owner") {
          return reply.code(403).send({ error: "forbidden" });
        }

        const removed = await businessDatabase.removeOperator(
          authentication.context,
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
        const authentication = await resolveAuthenticatedStaff(request);
        if ("error" in authentication) {
          return reply
            .code(authentication.status)
            .send({ error: authentication.error });
        }
        if (authentication.context.role !== "owner") {
          return reply.code(403).send({ error: "forbidden" });
        }

        const store = await businessDatabase.findStore(
          authentication.context,
          request.params.storeId,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );

    app.patch<{ Body: unknown; Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const authentication = await resolveAuthenticatedStaff(request);
        if ("error" in authentication) {
          return reply
            .code(authentication.status)
            .send({ error: authentication.error });
        }
        if (authentication.context.role !== "owner") {
          return reply.code(403).send({ error: "forbidden" });
        }

        const body = storeUpdateSchema.safeParse(request.body);
        if (!body.success) {
          return reply.code(400).send({ error: "invalid_store_update" });
        }

        const store = await businessDatabase.updateStoreName(
          authentication.context,
          request.params.storeId,
          body.data.name,
        );
        if (!store) return reply.code(404).send({ error: "store_not_found" });

        return reply.code(200).send({ store });
      },
    );
  }

  if (businessDatabase && resolveStoreContext && !options.verifyAccessToken) {
    app.get<{ Params: { storeId: string } }>(
      "/stores/:storeId",
      async (request, reply) => {
        const context = await resolveStoreContext(request);
        if (!context) return reply.code(401).send({ error: "unauthorized" });

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
        const context = await resolveStoreContext(request);
        if (!context) return reply.code(401).send({ error: "unauthorized" });

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
  }

  registerErrorObservability(app);

  return app;
}
