import { describe, it, expect } from "vitest";
import { revalidateVotesSchema } from "../admin";

describe("revalidateVotesSchema", () => {
  it("rejects an empty scrutinIds array", () => {
    const r = revalidateVotesSchema.safeParse({ scrutinIds: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a scrutinIds array containing an empty string", () => {
    const r = revalidateVotesSchema.safeParse({ scrutinIds: [""] });
    expect(r.success).toBe(false);
  });

  it("rejects more than 200 scrutinIds", () => {
    const scrutinIds = Array.from({ length: 201 }, (_, i) => `sc-${i}`);
    const r = revalidateVotesSchema.safeParse({ scrutinIds });
    expect(r.success).toBe(false);
  });

  it("accepts a valid list of scrutinIds", () => {
    const r = revalidateVotesSchema.safeParse({ scrutinIds: ["sc-1", "sc-2", "sc-3"] });
    expect(r.success).toBe(true);
  });

  it("accepts exactly 200 scrutinIds (cap boundary)", () => {
    const scrutinIds = Array.from({ length: 200 }, (_, i) => `sc-${i}`);
    const r = revalidateVotesSchema.safeParse({ scrutinIds });
    expect(r.success).toBe(true);
  });
});
