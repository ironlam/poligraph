import { describe, expect, it } from "vitest";
import { createChangelogSchema, updateChangelogSchema } from "../changelog";

const valid = {
  type: "AMELIORATION",
  date: "2026-10-24",
  title: "Votes clés : un aperçu plus lisible",
  body: "L'aperçu est plus lisible.",
  sourceUrl: "https://github.com/ironlam/poligraph/pull/1189",
};

describe("createChangelogSchema", () => {
  it("accepts a complete entry", () => {
    expect(createChangelogSchema.safeParse(valid).success).toBe(true);
  });

  it("refuses a day that does not exist", () => {
    expect(createChangelogSchema.safeParse({ ...valid, date: "2026-13-45" }).success).toBe(false);
    expect(createChangelogSchema.safeParse({ ...valid, date: "2026-02-30" }).success).toBe(false);
  });

  it("accepts a draft without source", () => {
    expect(createChangelogSchema.safeParse({ ...valid, sourceUrl: null }).success).toBe(true);
  });

  it("refuses a non-https or malformed source", () => {
    expect(createChangelogSchema.safeParse({ ...valid, sourceUrl: "http://x.org" }).success).toBe(
      false
    );
    expect(
      createChangelogSchema.safeParse({ ...valid, sourceUrl: "javascript:alert(1)" }).success
    ).toBe(false);
    expect(createChangelogSchema.safeParse({ ...valid, sourceUrl: "pas un lien" }).success).toBe(
      false
    );
  });

  it("refuses an unknown type and a badly formatted date", () => {
    expect(createChangelogSchema.safeParse({ ...valid, type: "AUTRE" }).success).toBe(false);
    expect(createChangelogSchema.safeParse({ ...valid, date: "24/10/2026" }).success).toBe(false);
  });

  it("does not let a create call choose the publication status", () => {
    const parsed = createChangelogSchema.parse({ ...valid, status: "PUBLISHED" });
    expect("status" in parsed).toBe(false);
  });
});

describe("updateChangelogSchema", () => {
  it("only allows DRAFT and PUBLISHED as status", () => {
    expect(updateChangelogSchema.safeParse({ status: "PUBLISHED" }).success).toBe(true);
    expect(updateChangelogSchema.safeParse({ status: "EXCLUDED" }).success).toBe(false);
  });
});
