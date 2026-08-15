import { describe, it, expect } from "vitest";
import { describeError, HTTPError } from "../http-client";

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
