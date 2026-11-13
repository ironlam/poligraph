import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePathMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

import { invalidateEntity } from "@/lib/cache";

describe("invalidateEntity('mandate')", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    revalidateTagMock.mockReset();
  });

  it("default purges politicians tag", () => {
    invalidateEntity("mandate");
    expect(revalidateTagMock).toHaveBeenCalledWith("politicians", "minutes");
    expect(revalidatePathMock).toHaveBeenCalledWith("/api/mandats", "layout");
  });

  it("affectsListings=true purges politicians tag", () => {
    invalidateEntity("mandate", undefined, { affectsListings: true });
    expect(revalidateTagMock).toHaveBeenCalledWith("politicians", "minutes");
  });

  it("affectsListings=false skips politicians tag", () => {
    invalidateEntity("mandate", undefined, { affectsListings: false });
    expect(revalidateTagMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("purges the vote readers of the profile, which read deputy mandates", () => {
    // They no longer carry "politicians" (the daily sync purges it three times a day), so a
    // mandate edit has to name their own tag or the participation perimeter would stay stale.
    invalidateEntity("mandate");
    expect(revalidateTagMock).toHaveBeenCalledWith("politician-votes", "minutes");
  });
});

describe("invalidateEntity('politician')", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    revalidateTagMock.mockReset();
  });

  it("purges the vote readers of the profile along with the politicians tag", () => {
    invalidateEntity("politician", "jean-dupont");
    expect(revalidateTagMock).toHaveBeenCalledWith("politicians", "minutes");
    expect(revalidateTagMock).toHaveBeenCalledWith("politician-votes", "minutes");
  });
});
