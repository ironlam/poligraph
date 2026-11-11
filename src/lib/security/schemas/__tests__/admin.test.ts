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

  it("defaults scope to all and accepts page, rejects anything else", () => {
    expect(revalidateVotesSchema.parse({ scrutinIds: ["a"] }).scope).toBe("all");
    expect(revalidateVotesSchema.safeParse({ scrutinIds: ["a"], scope: "page" }).success).toBe(
      true
    );
    expect(revalidateVotesSchema.safeParse({ scrutinIds: ["a"], scope: "x" }).success).toBe(false);
  });

  it("accepts exactly 200 scrutinIds (cap boundary)", () => {
    const scrutinIds = Array.from({ length: 200 }, (_, i) => `sc-${i}`);
    const r = revalidateVotesSchema.safeParse({ scrutinIds });
    expect(r.success).toBe(true);
  });
});
