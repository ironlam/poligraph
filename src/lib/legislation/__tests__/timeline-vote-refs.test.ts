import { describe, expect, it } from "vitest";
import { extractDossierVoteRefs, timelineContainsVoteRef } from "../timeline-vote-refs";

describe("références de scrutin des dossiers législatifs", () => {
  it("conserve les références exactes, y compris dans une structure imbriquée", () => {
    const source = {
      voteRefs: { voteRef: ["VTANR5L17V518", " VTANR5L17V3055 "] },
      children: [{ voteRefs: { voteRef: "VTANR5L17V7401" } }],
    };

    expect(extractDossierVoteRefs(source)).toEqual([
      "VTANR5L17V518",
      "VTANR5L17V3055",
      "VTANR5L17V7401",
    ]);
    expect(timelineContainsVoteRef(source, "VTANR5L17V3055")).toBe(true);
  });

  it("rejette les correspondances partielles et les autres chaînes", () => {
    const source = { voteRefs: { voteRef: "préfixe-VTANR5L17V518" } };

    expect(extractDossierVoteRefs(source)).toEqual([]);
    expect(timelineContainsVoteRef(source, "VTANR5L17V51")).toBe(false);
  });
});
