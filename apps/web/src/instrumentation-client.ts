import * as Sentry from "@sentry/nextjs";

import { scrubBreadcrumb, scrubEvent } from "@foode/shared/sentry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    // Token do Pedido na URL, corpos, cookies e console nunca no Sentry (Ticket 30).
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}
