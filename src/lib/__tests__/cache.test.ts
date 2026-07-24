import { describe, it, expect, vi, beforeEach } from "vitest";

const updateTag = vi.fn();
const revalidateTag = vi.fn();
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

import { updateTags, invalidateAffectedPoliticians } from "@/lib/cache";

describe("updateTags", () => {
  beforeEach(() => updateTag.mockClear());
  it("calls updateTag once per tag, with no profile arg", () => {
    updateTags(["votes", "dossiers"]);
    expect(updateTag).toHaveBeenCalledTimes(2);
    expect(updateTag).toHaveBeenNthCalledWith(1, "votes");
    expect(updateTag).toHaveBeenNthCalledWith(2, "dossiers");
  });
});

describe("invalidateAffectedPoliticians", () => {
  beforeEach(() => revalidateTag.mockClear());
  it("invalidates each distinct politician once and skips falsy slugs", () => {
    invalidateAffectedPoliticians(["a", "a", null, undefined, "b"]);
    const politicianTags = revalidateTag.mock.calls
      .map((c) => c[0])
      .filter((t) => String(t).startsWith("politician:"));
    expect(politicianTags).toEqual(["politician:a", "politician:b"]);
  });
});
