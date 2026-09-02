import { afterEach, describe, it, expect, vi } from "vitest";
import { USER_AGENT } from "@/config/site";
import { describeError, HTTPClient, HTTPError, isUnresolvableHostError } from "../http-client";

describe("describeError", () => {
  it("returns the message of a plain error", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("appends the errno code when present", () => {
    const err = Object.assign(new Error("getaddrinfo ENOTFOUND example.fr"), {
      code: "ENOTFOUND",
    });
    expect(describeError(err)).toBe("getaddrinfo ENOTFOUND example.fr [ENOTFOUND]");
  });

  it("unwraps the cause chain hidden behind an opaque fetch failure", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND docparl.example.fr"), {
      code: "ENOTFOUND",
    });
    const err = new Error("fetch failed", { cause });

    expect(describeError(err)).toBe(
      "fetch failed <- getaddrinfo ENOTFOUND docparl.example.fr [ENOTFOUND]"
    );
  });

  it("expands an AggregateError of per-IP connection failures", () => {
    const cause = new AggregateError(
      [
        Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" }),
        Object.assign(new Error("connect ECONNREFUSED 5.6.7.8:443"), { code: "ECONNREFUSED" }),
      ],
      "all attempts failed"
    );
    const err = new Error("fetch failed", { cause });

    expect(describeError(err)).toBe(
      "fetch failed <- all attempts failed <- " +
        "connect ECONNREFUSED 1.2.3.4:443 [ECONNREFUSED], " +
        "connect ECONNREFUSED 5.6.7.8:443 [ECONNREFUSED]"
    );
  });

  it("deduplicates identical aggregated failures", () => {
    const cause = new AggregateError(
      [new Error("connect ETIMEDOUT"), new Error("connect ETIMEDOUT")],
      "all attempts failed"
    );

    expect(describeError(new Error("fetch failed", { cause }))).toBe(
      "fetch failed <- all attempts failed <- connect ETIMEDOUT"
    );
  });

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;

    expect(describeError(a)).toBe("a <- b");
  });

  it("stops at the depth guard for a long chain", () => {
    let err = new Error("root");
    for (let i = 0; i < 10; i++) {
      err = new Error(`level-${i}`, { cause: err });
    }

    expect(describeError(err).split(" <- ")).toHaveLength(5);
  });

  it("handles non-Error values", () => {
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(new Error("wrapped", { cause: "string cause" }))).toBe(
      "wrapped <- string cause"
    );
  });

  it("returns an empty string for a missing error", () => {
    expect(describeError(undefined)).toBe("");
    expect(describeError(null)).toBe("");
  });

  it("keeps HTTPError messages intact", () => {
    expect(describeError(new HTTPError("HTTP 404: Not Found", 404, "https://example.fr"))).toBe(
      "HTTP 404: Not Found"
    );
  });
});

describe("isUnresolvableHostError", () => {
  it("detects a DNS miss hidden behind an opaque fetch failure", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND example.fr"), {
      code: "ENOTFOUND",
    });

    expect(isUnresolvableHostError(new Error("fetch failed", { cause }))).toBe(true);
  });

  it("detects a DNS miss aggregated across several attempts", () => {
    const cause = new AggregateError(
      [Object.assign(new Error("getaddrinfo ENOTFOUND example.fr"), { code: "ENOTFOUND" })],
      "all attempts failed"
    );

    expect(isUnresolvableHostError(new Error("fetch failed", { cause }))).toBe(true);
  });

  it("does not treat a resolver timeout as unresolvable", () => {
    const cause = Object.assign(new Error("getaddrinfo EAI_AGAIN example.fr"), {
      code: "EAI_AGAIN",
    });

    expect(isUnresolvableHostError(new Error("fetch failed", { cause }))).toBe(false);
  });

  it("does not treat a refused connection or an HTTP error as unresolvable", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), {
      code: "ECONNREFUSED",
    });

    expect(isUnresolvableHostError(refused)).toBe(false);
    expect(isUnresolvableHostError(new HTTPError("HTTP 404: Not Found", 404, "https://x.fr"))).toBe(
      false
    );
    expect(isUnresolvableHostError(undefined)).toBe(false);
  });

  it("terminates on a cyclic cause chain", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    a.cause = b;

    expect(isUnresolvableHostError(a)).toBe(false);
  });
});

