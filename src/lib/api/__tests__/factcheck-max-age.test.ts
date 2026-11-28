import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    get = h.get;
    getText = vi.fn();
  },
}));

import { searchClaims } from "@/lib/api/factcheck";

function requestedParams(): URLSearchParams {
  return new URL(h.get.mock.calls[0]![0] as string).searchParams;
}

describe("searchClaims maxAgeDays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_FACTCHECK_API_KEY = "test-key";
    h.get.mockResolvedValue({ data: {} });
  });

  it("sends maxAgeDays when given", async () => {
    await searchClaims("Camille Exemple", { maxAgeDays: 30, maxPages: 1 });
    expect(requestedParams().get("maxAgeDays")).toBe("30");
  });

  it("leaves it out otherwise, so the cron's rotation still reads the whole stock", async () => {
    await searchClaims("Camille Exemple", { maxPages: 1 });
    expect(requestedParams().has("maxAgeDays")).toBe(false);
  });
});
