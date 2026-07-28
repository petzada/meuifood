import { z } from "zod";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("api"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const membershipRoleSchema = z.enum(["owner", "operator"]);

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
