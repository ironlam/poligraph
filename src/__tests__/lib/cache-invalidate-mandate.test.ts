import { describe, it, expect, vi, beforeEach } from "vitest";

const revalidatePathMock = vi.fn();
const updateTagMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}));

import { invalidateEntity } from "@/lib/cache";

describe("invalidateEntity('mandate')", () => {
  beforeEach(() => {
    revalidatePathMock.mockReset();
    updateTagMock.mockReset();
  });

  it("default purges politicians tag", () => {
    invalidateEntity("mandate");
    expect(updateTagMock).toHaveBeenCalledWith("politicians");
    expect(revalidatePathMock).toHaveBeenCalledWith("/api/mandats", "layout");
  });

  it("affectsListings=true purges politicians tag", () => {
    invalidateEntity("mandate", undefined, { affectsListings: true });
    expect(updateTagMock).toHaveBeenCalledWith("politicians");
  });

  it("affectsListings=false skips politicians tag", () => {
    invalidateEntity("mandate", undefined, { affectsListings: false });
    expect(updateTagMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
