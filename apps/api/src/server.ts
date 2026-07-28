import { createBusinessDatabase } from "@foode/db";

import { buildApp } from "./app.js";
import {
  createSupabaseAccessTokenVerifier,
  supabaseAuthConfiguration,
} from "./auth.js";
import { createSupabaseMemberInvitationService } from "./member-invitations.js";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_is_required`);
  return value;
}

const port = Number(process.env.PORT ?? 3333);
const businessDatabase = createBusinessDatabase(
  requiredEnvironment("BUSINESS_DATABASE_URL"),
);
const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const app = buildApp({
  businessDatabase,
  memberInvitationService: createSupabaseMemberInvitationService({
    redirectTo: requiredEnvironment("ADMIN_AUTH_REDIRECT_URL"),
    serviceRoleKey: requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl,
  }),
  verifyAccessToken: createSupabaseAccessTokenVerifier(
    supabaseAuthConfiguration(supabaseUrl),
  ),
});

async function shutdown(signal: string) {
  app.log.info({ signal }, "api_stopping");
  await app.close();
  await businessDatabase.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await businessDatabase.assertRestrictedRuntime();
  const address = await app.listen({ host: "0.0.0.0", port });
  app.log.info({ address }, "api_started");
} catch (error) {
  app.log.error({ err: error }, "api_start_failed");
  await businessDatabase.close();
  process.exit(1);
}
