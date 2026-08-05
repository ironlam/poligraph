/**
 * Records every outbound host a `next build` reaches, so CI can fail on an unknown one.
 *
 * Loaded through NODE_OPTIONS=--require, which is what makes it land in the static
 * generation workers Next forks: a probe living only in the parent process would miss
 * the calls made while collecting pages, which is where they nearly all happen.
 *
 * It records and never blocks. The build genuinely needs some of these hosts (Google
 * Fonts through next/font, Twemoji through next/og), so blocking would just break the
 * build; the point is that a NEW dependency cannot appear unnoticed.
 *
 * CommonJS on purpose: --require cannot load an ES module.
 */
const fs = require("node:fs");
const diagnostics = require("node:diagnostics_channel");

const LOG = process.env.BUILD_NET_LOG;
if (!LOG) {
  throw new Error("build-net-probe: BUILD_NET_LOG is required, refusing to run blind");
}

function write(line) {
  try {
    // O_APPEND keeps the 13 workers from interleaving inside a line.
    fs.appendFileSync(LOG, `${line}\n`);
  } catch {
    // A probe must never be the reason a build fails.
  }
}

/**
 * Host and path only. Query strings are dropped rather than trimmed: the earlier
 * throwaway version of this probe logged a Sentry envelope URL complete with its
 * `sentry_key`, and a CI log is a public artefact.
 */
function record(kind, rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl === "") return;
  // Not network, and they can be megabytes long.
  if (rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) return;
  try {
    const url = new URL(rawUrl);
    write(`${kind} ${url.protocol}//${url.host}${url.pathname}`);
  } catch {
    write(`${kind} unparseable`);
  }
}

// --- undici: covers globalThis.fetch AND the requests it makes when following a
// redirect, which never pass back through the fetch wrapper below.
try {
  diagnostics.subscribe("undici:request:create", (event) => {
    const request = event && event.request;
    if (!request) return;
    const origin = request.origin || "";
    const path = request.path || "";
    record("undici", `${origin}${path}`);
  });
} catch {
  write("note undici-channel-unavailable");
}

// --- fetch, kept even though undici publishes the channel above: a runtime that does
// not publish it must not turn into silent success.
const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = function patchedFetch(input, init) {
    const url =
      typeof input === "string"
        ? input
        : input && typeof input === "object" && "url" in input
          ? String(input.url)
          : String(input);
    record("fetch", url);
    return originalFetch.call(this, input, init);
  };
}

// --- node:http / node:https, for anything still using the classic client.
for (const moduleName of ["http", "https"]) {
  const lib = require(`node:${moduleName}`);
  for (const fnName of ["request", "get"]) {
    const original = lib[fnName];
    if (typeof original !== "function") continue;
    lib[fnName] = function patched(...args) {
      const first = args[0];
      if (typeof first === "string") {
        record(moduleName, first);
      } else if (first && typeof first === "object") {
        const host = first.hostname || first.host || "unknown";
        record(moduleName, `${moduleName}://${host}${first.path || ""}`);
      }
      return original.apply(this, args);
    };
  }
}

// Proof of loading, and the reason the checker cannot mistake an unloaded probe for a
// build that called nothing.
write(`probe-loaded ${process.pid}`);