describe("HTTPClient retry policy", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops retrying a host that does not resolve", async () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND gone.example.fr"), {
      code: "ENOTFOUND",
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("fetch failed", { cause }));

    const error = await new HTTPClient({ retries: 3, retryDelay: 0 })
      .get("https://gone.example.fr/data")
      .catch((caught: unknown) => caught);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((error as Error).message).toBe(
      "fetch failed <- getaddrinfo ENOTFOUND gone.example.fr [ENOTFOUND] " +
        "(https://gone.example.fr/data)"
    );
  });

  it("still retries a transient network failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("socket hang up"));

    await new HTTPClient({ retries: 2, retryDelay: 0 })
      .get("https://example.fr/data")
      .catch(() => undefined);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("HTTPClient error URL redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes credentials, query parameters, and fragments from network errors", async () => {
    const secret = "super-secret-api-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const client = new HTTPClient({ retries: 0 });

    const error = await client
      .get(`https://user:password@example.fr/path?key=${secret}#fragment`)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("network down (https://example.fr/path)");
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).message).not.toContain("password");
  });

  it("preserves a query-free endpoint in network errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const client = new HTTPClient({ retries: 0 });

    const error = await client.get("https://example.fr/path").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("network down (https://example.fr/path)");
  });

  it("does not echo malformed URLs in fallback errors", async () => {
    const secret = "super-secret-api-key";
    const client = new HTTPClient();

    const error = await client
      .get(`not-a-url?key=${secret}`, { retries: -1 })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Failed to fetch [redacted URL]");
    expect((error as Error).message).not.toContain(secret);
  });

  it("redacts the URL used by 429 diagnostics", async () => {
    const secret = "super-secret-api-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 429, statusText: "Too Many Requests" })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const client = new HTTPClient({ retries: 0 });

    const error = await client
      .get(`https://example.fr/path?key=${secret}`)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(HTTPError);
    expect(warn).toHaveBeenCalledWith(
      "[HTTPClient] 429 Too Many Requests from https://example.fr/path (attempt 1/1)"
    );
    expect(warn.mock.calls.flat().join(" ")).not.toContain(secret);
  });
});

describe("HTTPClient crawler identity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockSuccessfulFetch() {
    return vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
  }

  function requestHeaders(fetchMock: ReturnType<typeof mockSuccessfulFetch>): Headers {
    const init = fetchMock.mock.calls[0]?.[1];
    return new Headers(init?.headers);
  }

  it("identifies default requests as Poligraph", async () => {
    const fetchMock = mockSuccessfulFetch();

    await new HTTPClient({ retries: 0 }).get("https://example.fr/data");

    expect(requestHeaders(fetchMock).get("user-agent")).toBe(USER_AGENT);
  });

  it("does not expose or honor a configurable userAgent option", async () => {
    const fetchMock = mockSuccessfulFetch();

    await new HTTPClient({
      retries: 0,
      // @ts-expect-error HTTPClient identity is intentionally not configurable
      userAgent: "Mozilla/5.0",
    }).get("https://example.fr/data");

    expect(requestHeaders(fetchMock).get("user-agent")).toBe(USER_AGENT);
  });

  it("does not let client option headers replace the canonical User-Agent", async () => {
    const fetchMock = mockSuccessfulFetch();

    await new HTTPClient({
      retries: 0,
      headers: { "User-Agent": "Mozilla/5.0", "X-Base": "base" },
    }).get("https://example.fr/data");

    const headers = requestHeaders(fetchMock);
    expect(headers.get("user-agent")).toBe(USER_AGENT);
    expect(headers.get("x-base")).toBe("base");
  });

  it("does not let request option headers replace the canonical User-Agent", async () => {
    const fetchMock = mockSuccessfulFetch();

    await new HTTPClient({ retries: 0 }).get("https://example.fr/data", {
      headers: { "User-Agent": "curl/8", "X-Request": "request" },
    });

    const headers = requestHeaders(fetchMock);
    expect(headers.get("user-agent")).toBe(USER_AGENT);
    expect(headers.get("x-request")).toBe("request");
  });

  it("does not let internal init headers replace the canonical User-Agent", async () => {
    const fetchMock = mockSuccessfulFetch();
    const client = new HTTPClient({ retries: 0 });
    const fetchWithRetry = client as unknown as {
      fetchWithRetry<T>(
        url: string,
        init: RequestInit,
        options: Record<string, never>
      ): Promise<{ data: T }>;
    };

    await fetchWithRetry.fetchWithRetry(
      "https://example.fr/data",
      {
        method: "GET",
        headers: { "User-Agent": "bot", "X-Init": "init" },
      },
      {}
    );

    const headers = requestHeaders(fetchMock);
    expect(headers.get("user-agent")).toBe(USER_AGENT);
    expect(headers.get("x-init")).toBe("init");
  });

  it("normalizes User-Agent casing while merging unrelated headers", async () => {
    const fetchMock = mockSuccessfulFetch();

    await new HTTPClient({
      retries: 0,
      headers: { "user-agent": "lowercase bypass", Accept: "application/json" },
    }).get("https://example.fr/data", {
      headers: { "UsEr-AgEnT": "mixed-case bypass", "X-Trace": "trace" },
    });

    const headers = requestHeaders(fetchMock);
    expect(headers.get("user-agent")).toBe(USER_AGENT);
    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("x-trace")).toBe("trace");
  });
});
