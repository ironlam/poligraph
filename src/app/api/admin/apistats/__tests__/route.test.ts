import { describe, it, expect, vi, beforeEach } from "vitest";

const hgetall = vi.fn();
let authenticated = true;
vi.mock("@upstash/redis", () => ({
  Redis: class {
    hgetall = hgetall;
  },
}));
vi.mock("@/lib/auth", () => ({ isAuthenticated: () => Promise.resolve(authenticated) }));
vi.mock("@/lib/ratelimit/upstash-credentials", () => ({
  getUpstashCredentials: () => ({ url: "https://x", token: "y" }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/apistats/route";

const call = (url: string) => GET(new NextRequest(url), { params: Promise.resolve({}) });

describe("GET /api/admin/apistats", () => {
  beforeEach(() => {
    hgetall.mockReset();
    authenticated = true;
  });

  it("sums the daily hashes over the requested window", async () => {
    hgetall
      .mockResolvedValueOnce({ "/api/stats": 3 })
      .mockResolvedValueOnce({ browser: 3 })
      .mockResolvedValueOnce({ "/api/stats": 4, "/api/affaires": 1 })
      .mockResolvedValueOnce({ browser: 5 });

    const body = await (await call("https://poligraph.fr/api/admin/apistats?days=2")).json();
    expect(body.routes["/api/stats"]).toBe(7);
    expect(body.routes["/api/affaires"]).toBe(1);
    expect(body.clients.browser).toBe(8);
  });

  it("clamps an absurd window instead of reading a year of keys", async () => {
    hgetall.mockResolvedValue({});
    const response = await call("https://poligraph.fr/api/admin/apistats?days=9999");
    const body = await response.json();
    expect(body.days).toBe(90);
    // The real bounded quantity is the number of Upstash round-trips (2 per day),
    // not the echoed `days` value, which a clamping bug could report correctly
    // while still reading far more keys than it claims.
    expect(hgetall).toHaveBeenCalledTimes(180);
  });

  it("treats a missing day as zero rather than failing", async () => {
    hgetall.mockResolvedValue(null);
    const response = await call("https://poligraph.fr/api/admin/apistats?days=1");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ routes: {}, clients: {} });
  });

  it("sums values that come back as strings, not only as numbers", async () => {
    hgetall.mockResolvedValueOnce({ "/api/stats": "3" }).mockResolvedValueOnce({ browser: "3" });
    const body = await (await call("https://poligraph.fr/api/admin/apistats?days=1")).json();
    expect(body.routes["/api/stats"]).toBe(3);
    expect(body.clients.browser).toBe(3);
  });

  it("drops a corrupted value instead of erasing the whole window", async () => {
    hgetall
      .mockResolvedValueOnce({ "/api/stats": "pas-un-nombre" })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ "/api/stats": 7 })
      .mockResolvedValueOnce({});
    const body = await (await call("https://poligraph.fr/api/admin/apistats?days=2")).json();
    expect(body.routes["/api/stats"]).toBe(7);
  });

  it("refuses an unauthenticated caller", async () => {
    authenticated = false;
    const response = await call("https://poligraph.fr/api/admin/apistats");
    expect(response.status).toBe(401);
    expect(hgetall).not.toHaveBeenCalled();
  });
});
