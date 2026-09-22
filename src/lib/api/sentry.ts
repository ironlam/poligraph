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

/** Sentry issues Sentry short ids as PROJECT-SUFFIX, uppercase base36. */
const SHORT_ID_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+$/;
const GROUP_ID_PATTERN = /^\d+$/;

const DEFAULT_QUERY = "is:unresolved";
const DEFAULT_STATS_PERIOD = "14d";
const DEFAULT_LIMIT = 25;

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
  data?: { values?: ExceptionValue[] };
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
  contexts?: Record<string, unknown>;
  breadcrumbs?: { values?: SentryBreadcrumb[] };
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

export function issueListUrl(config: SentryConfig, options: ListOptions): string {
  const url = new URL(`${SENTRY_API_BASE}/projects/${config.org}/${config.project}/issues/`);
  url.searchParams.set("query", options.query ?? DEFAULT_QUERY);
  url.searchParams.set("statsPeriod", options.statsPeriod ?? DEFAULT_STATS_PERIOD);
  url.searchParams.set("limit", String(options.limit ?? DEFAULT_LIMIT));
  // Omitted rather than defaulted: a dev server started from a worktree reports to the same DSN as
  // production, so the filter has to be a deliberate choice, not a silent one.
  if (options.environment) url.searchParams.set("environment", options.environment);
  return url.toString();
}

export function shortIdLookupUrl(config: SentryConfig, shortId: string): string {
  return `${SENTRY_API_BASE}/organizations/${config.org}/shortids/${encodeURIComponent(
    assertShortId(shortId)
  )}/`;
}

export function issueUrl(config: SentryConfig, groupId: string): string {
  return `${SENTRY_API_BASE}/organizations/${config.org}/issues/${assertGroupId(groupId)}/`;
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

/** Keeps the path, drops the query: identifiers and search terms travel in the query string. */
export function maskQueryString(value: string): string {
  try {
    const url = new URL(value);
    if (!url.search) return value;
    return `${url.origin}${url.pathname}?…`;
  } catch {
    return value;
  }
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
  const values = exception?.data?.values ?? [];

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
  const response = await fetch(url, {
    method: init.method ?? "GET",
    body: init.body,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const body = redact(await response.text(), config.token).slice(0, 300);
    throw new Error(`Sentry a répondu ${response.status} sur ${maskQueryString(url)} : ${body}`);
  }

  return (await response.json()) as T;
}

export function listIssues(config: SentryConfig, options: ListOptions): Promise<SentryIssue[]> {
  return fetchSentry<SentryIssue[]>(config, issueListUrl(config, options));
}

export async function lookupGroupId(config: SentryConfig, shortId: string): Promise<string> {
  const found = await fetchSentry<{ groupId: string }>(config, shortIdLookupUrl(config, shortId));
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

export function updateIssueStatus(
  config: SentryConfig,
  groupId: string,
  action: StatusAction
): Promise<IssueStatusPayload> {
  return fetchSentry<IssueStatusPayload>(config, issueUrl(config, groupId), {
    method: "PUT",
    body: JSON.stringify(statusPayloadFor(action)),
  });
}
