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

// Our own browser code is always served from a chunk, so every frame of a real application error
// names one. A stack whose frames all point at a page URL instead belongs to a script the browser
// injected into the document: an in-app WebView, an extension, a reader mode. Observed so far:
// `__firefox__` on /statistiques, `window.webkit.messageHandlers` on /recherche, a MetaMask probe
// on /statistiques, and a `RangeError` recursion from the Google iOS app.
//
// Those arrive as SEVERAL issues for one cause. An injected script keeps the URL of the document
// it was injected into while the SPA navigates away, so the same bug groups once per landing page
// and a burst of five looks like five regressions. Collapsing the family under one fingerprint
// turns that into a single issue that can be muted once, and keeps it visible rather than dropping
// it: this code cannot be fixed here, but a change in its shape is still worth seeing.
//
// Deliberately not a drop, and deliberately narrow. An exception with no frames at all (the
// cross-origin "Script error.") is left alone, because absence of frames proves nothing about
// whose code threw.
const INJECTED_SCRIPT_FINGERPRINT = "third-party-injected-script";
const APP_CHUNK_PATH = "_next/static";

function isInjectedScriptError(event: Sentry.ErrorEvent): boolean {
  const values = event.exception?.values ?? [];
  const frames = values.flatMap((value) => value.stacktrace?.frames ?? []);
  if (frames.length === 0) return false;
  return frames.every(
    (frame) => !(frame.filename ?? frame.abs_path ?? "").includes(APP_CHUNK_PATH)
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
      if (isReactStreamingScriptError(event)) {
        if (reactStreamingReported) return null;
        reactStreamingReported = true;
        return { ...event, fingerprint: [REACT_STREAMING_FINGERPRINT] };
      }
      // Checked after the React family, which is inline in the document and would otherwise match
      // the injected-script shape too.
      if (isInjectedScriptError(event)) {
        return { ...event, fingerprint: [INJECTED_SCRIPT_FINGERPRINT] };
      }
      return event;
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
