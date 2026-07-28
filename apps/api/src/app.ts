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
import {
  initializeObservability,
  registerErrorObservability,
} from "./observability.js";

type BuildAppOptions = {
  businessDatabase?: BusinessDatabase;
  logger?: boolean;
  loggerDestination?: DestinationStream;
  memberInvitationService?: MemberInvitationService;
  verifyAccessToken?: (token: string) => Promise<{ userId: string }>;
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

  const { businessDatabase, memberInvitationService, verifyAccessToken } = options;
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
  }

  registerErrorObservability(app);

  return app;
}
