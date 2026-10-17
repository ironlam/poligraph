import { describe, expect, it } from "vitest";
import { parseScrutin, type ParsedAnScrutin, type ScrutinParse } from "../parse-scrutin";
import {
  groupBlock,
  groupNodes,
  scrutinFile,
  type GroupNode,
  type GroupSpec,
} from "../__fixtures__/official-files";

const an = (parse: ScrutinParse): ParsedAnScrutin => {
  if (parse.status !== "AN") throw new Error(`expected AN, got ${parse.status}`);
  return parse.scrutin;
};

const twoGroups: GroupSpec[] = [
  { organ: "PO1", pour: [{ actor: "PA1" }, { actor: "PA2" }], contre: [{ actor: "PA3" }] },
  { organ: "PO2", abstention: [{ actor: "PA4" }], nonVotant: [{ actor: "PA5" }] },
];

describe("parseScrutin: an AN scrutin", () => {
  it("keeps every listed voter as an attestation with the group it was listed under", () => {
    const s = an(parseScrutin(scrutinFile("VTANR5L16V10", twoGroups)));
    expect(s.attestations.map((a) => [a.officialId, a.publishedOrganRef, a.position])).toEqual([
      ["PA1", "PO1", "pour"],
      ["PA2", "PO1", "pour"],
      ["PA3", "PO1", "contre"],
      ["PA4", "PO2", "abstention"],
      ["PA5", "PO2", "nonVotant"],
    ]);
    expect(s.date).toBe("2023-03-14");
    expect(s.legislature).toBe(16);
    expect(s.rawConserved).toBe(true);
  });

  it("reads a single voter written as an object the same way as a list of one", () => {
    const asObject: GroupSpec[] = [
      { organ: "PO1", pour: [{ actor: "PA1" }], singleVotantAsObject: true },
    ];
    const asList: GroupSpec[] = [{ organ: "PO1", pour: [{ actor: "PA1" }] }];
    const a = an(parseScrutin(scrutinFile("VTANR5L16V1", asObject)));
    const b = an(parseScrutin(scrutinFile("VTANR5L16V1", asList)));
    expect(a.attestations).toEqual(b.attestations);
  });

  it("reads a single group written as an object and several as a list", () => {
    const one = an(parseScrutin(scrutinFile("VTANR5L16V1", [twoGroups[0] as GroupSpec])));
    const many = an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups)));
    expect([one.groups.length, many.groups.length]).toEqual([1, 2]);
  });

  it("accepts a group whose four position blocks are all null", () => {
    const s = an(parseScrutin(scrutinFile("VTANR5L16V1", [{ organ: "PO1" }, ...twoGroups])));
    expect(s.groups[0]?.nominal).toEqual({ pour: 0, contre: 0, abstention: 0, nonVotant: 0 });
    expect(s.attestations).toHaveLength(5);
  });

  it("keeps the published organ as is, including the PO0 placeholder", () => {
    const s = an(
      parseScrutin(scrutinFile("VTANR5L17V1", [{ organ: "PO0", pour: [{ actor: "PA1" }] }]))
    );
    expect(s.attestations[0]?.publishedOrganRef).toBe("PO0");
  });

  it("keeps the seat mandate reference, or null when the source gives none", () => {
    const s = an(
      parseScrutin(
        scrutinFile("VTANR5L16V1", [
          {
            organ: "PO1",
            pour: [
              { actor: "PA1", mandate: "PM9" },
              { actor: "PA2", mandate: null },
            ],
          },
        ])
      )
    );
    expect(s.attestations.map((a) => a.seatMandateRef)).toEqual(["PM9", null]);
  });
});

