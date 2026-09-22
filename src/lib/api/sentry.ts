/**
 * Read and triage Sentry issues from the command line.
 *
 * The token this module carries is a user token: it holds the owner's rights on the organization,
 * so every path that builds a URL validates its input rather than splicing it in, the base URL is
 * a constant (nothing here fetches a caller-supplied host), and any text that travels back into a
 * log or an error message goes through `redact` first.
 *
 * It lives under `src/lib/api/` because that is where the outbound-network guard confines `fetch`,
 * next to the other external clients. Nothing here imports `@/lib/db`: the unit suite runs without
 * DATABASE_URL, and a db import would build a client at import time and break it.
 */

export const SENTRY_API_BASE = "https://sentry.io/api/0";

/**
 * Sentry builds a short id as UPPERCASED_PROJECT_SLUG + "-" + base36 counter, and a project slug
 * may itself contain dashes, so `PUMP-STATION-1` is valid. Requiring exactly one dash rejected
 * every hyphenated project while blaming the user's input for it.
 */
const SHORT_ID_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;
const GROUP_ID_PATTERN = /^\d+$/;
/** Org and project slugs reach a URL path, so they are checked rather than trusted. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

const DEFAULT_QUERY = "is:unresolved";
const DEFAULT_STATS_PERIOD = "14d";
const DEFAULT_LIMIT = 25;
/** Sentry caps a page at 100 whatever we ask for; clamping keeps the printed count honest. */
const MAX_LIMIT = 100;
/** Without it the listing comes back in last-seen order, which is not "noisiest first". */
const DEFAULT_SORT = "freq";
const REQUEST_TIMEOUT_MS = 30_000;

export type SentryConfig = {
  org: string;
  project: string;
  token: string;
};

export type SentryIssue = {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  /** Sentry serialises the event count as a string. */
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
};

export type StackFrame = {
  filename?: string;
  function?: string;
  lineNo?: number | null;
  inApp?: boolean;
};

export type ExceptionValue = {
  type?: string;
  value?: string;
  stacktrace?: { frames?: StackFrame[] } | null;
};

export type SentryEventEntry = {
  type: string;
  data?: { values?: ExceptionValue[] | SentryBreadcrumb[] };
};

export type SentryBreadcrumb = {
  category?: string;
  message?: string;
  level?: string;
  timestamp?: string;
};

export type SentryEvent = {
  id: string;
  dateCreated?: string;
  entries?: SentryEventEntry[];
  tags?: { key: string; value: string }[];
};

export type SentryTag = {
  key: string;
  name: string;
  totalValues: number;
  topValues?: { value: string; count: number }[];
};

export type StatusAction = "resolve" | "resolve-now" | "ignore" | "reopen";

export type IssueStatusPayload = {
  status: "resolved" | "resolvedInNextRelease" | "ignored" | "unresolved";
};

export type ListOptions = {
  query?: string;
  statsPeriod?: string;
  limit?: number;
  environment?: string;
  sort?: string;
};

/**
 * Reads the three variables an API call needs, and names every missing one in a single failure.
 * Reporting them one at a time would mean one round trip per variable for whoever is setting up.
 */
export function readSentryConfig(env: Record<string, string | undefined>): SentryConfig {
  const missing = (["SENTRY_ORG", "SENTRY_PROJECT", "SENTRY_AUTH_TOKEN"] as const).filter(
    (name) => !env[name]
  );

  if (missing.length > 0) {
    throw new Error(
      `Configuration Sentry incomplète : ${missing.join(", ")}. ` +
        "Ces variables vivent dans .env, lancez la commande via `npm run sentry`."
    );
  }

  return {
    org: env.SENTRY_ORG as string,
    project: env.SENTRY_PROJECT as string,
    token: env.SENTRY_AUTH_TOKEN as string,
  };
}

export function assertShortId(value: string): string {
  if (!SHORT_ID_PATTERN.test(value)) {
    throw new Error(
      `Short id Sentry invalide : "${value}". Attendu quelque chose comme POLIGRAPH-1N.`
    );
  }
  return value;
}

function assertGroupId(value: string): string {
  if (!GROUP_ID_PATTERN.test(value)) {
    throw new Error(`Identifiant numérique d'issue invalide : "${value}".`);
  }
  return value;
}

/**
 * org and project come from the environment and land in a URL path, so they get the same treatment
 * as the values a caller types. A slug carrying `/`, `..`, `?` or `#` would otherwise retarget the
 * request, and the PUT that closes an issue travels on one of those paths.
 */
function assertSlug(value: string, variable: string): string {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(`${variable} n'est pas un slug Sentry valide : "${value}".`);
  }
  return value;
}

export function projectUrl(config: SentryConfig): string {
  return `${SENTRY_API_BASE}/projects/${assertSlug(config.org, "SENTRY_ORG")}/${assertSlug(
    config.project,
    "SENTRY_PROJECT"
  )}/`;
}

