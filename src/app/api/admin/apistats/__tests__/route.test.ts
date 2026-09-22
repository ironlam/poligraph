import { describe, it, expect, vi, beforeEach } from "vitest";

const hgetall = vi.fn();
vi.mock("@upstash/redis", () => ({
  Redis: class {
    hgetall = hgetall;
  },
}));
vi.mock("@/lib/auth", () => ({ isAuthenticated: () => Promise.resolve(true) }));
vi.mock("@/lib/ratelimit/upstash-credentials", () => ({
  getUpstashCredentials: () => ({ url: "https://x", token: "y" }),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/admin/apistats/route";

const call = (url: string) => GET(new NextRequest(url), { params: Promise.resolve({}) });

describe("GET /api/admin/apistats", () => {
  beforeEach(() => hgetall.mockReset());

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
    const body = await (await call("https://poligraph.fr/api/admin/apistats?days=9999")).json();
    expect(body.days).toBe(90);
  });

  it("treats a missing day as zero rather than failing", async () => {
    hgetall.mockResolvedValue(null);
    const response = await call("https://poligraph.fr/api/admin/apistats?days=1");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ routes: {}, clients: {} });
  });
});
