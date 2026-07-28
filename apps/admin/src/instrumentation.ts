export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export async function onRequestError(...args: Parameters<typeof sentryCaptureRequestError>) {
  const { captureRequestError } = await import("@sentry/nextjs");
  await captureRequestError(...args);
}
import type { captureRequestError as sentryCaptureRequestError } from "@sentry/nextjs";