/**
 * The organization endpoint, not the project one. On `/projects/{org}/{project}/issues/`,
 * `statsPeriod` selects the sparkline and accepts only "", "24h" and "14d": it does not filter,
 * so printing it as a window was a claim the request never made. Measured 2026-09-22, where 24h
 * and 14d returned the same 68 issues with the same oldest occurrence, 24 days back.
 *
 * Here it is a real filter, any period is accepted, and `count` becomes the volume inside the
 * window rather than the issue's lifetime total.
 */
export function issueListUrl(
  config: SentryConfig,
  projectId: string,
  options: ListOptions
): string {
  const url = new URL(
    `${SENTRY_API_BASE}/organizations/${assertSlug(config.org, "SENTRY_ORG")}/issues/`
  );
  url.searchParams.set("project", projectId);
  url.searchParams.set("query", options.query ?? DEFAULT_QUERY);
  url.searchParams.set("statsPeriod", options.statsPeriod ?? DEFAULT_STATS_PERIOD);
  url.searchParams.set("sort", options.sort ?? DEFAULT_SORT);
  url.searchParams.set("limit", String(clampLimit(options.limit)));
  // Omitted rather than defaulted: a dev server started from a worktree reports to the same DSN as
  // production, so the filter has to be a deliberate choice, not a silent one.
  if (options.environment) url.searchParams.set("environment", options.environment);
  return url.toString();
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function shortIdLookupUrl(config: SentryConfig, shortId: string): string {
  return `${SENTRY_API_BASE}/organizations/${assertSlug(
    config.org,
    "SENTRY_ORG"
  )}/shortids/${encodeURIComponent(assertShortId(shortId))}/`;
}

export function issueUrl(config: SentryConfig, groupId: string): string {
  return `${SENTRY_API_BASE}/organizations/${assertSlug(
    config.org,
    "SENTRY_ORG"
  )}/issues/${assertGroupId(groupId)}/`;
}

export function latestEventUrl(config: SentryConfig, groupId: string): string {
  return `${issueUrl(config, groupId)}events/latest/`;
}

export function issueTagsUrl(config: SentryConfig, groupId: string): string {
  return `${issueUrl(config, groupId)}tags/`;
}

/**
 * `resolve` deliberately means "in the next release": here a merge is not a deploy, promotion to
 * production is a manual gesture, so a plain `resolved` would claim a fix is live before it is.
 * Sentry reopens an `resolvedInNextRelease` issue by itself if it keeps firing afterwards.
 */
export function statusPayloadFor(action: StatusAction): IssueStatusPayload {
  switch (action) {
    case "resolve":
      return { status: "resolvedInNextRelease" };
    case "resolve-now":
      return { status: "resolved" };
    case "ignore":
      return { status: "ignored" };
    case "reopen":
      return { status: "unresolved" };
  }
}

/** The wire value is the only label worth printing: one mapping, so the two cannot drift. */
export function statusLabelFor(action: StatusAction): string {
  return statusPayloadFor(action).status;
}

/**
 * Keeps the path, drops the query and the fragment: identifiers, search terms and tokens travel
 * there. It works on a substring rather than on the whole value, because a breadcrumb message is
 * rarely a bare URL ("Navigated to https://…?q=…", "GET /recherche?q=… [200]"). Parsing the whole
 * string with `new URL()` threw on those and returned them untouched, so the mode that announced
 * "query strings masquées" was masking nothing on the shapes that actually carry visitor input.
 */
const QUERY_OR_FRAGMENT = /((?:https?:\/\/[^\s]*?|\/[^\s?#]*)[?#])[^\s]*/g;

export function maskQueryString(value: string): string {
  return value.replace(QUERY_OR_FRAGMENT, "$1…");
}

function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("***");
}

export function formatIssueLine(issue: SentryIssue): string {
  const seen = issue.lastSeen.slice(0, 10);
  const culprit = issue.culprit ?? "sans culprit";
  return (
    `${issue.shortId.padEnd(14)} ${issue.level.padEnd(7)} ` +
    `${String(issue.count).padStart(6)} events / ${issue.userCount} users  ` +
    `vu ${seen}  ${culprit}\n` +
    `${" ".repeat(16)}${issue.title}`
  );
}

/**
 * Most recent frame first, application frames before vendor ones. Sentry serialises a stack
 * oldest-first, and the frame worth reading is almost always ours and near the top.
 */
export function formatFrames(entries: SentryEventEntry[]): string[] {
  const exception = entries.find((entry) => entry.type === "exception");
  const values = (exception?.data?.values ?? []) as ExceptionValue[];

  const frames = values.flatMap((value) => value.stacktrace?.frames ?? []);
  const mostRecentFirst = [...frames].reverse();
  const applicationFirst = [...mostRecentFirst].sort(
    (a, b) => Number(Boolean(b.inApp)) - Number(Boolean(a.inApp))
  );

  return applicationFirst.map((frame) => {
    const origin = frame.inApp ? "app   " : "vendor";
    const where = `${frame.filename ?? "?"}:${frame.lineNo ?? "?"}`;
    return `${origin} ${where} ${frame.function ?? ""}`.trimEnd();
  });
}

/**
 * Breadcrumbs arrive inside `entries` as `{ type: "breadcrumbs", data: { values: [...] } }`, the
 * same envelope as the exception entry. There is no top-level `breadcrumbs` key on a Sentry event:
 * reading one returned undefined on every response, so the whole section rendered nothing while
 * the command still promised that `--raw` would reveal more. Verified against the live API on
 * 2026-09-22, where the entry carried 41 values and `event.breadcrumbs` was undefined.
 */
export function breadcrumbsFrom(entries: SentryEventEntry[]): SentryBreadcrumb[] {
  const entry = entries.find((candidate) => candidate.type === "breadcrumbs");
  return (entry?.data?.values ?? []) as SentryBreadcrumb[];
}

export function formatBreadcrumb(crumb: SentryBreadcrumb, options: { raw: boolean }): string {
  const message = crumb.message ?? "";
  const shown = options.raw ? message : maskQueryString(message);
  const at = (crumb.timestamp ?? "").slice(11, 19);
  return `${at} [${crumb.category ?? "?"}] ${shown}`;
}

async function fetchSentry<T>(
  config: SentryConfig,
  url: string,
  init: { method?: string; body?: string } = {}
): Promise<T> {
  // Without a signal a stalled socket hangs the command for undici's 300s default, and `show`
  // fires three of these in parallel, so one stalled socket pins the whole run.
  const response = await fetch(url, {
    method: init.method ?? "GET",
    body: init.body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
  });

  const text = redact(await response.text(), config.token);

  if (!response.ok) {
    throw new Error(
      `Sentry a répondu ${response.status} sur ${maskQueryString(url)} : ${text.slice(0, 300)}`
    );
  }

  // A proxy or maintenance page answering 200 with HTML would otherwise surface as a bare
  // SyntaxError naming neither the status nor the endpoint.
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Sentry a renvoyé du ${response.status} non JSON sur ${maskQueryString(url)} : ` +
        text.slice(0, 200)
    );
  }
}

/** The organization issue endpoint filters by numeric project id, not by slug. */
export async function getProjectId(config: SentryConfig): Promise<string> {
  const project = await fetchSentry<{ id: string }>(config, projectUrl(config));
  return String(project.id);
}

export async function listIssues(
  config: SentryConfig,
  options: ListOptions
): Promise<SentryIssue[]> {
  return fetchSentry<SentryIssue[]>(
    config,
    issueListUrl(config, await getProjectId(config), options)
  );
}

/**
 * The short-id lookup is organization-wide while the listing is scoped to SENTRY_PROJECT, so a
 * short id belonging to a sibling project resolves happily and the write endpoint is org-scoped
 * too. Comparing the project the lookup reports is what keeps a write inside the configured
 * project instead of trusting that the operator could only have seen ids from it.
 */
export async function lookupGroupId(config: SentryConfig, shortId: string): Promise<string> {
  const found = await fetchSentry<{ groupId: string; projectSlug?: string }>(
    config,
    shortIdLookupUrl(config, shortId)
  );

  if (found.projectSlug && found.projectSlug !== config.project) {
    throw new Error(
      `${shortId} appartient au projet "${found.projectSlug}", pas à "${config.project}". ` +
        "Rien n'a été écrit."
    );
  }

  return String(found.groupId);
}

export function getIssue(config: SentryConfig, groupId: string): Promise<SentryIssue> {
  return fetchSentry<SentryIssue>(config, issueUrl(config, groupId));
}

export function getLatestEvent(config: SentryConfig, groupId: string): Promise<SentryEvent> {
  return fetchSentry<SentryEvent>(config, latestEventUrl(config, groupId));
}

export function getIssueTags(config: SentryConfig, groupId: string): Promise<SentryTag[]> {
  return fetchSentry<SentryTag[]>(config, issueTagsUrl(config, groupId));
}

/**
 * Returns nothing on purpose: Sentry rewrites the status on the way out (a `resolvedInNextRelease`
 * request comes back as `resolved` with `statusDetails.inNextRelease`), so typing the response as
 * the request body would describe a shape that never arrives.
 */
export function updateIssueStatus(
  config: SentryConfig,
  groupId: string,
  action: StatusAction
): Promise<void> {
  return fetchSentry<void>(config, issueUrl(config, groupId), {
    method: "PUT",
    body: JSON.stringify(statusPayloadFor(action)),
  });
}
