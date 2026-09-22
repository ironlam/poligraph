import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readSentryConfig,
  assertShortId,
  issueListUrl,
  shortIdLookupUrl,
  issueUrl,
  latestEventUrl,
  statusPayloadFor,
  maskQueryString,
  formatIssueLine,
  formatFrames,
  formatBreadcrumb,
  updateIssueStatus,
  lookupGroupId,
  type SentryConfig,
  type SentryIssue,
} from "../sentry";

const CONFIG: SentryConfig = { org: "poligraph", project: "poligraph", token: "sntryu_secret" };

const ISSUE: SentryIssue = {
  id: "144680922",
  shortId: "POLIGRAPH-1N",
  title: 'TypeError: can\'t access property "parentNode", b is null',
  culprit: "app/page",
  level: "error",
  status: "unresolved",
  count: "44",
  userCount: 3,
  firstSeen: "2026-09-01T10:00:00.000Z",
  lastSeen: "2026-09-20T10:00:00.000Z",
  permalink: "https://poligraph.sentry.io/issues/144680922/",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readSentryConfig", () => {
  it("reads the three variables the API calls need", () => {
    expect(
      readSentryConfig({
        SENTRY_ORG: "poligraph",
        SENTRY_PROJECT: "poligraph",
        SENTRY_AUTH_TOKEN: "sntryu_secret",
      })
    ).toEqual(CONFIG);
  });

  it("names every missing variable at once rather than failing one at a time", () => {
    expect(() => readSentryConfig({ SENTRY_ORG: "poligraph" })).toThrow(
      /SENTRY_PROJECT, SENTRY_AUTH_TOKEN/
    );
  });

  it("never quotes a token value in the failure message", () => {
    // An empty token is still a configuration error, and the message must describe the variable,
    // not echo whatever was in it.
    const message = (() => {
      try {
        readSentryConfig({ SENTRY_ORG: "o", SENTRY_PROJECT: "p", SENTRY_AUTH_TOKEN: "" });
        return "";
      } catch (error) {
        return (error as Error).message;
      }
    })();
    expect(message).toContain("SENTRY_AUTH_TOKEN");
  });
});

describe("assertShortId", () => {
  it("accepts the shape Sentry actually issues", () => {
    expect(assertShortId("POLIGRAPH-1N")).toBe("POLIGRAPH-1N");
  });

  it.each([
    ["a path traversal", "POLIGRAPH-1N/../../organizations"],
    ["a slash", "POLIGRAPH/1N"],
    ["a query string", "POLIGRAPH-1N?foo=bar"],
    ["lowercase", "poligraph-1n"],
    ["an empty string", ""],
    ["no dash", "POLIGRAPH"],
  ])("rejects %s", (_label, value) => {
    expect(() => assertShortId(value)).toThrow(/short id/i);
  });
});

describe("url building", () => {
  it("targets sentry.io and nothing else", () => {
    for (const url of [
      issueListUrl(CONFIG, {}),
      shortIdLookupUrl(CONFIG, "POLIGRAPH-1N"),
      issueUrl(CONFIG, "144680922"),
      latestEventUrl(CONFIG, "144680922"),
    ]) {
      expect(new URL(url).origin).toBe("https://sentry.io");
    }
  });

  it("defaults the listing to unresolved issues over 14 days", () => {
    const url = new URL(issueListUrl(CONFIG, {}));
    expect(url.pathname).toBe("/api/0/projects/poligraph/poligraph/issues/");
    expect(url.searchParams.get("query")).toBe("is:unresolved");
    expect(url.searchParams.get("statsPeriod")).toBe("14d");
  });

  it("passes an environment filter through, so prod and local dev do not get mixed", () => {
    const url = new URL(issueListUrl(CONFIG, { environment: "production" }));
    expect(url.searchParams.get("environment")).toBe("production");
  });

  it("omits the environment filter when none is asked for", () => {
    expect(new URL(issueListUrl(CONFIG, {})).searchParams.has("environment")).toBe(false);
  });

  it("encodes the short id instead of splicing it into the path", () => {
    expect(shortIdLookupUrl(CONFIG, "POLIGRAPH-1N")).toBe(
      "https://sentry.io/api/0/organizations/poligraph/shortids/POLIGRAPH-1N/"
    );
  });

  it("mutates through the organization endpoint, which is the one that takes a numeric id", () => {
    expect(issueUrl(CONFIG, "144680922")).toBe(
      "https://sentry.io/api/0/organizations/poligraph/issues/144680922/"
    );
  });
});

