import { describe, it, expect, vi } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
const updateTag = vi.fn();
// Wrapped in an arrow function (not the bare shorthand) so the factory doesn't
// dereference `revalidatePath` at hoist time, which throws a TDZ error since
// vi.mock factories run before local const declarations are initialized.
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  updateTag: (...args: unknown[]) => updateTag(...args),
}));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ slug: "s", theme: "SANTE", importance: { isKeyVote: false } }),
    },
  },
}));

import { revalidatePublicPathsForScrutin } from "@/lib/votes/revalidate-public";

describe("revalidatePublicPathsForScrutin", () => {
  it("revalidates detail + list + theme paths, never the votes tag", async () => {
    await revalidatePublicPathsForScrutin("id1");
    expect(revalidatePath).toHaveBeenCalledWith("/parlement/votes/s");
    expect(revalidatePath).toHaveBeenCalledWith("/parlement/votes");
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
