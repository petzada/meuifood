import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3333);
const app = buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "api_stopping");
  await app.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  const address = await app.listen({ host: "0.0.0.0", port });
  app.log.info({ address }, "api_started");
} catch (error) {
  app.log.error({ err: error }, "api_start_failed");
  process.exit(1);
}
