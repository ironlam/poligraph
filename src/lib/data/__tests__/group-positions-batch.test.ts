import { describe, it, expect, vi } from "vitest";

// groupes.ts imports @/lib/db at module load; this pure helper test needs no DB.
// Mock it file-scoped (never load real .env globally — that would run describeIfDb
// integration tests against the production database).
vi.mock("@/lib/db", () => ({ db: {} }));

import { groupPositionsByScrutinId } from "../groupes";

const row = (scrutinId: string, id: string) => ({
  scrutinId,
  id,
  position: "POUR" as const,
  forCount: 1,
  againstCount: 0,
  abstainCount: 0,
  cohesionPct: 100,
  group: {
    id: "g" + id,
    code: "RE",
    name: "Renaissance",
    shortName: "RE",
    color: "#FFD966",
    slug: "re",
  },
});

describe("groupPositionsByScrutinId", () => {
  it("regroupe par scrutinId", () => {
    const m = groupPositionsByScrutinId([row("s1", "a"), row("s1", "b"), row("s2", "c")]);
    expect(m.get("s1")).toHaveLength(2);
    expect(m.get("s2")).toHaveLength(1);
  });
  it("id absent → clé absente", () => {
    const m = groupPositionsByScrutinId([row("s1", "a")]);
    expect(m.has("s2")).toBe(false);
  });
  it("liste vide → map vide", () => {
    expect(groupPositionsByScrutinId([]).size).toBe(0);
  });
});
