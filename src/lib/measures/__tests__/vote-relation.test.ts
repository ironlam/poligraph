import { describe, expect, it } from "vitest";
import { deriveVoteRelation, type VoteRelationLink } from "../vote-relation";

const PUB = "rev-published";
const OLD = "rev-superseded";

function link(over: Partial<VoteRelationLink> = {}): VoteRelationLink {
  return {
    linkKind: "SAME_OBJECT",
    applicableRevisionId: PUB,
    position: "FAVORABLE",
    ...over,
  };
}

/**
 * The rule that matters most (spec §9.2): no available vote datum may render as "recherche non
 * effectuée". That state is reserved for zero links. Written first, before the nominal cases.
 */
describe("deriveVoteRelation : aucune donnée ne se rend en recherche non effectuée", () => {
  it("un NO_VOTE_IDENTIFIED sur la révision publiée donne NO_VOTE_IN_SCOPE", () => {
    expect(
      deriveVoteRelation([link({ linkKind: "NO_VOTE_IDENTIFIED", position: null })], PUB)
    ).toBe("NO_VOTE_IN_SCOPE");
  });

  it("un lien uniquement sur une révision supersédée donne NOT_RECHECKED_SINCE_REFORMULATION", () => {
    expect(deriveVoteRelation([link({ applicableRevisionId: OLD })], PUB)).toBe(
      "NOT_RECHECKED_SINCE_REFORMULATION"
    );
  });

  it("SEARCH_NOT_DONE seulement quand il n'y a aucun lien", () => {
    expect(deriveVoteRelation([], PUB)).toBe("SEARCH_NOT_DONE");
  });
});

describe("deriveVoteRelation : les neuf états", () => {
  it("vote favorable sur le même objet", () => {
    expect(deriveVoteRelation([link({ position: "FAVORABLE" })], PUB)).toBe(
      "FAVORABLE_SAME_OBJECT"
    );
  });

  it("vote défavorable sur le même objet", () => {
    expect(deriveVoteRelation([link({ position: "DEFAVORABLE" })], PUB)).toBe(
      "DEFAVORABLE_SAME_OBJECT"
    );
  });

  it("abstention sur le même objet", () => {
    expect(deriveVoteRelation([link({ position: "ABSTENTION" })], PUB)).toBe(
      "ABSTENTION_SAME_OBJECT"
    );
  });

  it("absence sur le même objet", () => {
    expect(deriveVoteRelation([link({ position: "ABSENCE" })], PUB)).toBe("ABSENCE_SAME_OBJECT");
  });

  it("plusieurs SAME_OBJECT de positions distinctes donnent DIFFERENT_POSITIONS", () => {
    expect(
      deriveVoteRelation([link({ position: "FAVORABLE" }), link({ position: "DEFAVORABLE" })], PUB)
    ).toBe("DIFFERENT_POSITIONS");
  });

  it("plusieurs SAME_OBJECT de MEME position ne sont pas des positions différentes", () => {
    expect(
      deriveVoteRelation(
        [
          link({ position: "FAVORABLE" }),
          link({ position: "FAVORABLE" }),
          link({ position: "FAVORABLE" }),
        ],
        PUB
      )
    ).toBe("FAVORABLE_SAME_OBJECT");
  });

  it("uniquement des liens BROADER_TEXT donnent BROADER_TEXT", () => {
    expect(deriveVoteRelation([link({ linkKind: "BROADER_TEXT", position: null })], PUB)).toBe(
      "BROADER_TEXT"
    );
  });

  it("des liens existent mais aucun sur la révision publiée : NOT_RECHECKED_SINCE_REFORMULATION", () => {
    expect(
      deriveVoteRelation([link({ applicableRevisionId: OLD, position: "FAVORABLE" })], PUB)
    ).toBe("NOT_RECHECKED_SINCE_REFORMULATION");
  });

  it("aucun lien : SEARCH_NOT_DONE", () => {
    expect(deriveVoteRelation([], PUB)).toBe("SEARCH_NOT_DONE");
  });
});

describe("deriveVoteRelation : priorité et bornes", () => {
  it("SAME_OBJECT prime sur BROADER_TEXT sur la même révision", () => {
    expect(
      deriveVoteRelation(
        [link({ position: "FAVORABLE" }), link({ linkKind: "BROADER_TEXT", position: null })],
        PUB
      )
    ).toBe("FAVORABLE_SAME_OBJECT");
  });

  it("un SAME_OBJECT sur révision supersédée est ignoré au profit du SAME_OBJECT publié", () => {
    expect(
      deriveVoteRelation(
        [
          link({ applicableRevisionId: OLD, position: "DEFAVORABLE" }),
          link({ position: "FAVORABLE" }),
        ],
        PUB
      )
    ).toBe("FAVORABLE_SAME_OBJECT");
  });

  it("ni abstention ni absence ne produisent défavorable", () => {
    expect(deriveVoteRelation([link({ position: "ABSTENTION" })], PUB)).not.toBe(
      "DEFAVORABLE_SAME_OBJECT"
    );
    expect(deriveVoteRelation([link({ position: "ABSENCE" })], PUB)).not.toBe(
      "DEFAVORABLE_SAME_OBJECT"
    );
  });

  it("un mélange BROADER_TEXT et NO_VOTE_IDENTIFIED sans SAME_OBJECT donne BROADER_TEXT", () => {
    expect(
      deriveVoteRelation(
        [
          link({ linkKind: "BROADER_TEXT", position: null }),
          link({ linkKind: "NO_VOTE_IDENTIFIED", position: null }),
        ],
        PUB
      )
    ).toBe("BROADER_TEXT");
  });
});

describe("deriveVoteRelation : indépendante de l'ordre", () => {
  it("les mêmes liens dans trois ordres donnent le même état", () => {
    const a = link({ position: "FAVORABLE" });
    const b = link({ linkKind: "BROADER_TEXT", position: null });
    const c = link({ applicableRevisionId: OLD, position: "DEFAVORABLE" });

    const orders = [
      [a, b, c],
      [c, b, a],
      [b, a, c],
    ];
    const results = orders.map((o) => deriveVoteRelation(o, PUB));

    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("FAVORABLE_SAME_OBJECT");
  });

  it("positions contradictoires : même résultat quel que soit l'ordre", () => {
    const fav = link({ position: "FAVORABLE" });
    const def = link({ position: "DEFAVORABLE" });
    expect(deriveVoteRelation([fav, def], PUB)).toBe("DIFFERENT_POSITIONS");
    expect(deriveVoteRelation([def, fav], PUB)).toBe("DIFFERENT_POSITIONS");
  });
});
