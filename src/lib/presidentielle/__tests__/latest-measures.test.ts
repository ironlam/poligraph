import { describe, expect, it } from "vitest";
import { keepOnePerCandidacy } from "../latest-measures";

const row = (id: string, candidacyId: string | null) => ({ id, candidacyId });

describe("keepOnePerCandidacy", () => {
  it("garde la première ligne de chaque candidature, dans l'ordre reçu", () => {
    const rows = [row("a1", "A"), row("a2", "A"), row("b1", "B"), row("a3", "A"), row("c1", "C")];
    expect(keepOnePerCandidacy(rows, 4).map((r) => r.id)).toEqual(["a1", "b1", "c1"]);
  });

  it("s'arrête à la limite", () => {
    const rows = [row("a", "A"), row("b", "B"), row("c", "C")];
    expect(keepOnePerCandidacy(rows, 2).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("écarte une ligne sans candidature", () => {
    expect(keepOnePerCandidacy([row("x", null), row("a", "A")], 4).map((r) => r.id)).toEqual(["a"]);
  });
});
