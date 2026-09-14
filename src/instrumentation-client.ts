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

// React's streaming renderer injects these inline scripts into the HTML document
// to reveal a Suspense boundary ($RS), complete one ($RC) or reveal viewport
// content ($RV). They dereference `document.getElementById(...)` with no null
// check, so once the hidden template nodes are gone from the document every
// remaining call throws. One page load therefore produces one TypeError per
// Suspense boundary: the event count measures the page's boundary count, not
// severity, and there is no application frame to fix. Collapse the family into a
// single issue and keep one event per page load so a burst cannot read as an
// escalating regression. Hydration errors are deliberately left untouched:
// they are the actual signal these bursts sit downstream of.
const REACT_STREAMING_SCRIPTS = new Set(["$RS", "$RC", "$RV"]);
const REACT_STREAMING_FINGERPRINT = "react-streaming-reveal-script";

let reactStreamingReported = false;

function isReactStreamingScriptError(event: Sentry.ErrorEvent): boolean {
  return (event.exception?.values ?? []).some((value) =>
    (value.stacktrace?.frames ?? []).some(
      (frame) => frame.function != null && REACT_STREAMING_SCRIPTS.has(frame.function)
    )
  );
}

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
      : [
          Sentry.replayIntegration({
            maskAllText: false,
            blockAllMedia: true,
            // The production CSP intentionally forbids blob workers. Replay falls back to its
            // in-thread buffer, avoiding a blocked worker and keeping the security boundary intact.
            useCompression: false,
          }),
        ],
    beforeSend(event) {
      if (!isReactStreamingScriptError(event)) return event;
      if (reactStreamingReported) return null;
      reactStreamingReported = true;
      return { ...event, fingerprint: [REACT_STREAMING_FINGERPRINT] };
    },
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
