import { z } from "zod";

import { createAdministrativeDatabase } from "@foode/db";

import { createSupabaseMemberInvitationService } from "./member-invitations.js";
import { provisionOwner } from "./owner-provisioning.js";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_is_required`);
  return value;
}

const input = z
  .object({
    email: z.email().trim().toLowerCase(),
    storeId: z.uuid(),
  })
  .parse({ storeId: process.argv[2], email: process.argv[3] });
const database = createAdministrativeDatabase(
  requiredEnvironment("DATABASE_URL"),
);
const invitations = createSupabaseMemberInvitationService({
  redirectTo: requiredEnvironment("ADMIN_AUTH_REDIRECT_URL"),
  serviceRoleKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseUrl: requiredEnvironment("SUPABASE_URL"),
});

try {
  await provisionOwner(
    {
      async createOwnerMembership(storeId, userId) {
        await database.storeMember.create({
          data: { role: "owner", storeId, userId },
        });
      },
    },
    invitations,
    input,
  );
  process.stdout.write(`owner_provisioned store_id=${input.storeId}\n`);
} finally {
  await database.$disconnect();
}
