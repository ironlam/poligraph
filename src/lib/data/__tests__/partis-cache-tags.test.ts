import { describe, it, expect, vi, beforeEach } from "vitest";

const cacheTag = vi.fn();
const revalidateTag = vi.fn();

vi.mock("next/cache", () => ({
  cacheTag: (...args: unknown[]) => cacheTag(...args),
  cacheLife: vi.fn(),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    party: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    mandate: { findMany: vi.fn().mockResolvedValue([]) },
    partyMembership: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([
      {
        actifs: BigInt(0),
        gauche: BigInt(0),
        centre: BigInt(0),
        droite: BigInt(0),
        affaires: BigInt(0),
      },
    ]),
  },
}));

import {
  getParty,
  getPartiesStats,
  getParties,
  getPartyLeadership,
  getPartyRoles,
} from "@/lib/data/partis";
import { invalidateEntity } from "@/lib/cache";

function tagsOfLastCall(): string[] {
  return cacheTag.mock.calls.flat() as string[];
}

describe("tags de cache des partis", () => {
  beforeEach(() => cacheTag.mockClear());

  it("getParty dépend des affaires", async () => {
    await getParty("un-parti");
    expect(tagsOfLastCall()).toEqual(
      expect.arrayContaining(["party:un-parti", "parties", "affairs"])
    );
  });

  it("la liste des partis dépend des affaires", async () => {
    await getParties();
    expect(tagsOfLastCall()).toEqual(expect.arrayContaining(["parties", "affairs"]));
  });

  it("les statistiques des partis dépendent des affaires", async () => {
    await getPartiesStats();
    expect(tagsOfLastCall()).toEqual(expect.arrayContaining(["parties", "affairs"]));
  });

  it("la direction et les rôles ne lisent aucune affaire", async () => {
    await getPartyLeadership("p1", "Parti");
    await getPartyRoles("p1");
    expect(tagsOfLastCall()).not.toContain("affairs");
  });
});

describe("invalidateEntity('affair')", () => {
  it("revalide le tag affairs lu par les partis", () => {
    revalidateTag.mockClear();
    invalidateEntity("affair", "une-affaire");
    expect(revalidateTag).toHaveBeenCalledWith("affairs", expect.anything());
  });
});
