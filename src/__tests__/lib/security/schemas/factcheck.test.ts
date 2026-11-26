import { describe, it, expect } from "vitest";
import {
  updateFactcheckSchema,
  addFactcheckMentionSchema,
  updateMentionSchema,
} from "@/lib/security/schemas/factcheck";

describe("updateFactcheckSchema", () => {
  it("accepts valid publicationStatus", () => {
    const result = updateFactcheckSchema.safeParse({ publicationStatus: "PUBLISHED" });
    expect(result.success).toBe(true);
  });

  it("accepts valid verdictRating", () => {
    const result = updateFactcheckSchema.safeParse({ verdictRating: "FALSE" });
    expect(result.success).toBe(true);
  });

  it("accepts both fields", () => {
    const result = updateFactcheckSchema.safeParse({
      publicationStatus: "DRAFT",
      verdictRating: "MOSTLY_TRUE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid verdictRating", () => {
    const result = updateFactcheckSchema.safeParse({ verdictRating: "BOGUS" });
    expect(result.success).toBe(false);
  });

  it("accepts empty body (at-least-one-field checked in route handler)", () => {
    const result = updateFactcheckSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("addFactcheckMentionSchema", () => {
  it("accepts valid politicianId with isClaimant", () => {
    const result = addFactcheckMentionSchema.safeParse({
      politicianId: "clx123abc",
      isClaimant: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults isClaimant to false", () => {
    const result = addFactcheckMentionSchema.safeParse({ politicianId: "clx123" });
    expect(result.success).toBe(true);
    expect(result.data?.isClaimant).toBe(false);
  });

  it("rejects missing politicianId", () => {
    const result = addFactcheckMentionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("updateMentionSchema", () => {
  it("accepts isClaimant toggle", () => {
    const result = updateMentionSchema.safeParse({ isClaimant: true });
    expect(result.success).toBe(true);
  });

  it("accepts a validation", () => {
    const result = updateMentionSchema.safeParse({ reviewed: true });
    expect(result.success).toBe(true);
  });

  it("rejects an un-validation: removing the mention is the way back", () => {
    const result = updateMentionSchema.safeParse({ reviewed: false });
    expect(result.success).toBe(false);
  });

  it("rejects empty body", () => {
    const result = updateMentionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