describe("parseScrutin: count coherence, kept apart from conservation", () => {
  it("is coherent when the lists agree with the group counts and the summary", () => {
    const s = an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups)));
    expect(s).toMatchObject({
      countCoherence: "COHERENT",
      publicationAdmissible: true,
      mismatchedGroups: 0,
    });
  });

  it("flags a group whose list differs from its official count and keeps all its attestations", () => {
    const groups: GroupSpec[] = [
      {
        organ: "PO1",
        pour: [{ actor: "PA1" }, { actor: "PA2" }],
        official: { pour: 3, contre: 0, abstention: 0, nonVotant: 0 },
      },
    ];
    const s = an(parseScrutin(scrutinFile("VTANR5L16V1", groups)));
    expect(s.countCoherence).toBe("COUNT_MISMATCH");
    expect(s.mismatchedGroups).toBe(1);
    expect(s.publicationAdmissible).toBe(false);
    expect(s.attestations).toHaveLength(2);
    expect(s.rawConserved).toBe(true);
  });

  it("flags a summary that differs from the lists even when every group agrees", () => {
    const s = an(
      parseScrutin(
        scrutinFile("VTANR5L16V1", twoGroups, {
          synthese: { pour: 9, contre: 1, abstention: 1, nonVotant: 1 },
        })
      )
    );
    expect(s).toMatchObject({
      countCoherence: "COUNT_MISMATCH",
      syntheseMismatch: true,
      syntheseMismatchPCA: true,
      mismatchedGroups: 0,
    });
  });

  it("tells a difference on the non-voters apart from a difference on pour, contre, abstention", () => {
    const s = an(
      parseScrutin(
        scrutinFile("VTANR5L16V1", twoGroups, {
          synthese: { pour: 2, contre: 1, abstention: 1, nonVotant: 7 },
        })
      )
    );
    expect(s).toMatchObject({
      countCoherence: "COUNT_MISMATCH",
      syntheseMismatch: true,
      syntheseMismatchPCA: false,
    });
  });

  it("cannot verify a scrutin that has no official count, and does not call it coherent", () => {
    const noGroupCount = an(
      parseScrutin(
        scrutinFile("VTANR5L16V1", [{ organ: "PO1", pour: [{ actor: "PA1" }], official: null }])
      )
    );
    expect(noGroupCount.countCoherence).toBe("UNVERIFIABLE");
    expect(noGroupCount.publicationAdmissible).toBe(false);
    const noSummary = an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups, { synthese: null })));
    expect(noSummary.countCoherence).toBe("UNVERIFIABLE");
  });

  it("does not lose the attestations of a scrutin whose count is not made of numbers", () => {
    const file = scrutinFile("VTANR5L16V1", twoGroups);
    groupNodes(file)[0]!.vote.decompteVoix.pour = "beaucoup";
    const s = an(parseScrutin(file));
    expect(s.countCoherence).toBe("UNVERIFIABLE");
    expect(s.attestations).toHaveLength(5);
  });

  it("lets a mismatch outrank an unverifiable group", () => {
    const groups: GroupSpec[] = [
      {
        organ: "PO1",
        pour: [{ actor: "PA1" }],
        official: { pour: 5, contre: 0, abstention: 0, nonVotant: 0 },
      },
      { organ: "PO2", pour: [{ actor: "PA2" }], official: null },
    ];
    expect(an(parseScrutin(scrutinFile("VTANR5L16V1", groups))).countCoherence).toBe(
      "COUNT_MISMATCH"
    );
  });
});

describe("parseScrutin: the mise au point is counted, never applied", () => {
  const votant = (actor: string) => ({ votant: { acteurRef: actor, mandatRef: "PM1" } });

  it("reports nothing for an absent or an empty block", () => {
    const empty = {
      pours: null,
      contres: null,
      abstentions: null,
      nonVotants: null,
      nonVotantsVolontaires: null,
    };
    expect(an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups))).miseAuPoint).toEqual({
      present: false,
      listedVotants: 0,
      malformedBlocks: 0,
    });
    expect(
      an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups, { miseAuPoint: empty }))).miseAuPoint
    ).toEqual({
      present: true,
      listedVotants: 0,
      malformedBlocks: 0,
    });
  });

  it("counts voters in blocks that are objects, lists, or lists holding a null", () => {
    const miseAuPoint = {
      pours: votant("PA9"),
      contres: [votant("PA8"), null, votant("PA7")],
      abstentions: null,
      nonVotants: [],
      nonVotantsVolontaires: votant("PA6"),
      dysfonctionnement: "texte",
    };
    expect(
      an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups, { miseAuPoint }))).miseAuPoint
    ).toEqual({
      present: true,
      listedVotants: 4,
      malformedBlocks: 0,
    });
  });

  it("counts a block that is not an object as malformed, without rejecting the scrutin", () => {
    const s = an(
      parseScrutin(scrutinFile("VTANR5L16V1", twoGroups, { miseAuPoint: { pours: "x" } }))
    );
    expect(s.miseAuPoint.malformedBlocks).toBe(1);
    expect(s.attestations).toHaveLength(5);
  });

  it("leaves the attestations as published: a voter in a correction block changes nothing", () => {
    const withCorrection = an(
      parseScrutin(
        scrutinFile("VTANR5L16V1", twoGroups, { miseAuPoint: { contres: votant("PA1") } })
      )
    );
    const without = an(parseScrutin(scrutinFile("VTANR5L16V1", twoGroups)));
    expect(withCorrection.attestations).toEqual(without.attestations);
    expect(withCorrection.countCoherence).toBe(without.countCoherence);
  });
});

