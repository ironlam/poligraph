import { describe, it, expect, vi, beforeEach } from "vitest";

const updateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));

import { updateTags } from "@/lib/cache";

describe("updateTags", () => {
  beforeEach(() => updateTag.mockClear());
  it("calls updateTag once per tag, with no profile arg", () => {
    updateTags(["votes", "dossiers"]);
    expect(updateTag).toHaveBeenCalledTimes(2);
    expect(updateTag).toHaveBeenNthCalledWith(1, "votes");
    expect(updateTag).toHaveBeenNthCalledWith(2, "dossiers");
  });
});
