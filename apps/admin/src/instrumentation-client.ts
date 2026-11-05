import { scrubBreadcrumb, scrubEvent } from "@foode/shared/sentry";
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    // `/definir-senha?token=`, corpos (e-mail e senha), cookies, headers e console nunca no
    // Sentry (Ticket 30, K3).
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
}