describe("parseScrutin: the Congrès is identified, not read as an AN scrutin", () => {
  const congres = (singular: boolean) =>
    scrutinFile(
      "VTCGR5L16V1",
      [
        { organ: "PO1", pour: [{ actor: "PA1" }, { actor: "PA2" }], contre: [{ actor: "PA3" }] },
        { organ: "PO2" },
      ],
      {
        singular,
        date: "2024-03-04",
      }
    );

  it("identifies it, with singular keys, and counts the listed voters without interpreting them", () => {
    expect(parseScrutin(congres(true))).toEqual({
      status: "CONGRES",
      congres: {
        uid: "VTCGR5L16V1",
        date: "2024-03-04",
        legislature: 16,
        groupCount: 2,
        listedVotants: 3,
      },
    });
  });

  it("produces no attestation and no AN figure whatever the key spelling", () => {
    for (const singular of [true, false]) {
      const parsed = parseScrutin(congres(singular));
      expect(parsed.status).toBe("CONGRES");
      expect("scrutin" in parsed).toBe(false);
    }
  });

  it("does not choke on a Congrès with no readable breakdown", () => {
    const parsed = parseScrutin({ scrutin: { uid: "VTCGR5L16V2", dateScrutin: "not a date" } });
    expect(parsed).toEqual({
      status: "CONGRES",
      congres: {
        uid: "VTCGR5L16V2",
        date: null,
        legislature: null,
        groupCount: 0,
        listedVotants: null,
      },
    });
  });
});