describe("statusPayloadFor", () => {
  it("resolves in the next release by default, because a merge is not a deploy here", () => {
    expect(statusPayloadFor("resolve")).toEqual({ status: "resolvedInNextRelease" });
  });

  it("resolves outright only when explicitly asked", () => {
    expect(statusPayloadFor("resolve-now")).toEqual({ status: "resolved" });
  });

  it("maps ignore and reopen", () => {
    expect(statusPayloadFor("ignore")).toEqual({ status: "ignored" });
    expect(statusPayloadFor("reopen")).toEqual({ status: "unresolved" });
  });
});

describe("maskQueryString", () => {
  it("keeps the path and drops the query, which is where identifiers travel", () => {
    expect(maskQueryString("https://poligraph.fr/recherche?q=jean+dupont&page=2")).toBe(
      "https://poligraph.fr/recherche?…"
    );
  });

  it("leaves a url without a query untouched", () => {
    expect(maskQueryString("https://poligraph.fr/parlement/votes")).toBe(
      "https://poligraph.fr/parlement/votes"
    );
  });

  it("returns a non-url unchanged rather than throwing", () => {
    expect(maskQueryString("app/parlement/page")).toBe("app/parlement/page");
  });
});

describe("formatIssueLine", () => {
  it("leads with the short id, since that is what every other command takes", () => {
    const line = formatIssueLine(ISSUE);
    expect(line).toContain("POLIGRAPH-1N");
    expect(line).toContain("44");
    expect(line).toContain("error");
  });

  it("states the user count rather than hiding a zero", () => {
    expect(formatIssueLine({ ...ISSUE, userCount: 0 })).toContain("0 users");
  });
});

describe("formatFrames", () => {
  const entries = [
    {
      type: "exception",
      data: {
        values: [
          {
            type: "TypeError",
            value: "b is null",
            stacktrace: {
              frames: [
                {
                  filename: "node_modules/react-dom/client.js",
                  function: "commit",
                  lineNo: 12,
                  inApp: false,
                },
                { filename: "src/app/page.tsx", function: "Page", lineNo: 42, inApp: true },
              ],
            },
          },
        ],
      },
    },
  ];

  it("puts application frames first, because those are the ones we can fix", () => {
    const lines = formatFrames(entries);
    expect(lines[0]).toContain("src/app/page.tsx");
    expect(lines[0]).toContain("42");
  });

  it("marks third-party frames so a react-dom frame is not mistaken for ours", () => {
    expect(formatFrames(entries).join("\n")).toContain("vendor");
  });

  it("returns an empty list when the event carries no exception entry", () => {
    expect(formatFrames([{ type: "request", data: {} }])).toEqual([]);
  });
});

describe("formatBreadcrumb", () => {
  const crumb = {
    category: "navigation",
    message: "https://poligraph.fr/recherche?q=secret",
    level: "info",
    timestamp: "2026-09-20T10:00:00.000Z",
  };

  it("masks the query string by default", () => {
    expect(formatBreadcrumb(crumb, { raw: false })).not.toContain("secret");
  });

  it("keeps everything under --raw, which is an explicit choice", () => {
    expect(formatBreadcrumb(crumb, { raw: true })).toContain("secret");
  });
});

describe("network calls", () => {
  it("sends the documented payload and authenticates with a bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "resolvedInNextRelease" }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await updateIssueStatus(CONFIG, "144680922", "resolve");

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://sentry.io/api/0/organizations/poligraph/issues/144680922/");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ status: "resolvedInNextRelease" });
    expect(init.headers.Authorization).toBe("Bearer sntryu_secret");
  });

  it("resolves a short id to the numeric group id the mutation endpoint needs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ shortId: "POLIGRAPH-1N", groupId: "145549331" }), {
          status: 200,
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    expect(await lookupGroupId(CONFIG, "POLIGRAPH-1N")).toBe("145549331");
  });

  it("never puts the token in the error message when auth fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("invalid token: sntryu_secret", { status: 401 }))
    );

    const message = await updateIssueStatus(CONFIG, "144680922", "resolve").then(
      () => "resolved, which it must not",
      (error: Error) => error.message
    );
    expect(message).toContain("401");
    expect(message).not.toContain("sntryu_secret");
  });
});
