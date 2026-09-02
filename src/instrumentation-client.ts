import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENABLED = Boolean(SENTRY_DSN) && process.env.NEXT_PUBLIC_SENTRY_ENABLED !== "false";

// Session replay records page text verbatim (`maskAllText: false`), which is the
// whole point on the public site: an error there is diagnosable from the
// recording alone. Admin is the opposite trade-off. Moderation screens show
// unpublished affairs, i.e. offence and conviction data tied to named people
// (RGPD art. 10), and none of it is worth recording to diagnose a back-office
// bug. Errors are still reported, only the recording is dropped.
//
// Gating at boot is enough: nothing on the public site links into /admin, so the
// section is only ever entered by a full document load, which re-runs this file.
// No replay session started on a public page can follow the visitor into admin.
const IS_ADMIN_ROUTE =
  typeof window !== "undefined" && /^\/admin(\/|$)/.test(window.location.pathname);

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    sendDefaultPii: false,
    integrations: IS_ADMIN_ROUTE
      ? []
      : [Sentry.replayIntegration({ maskAllText: false, blockAllMedia: true })],
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Network request failed",
      "NetworkError",
      "AbortError",
    ],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