describe("parseScrutin: rejections are typed, and the record is still named", () => {
  const reason = (raw: unknown) => {
    const parsed = parseScrutin(raw);
    if (parsed.status !== "REJECTED") throw new Error(`expected rejection, got ${parsed.status}`);
    return parsed.reason;
  };

  it.each([
    ["no root", {}, "ROOT_MISSING"],
    ["no uid", { scrutin: {} }, "UID_MISSING"],
    ["unknown kind of scrutin", scrutinFile("VTSEN5L16V1", twoGroups), "UNKNOWN_SCRUTIN_KIND"],
    [
      "an impossible date",
      scrutinFile("VTANR5L16V1", twoGroups, { date: "2023-02-30" }),
      "DATE_INVALID",
    ],
    ["no date", scrutinFile("VTANR5L16V1", twoGroups, { date: null }), "DATE_INVALID"],
    [
      "no legislature",
      scrutinFile("VTANR5L16V1", twoGroups, { legislature: null }),
      "LEGISLATURE_MALFORMED",
    ],
    [
      "a legislature that is not a number",
      scrutinFile("VTANR5L16V1", twoGroups, { legislature: "xvi" }),
      "LEGISLATURE_MALFORMED",
    ],
    [
      "a publication mode without names",
      scrutinFile("VTANR5L16V1", twoGroups, { mode: "DecompteDissident" }),
      "UNSUPPORTED_PUBLICATION_MODE",
    ],
    [
      "no group breakdown",
      {
        scrutin: {
          uid: "VTANR5L16V1",
          dateScrutin: "2023-03-14",
          legislature: "16",
          modePublicationDesVotes: "DecompteNominatif",
        },
      },
      "NO_GROUP_BREAKDOWN",
    ],
    [
      "a group that is not an object",
      scrutinFile("VTANR5L16V1", { organe: "x" } as never),
      "GROUP_MALFORMED",
    ],
  ])("rejects %s", (_label, raw, expected) => {
    expect(reason(raw)).toBe(expected);
  });

  it("rejects an AN scrutin that spells its positions in the singular", () => {
    expect(reason(scrutinFile("VTANR5L16V1", twoGroups, { singular: true }))).toBe(
      "SINGULAR_KEYS_IN_AN_SCRUTIN"
    );
  });

  it("rejects a group with no organ reference", () => {
    const file = scrutinFile("VTANR5L16V1", twoGroups);
    delete groupNodes(file)[0]!.organeRef;
    expect(reason(file)).toBe("ORGAN_REF_MISSING");
  });

  it("rejects a position block that is neither null nor an object", () => {
    const file = scrutinFile("VTANR5L16V1", twoGroups);
    groupNodes(file)[0]!.vote.decompteNominatif!.pours = "x";
    expect(reason(file)).toBe("POSITION_BLOCK_MALFORMED");
  });

  it("rejects a group with no nominal block", () => {
    const file = scrutinFile("VTANR5L16V1", twoGroups);
    groupNodes(file)[0]!.vote.decompteNominatif = null;
    expect(reason(file)).toBe("POSITION_BLOCK_MALFORMED");
  });

  it.each([
    ["a null among the voters", [null]],
    ["a voter with no actor", [{ mandatRef: "PM1" }]],
    ["a voter whose actor is not a string", [{ acteurRef: 12, mandatRef: "PM1" }]],
    ["a voter whose mandate is not a string", [{ acteurRef: "PA1", mandatRef: 5 }]],
  ])("rejects %s", (_label, votants) => {
    const file = scrutinFile("VTANR5L16V1", twoGroups);
    groupNodes(file)[0]!.vote.decompteNominatif!.pours = { votant: votants };
    expect(reason(file)).toBe("VOTANT_MALFORMED");
  });

  it("rejects a scrutin that lists the same actor twice, in two groups or in two positions", () => {
    const twice: GroupSpec[] = [
      { organ: "PO1", pour: [{ actor: "PA1" }] },
      { organ: "PO2", contre: [{ actor: "PA1" }] },
    ];
    expect(reason(scrutinFile("VTANR5L16V1", twice))).toBe("DUPLICATE_ACTOR_IN_SCRUTIN");
    const samePosition: GroupSpec[] = [
      { organ: "PO1", pour: [{ actor: "PA1" }, { actor: "PA1" }] },
    ];
    expect(reason(scrutinFile("VTANR5L16V1", samePosition))).toBe("DUPLICATE_ACTOR_IN_SCRUTIN");
  });

  it("names the rejected record", () => {
    expect(parseScrutin(scrutinFile("VTANR5L16V7", twoGroups, { date: "x" }))).toEqual({
      status: "REJECTED",
      reason: "DATE_INVALID",
      sourceRecordId: "VTANR5L16V7",
    });
  });
});

describe("parseScrutin: official counts spelled both ways", () => {
  it("reads `pour` and `contre` in the singular and `abstentions` and `nonVotants` in the plural, as published", () => {
    const block = groupBlock({ organ: "PO1", pour: [{ actor: "PA1" }] }) as unknown as GroupNode;
    expect(Object.keys(block.vote.decompteVoix).sort()).toEqual([
      "abstentions",
      "contre",
      "nonVotants",
      "nonVotantsVolontaires",
      "pour",
    ]);
    const s = an(
      parseScrutin(scrutinFile("VTANR5L16V1", [{ organ: "PO1", pour: [{ actor: "PA1" }] }]))
    );
    expect(s.groups[0]?.official).toEqual({ pour: 1, contre: 0, abstention: 0, nonVotant: 0 });
  });

  it("reads the plural spelling of pour and contre too, and a zero is a real count", () => {
    const file = scrutinFile("VTANR5L16V1", [{ organ: "PO1", pour: [{ actor: "PA1" }] }]);
    const dv = groupNodes(file)[0]!.vote.decompteVoix;
    dv.pours = "1";
    delete dv.pour;
    dv.contres = "0";
    delete dv.contre;
    const s = an(parseScrutin(file));
    expect(s.groups[0]?.official).toEqual({ pour: 1, contre: 0, abstention: 0, nonVotant: 0 });
    expect(s.countCoherence).toBe("COHERENT");
  });
});
