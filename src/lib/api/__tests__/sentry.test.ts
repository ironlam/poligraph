import { describe, it, expect, vi, afterEach } from "vitest";
import {
  readSentryConfig,
  assertShortId,
  issueListUrl,
  shortIdLookupUrl,
  issueUrl,
  latestEventUrl,
  statusPayloadFor,
  statusLabelFor,
  clampLimit,
  maskQueryString,
  formatIssueLine,
  formatFrames,
  formatBreadcrumb,
  breadcrumbsFrom,
  updateIssueStatus,
  lookupGroupId,
  projectUrl,
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

  it("accepts a short id from a hyphenated project slug", () => {
    // Sentry's own example is PUMP-STATION-1, for the slug `pump-station`. Requiring exactly one
    // dash rejected every such project while blaming the operator's input.
    expect(assertShortId("PUMP-STATION-1")).toBe("PUMP-STATION-1");
    expect(assertShortId("POLIGRAPH-WIKIBOT-2AB")).toBe("POLIGRAPH-WIKIBOT-2AB");
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
  const PROJECT_ID = "4511242598613073";

  it("targets sentry.io and nothing else", () => {
    for (const url of [
      issueListUrl(CONFIG, PROJECT_ID, {}),
      shortIdLookupUrl(CONFIG, "POLIGRAPH-1N"),
      issueUrl(CONFIG, "144680922"),
      latestEventUrl(CONFIG, "144680922"),
      projectUrl(CONFIG),
    ]) {
      expect(new URL(url).origin).toBe("https://sentry.io");
    }
  });

  /**
   * The org and project slugs come from the environment and land in a URL path. Before they were
   * validated, a slug carrying `..` retargeted the request the PUT travels on.
   */
  it.each([
    ["a path traversal", "../../organizations/evil"],
    ["a slash", "poligraph/x"],
    ["a query string", "poligraph?foo"],
    ["a fragment", "poligraph#x"],
    ["an empty slug", ""],
  ])("refuses an org slug carrying %s", (_label, org) => {
    expect(() => issueListUrl({ ...CONFIG, org }, PROJECT_ID, {})).toThrow(/SENTRY_ORG/);
    expect(() => issueUrl({ ...CONFIG, org }, "1")).toThrow(/SENTRY_ORG/);
  });

  it("refuses a project slug carrying a path traversal", () => {
    expect(() => projectUrl({ ...CONFIG, project: "../evil" })).toThrow(/SENTRY_PROJECT/);
  });

  /**
   * The project endpoint accepts only "", "24h" and "14d" for statsPeriod and filters nothing with
   * it; the organization one takes any period and actually narrows the window.
   */
  it("lists through the organization endpoint, where the period is a real filter", () => {
    const url = new URL(issueListUrl(CONFIG, PROJECT_ID, {}));
    expect(url.pathname).toBe("/api/0/organizations/poligraph/issues/");
    expect(url.searchParams.get("project")).toBe(PROJECT_ID);
    expect(url.searchParams.get("query")).toBe("is:unresolved");
    expect(url.searchParams.get("statsPeriod")).toBe("14d");
  });

  it("sorts by frequency, because the command promises the noisiest first", () => {
    // Sentry's default is last-seen order, which put a 70-event issue above a 1422-event one.
    expect(new URL(issueListUrl(CONFIG, PROJECT_ID, {})).searchParams.get("sort")).toBe("freq");
  });

  it("accepts a period the project endpoint would have rejected", () => {
    expect(
      new URL(issueListUrl(CONFIG, PROJECT_ID, { statsPeriod: "30d" })).searchParams.get(
        "statsPeriod"
      )
    ).toBe("30d");
  });

  it("passes an environment filter through, so prod and local dev do not get mixed", () => {
    const url = new URL(issueListUrl(CONFIG, PROJECT_ID, { environment: "production" }));
    expect(url.searchParams.get("environment")).toBe("production");
  });

  it("omits the environment filter when none is asked for", () => {
    expect(new URL(issueListUrl(CONFIG, PROJECT_ID, {})).searchParams.has("environment")).toBe(
      false
    );
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

describe("clampLimit", () => {
  it("stops at the 100 Sentry serves, so the printed count is not a silent truncation", () => {
    expect(clampLimit(500)).toBe(100);
  });

  it("falls back to the default on a value that is not a number", () => {
    expect(clampLimit(Number.NaN)).toBe(25);
    expect(clampLimit(undefined)).toBe(25);
  });

  it("refuses to ask for zero issues", () => {
    expect(clampLimit(0)).toBe(1);
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
    const fetchMock = vi.fn().mockResolvedValue(
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

describe("maskQueryString on the shapes breadcrumbs actually carry", () => {
  it("masks a query inside a sentence, not only a bare url", () => {
    expect(maskQueryString("Navigated to https://poligraph.fr/recherche?q=secret")).toBe(
      "Navigated to https://poligraph.fr/recherche?…"
    );
  });

  it("masks a relative path, which is how a navigation breadcrumb is usually written", () => {
    expect(maskQueryString("GET /recherche?q=secret [200]")).toBe("GET /recherche?… [200]");
  });

  it("masks a fragment, where a token travels after an oauth callback", () => {
    expect(maskQueryString("https://poligraph.fr/callback#access_token=xyz")).toBe(
      "https://poligraph.fr/callback#…"
    );
  });

  it("leaves ordinary prose alone", () => {
    expect(maskQueryString("Vraiment ? une phrase sans url")).toBe(
      "Vraiment ? une phrase sans url"
    );
  });
});

describe("breadcrumbsFrom", () => {
  it("reads the entries envelope, which is where Sentry puts them", () => {
    // There is no top-level `breadcrumbs` key on an event: reading one returned undefined on every
    // response, so the section rendered nothing while the command still advertised --raw.
    const entries = [
      { type: "exception", data: { values: [] } },
      { type: "breadcrumbs", data: { values: [{ category: "navigation", message: "/a" }] } },
    ];
    expect(breadcrumbsFrom(entries)).toEqual([{ category: "navigation", message: "/a" }]);
  });

  it("returns an empty list when the event carries no breadcrumbs entry", () => {
    expect(breadcrumbsFrom([{ type: "exception", data: { values: [] } }])).toEqual([]);
  });
});

describe("statusLabelFor", () => {
  it("prints the value that is actually sent, so the two cannot drift", () => {
    expect(statusLabelFor("resolve")).toBe(statusPayloadFor("resolve").status);
    expect(statusLabelFor("resolve")).toBe("resolvedInNextRelease");
  });
});

describe("lookupGroupId project scoping", () => {
  it("refuses a short id belonging to another project of the organization", async () => {
    // The lookup is org-wide and the write endpoint is too, while the listing is project-scoped:
    // nothing else stops a sibling project's issue from being closed by mistake.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ groupId: "9", projectSlug: "autre-projet" }), {
          status: 200,
        })
      )
    );

    const message = await lookupGroupId(CONFIG, "AUTRE-1A").then(
      () => "resolved, which it must not",
      (error: Error) => error.message
    );
    expect(message).toContain("autre-projet");
    expect(message).toContain("Rien n'a été écrit");
  });

  it("accepts a short id of the configured project", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ groupId: "9", projectSlug: "poligraph" }), { status: 200 })
        )
    );
    expect(await lookupGroupId(CONFIG, "POLIGRAPH-1N")).toBe("9");
  });
});

describe("fetchSentry robustness", () => {
  it("names the endpoint when a 200 is not JSON, instead of a bare SyntaxError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<!doctype html><html>maintenance", { status: 200 }))
    );

    const message = await lookupGroupId(CONFIG, "POLIGRAPH-1N").then(
      () => "resolved, which it must not",
      (error: Error) => error.message
    );
    expect(message).toContain("non JSON");
    expect(message).toContain("sentry.io");
  });

  it("gives every request a deadline so a stalled socket cannot pin the command", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ groupId: "9" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await lookupGroupId(CONFIG, "POLIGRAPH-1N");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
