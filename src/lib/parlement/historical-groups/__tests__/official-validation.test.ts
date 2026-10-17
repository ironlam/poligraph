import { describe, expect, it } from "vitest";
import { parseActeur, parseOrgane } from "../parse-amo30";
import { parseScrutin } from "../parse-scrutin";
import {
  addScrutinParse,
  amo30InvariantViolations,
  blockingViolations,
  classifyVote,
  createScrutinsAccumulator,
  finalizeScrutins,
  scrutinsInvariantViolations,
  summarizeAmo30,
  VOTE_CATEGORIES,
  type Reference,
} from "../official-validation";
import {
  acteurFile,
  groupMandate,
  organeFile,
  scrutinFile,
  seatMandate,
  type GroupSpec,
  type Json,
} from "../__fixtures__/official-files";

const DAY = "2023-03-14";

function model(organs: Json[], actors: Json[]) {
  return summarizeAmo30(organs.map(parseOrgane), actors.map(parseActeur));
}

const organs = [
  organeFile("PO1", { abbreviation: "AAA", label: "Groupe A" }),
  organeFile("PO2", { abbreviation: "BBB", label: "Groupe B" }),
  organeFile("PO3", { abbreviation: "AAA", label: "Groupe A, nouvelle référence" }),
  organeFile("PONI", { abbreviation: "NI", label: "Non inscrit" }),
];

function classify(reference: Reference, organRef: string, actor = "PA1", seat = "PS1", date = DAY) {
  const parsed = parseScrutin(
    scrutinFile("VTANR5L16V1", [{ organ: organRef, pour: [{ actor, mandate: seat }] }], { date })
  );
  if (parsed.status !== "AN") throw new Error("fixture");
  const [attestation] = parsed.scrutin.attestations;
  if (!attestation) throw new Error("fixture");
  return classifyVote(attestation, reference);
}

const actor = (mandates: Json[]) => acteurFile("PA1", [seatMandate("PS1", "PA1"), ...mandates]);

describe("classifyVote: the exclusive categories", () => {
  it("agrees on a single record", () => {
    const { reference } = model(organs, [actor([groupMandate("PM1", "PA1", "PO1")])]);
    expect(classify(reference, "PO1").category).toBe("AGREE_SINGLE_RECORD");
  });

  it("agrees across several records of the same organ, which are qualities and not two groups", () => {
    const { reference } = model(organs, [
      actor([
        groupMandate("PM1", "PA1", "PO1", { quality: "Membre" }),
        groupMandate("PM2", "PA1", "PO1", { quality: "Président" }),
      ]),
    ]);
    expect(classify(reference, "PO1").category).toBe("AGREE_SAME_ORGAN_RECORDS");
  });

  it("separates a change of reference with the same abbreviation from a different group", () => {
    const { reference } = model(organs, [actor([groupMandate("PM1", "PA1", "PO3")])]);
    expect(classify(reference, "PO1").category).toBe("SAME_SIGLE_OTHER_REF");
    expect(classify(reference, "PO2").category).toBe("DIFFERENT_GROUP");
  });

  it("does not call two organs with no abbreviation the same sigle", () => {
    const unnamed = [
      organeFile("PO1", { abbreviation: null }),
      organeFile("PO2", { abbreviation: null }),
    ];
    const { reference } = model(unnamed, [actor([groupMandate("PM1", "PA1", "PO2")])]);
    expect(classify(reference, "PO1").category).toBe("DIFFERENT_GROUP");
  });

  it("never matches on the abbreviation alone: the same abbreviation with no record is not agreement", () => {
    const { reference } = model(organs, [actor([])]);
    expect(classify(reference, "PO1").category).toBe("NO_GROUP_RECORD");
  });

  it("puts a published organ missing from the referential first, and tells PO0 from another absence", () => {
    const { reference } = model(organs, [actor([groupMandate("PM1", "PA1", "PO1")])]);
    expect(classify(reference, "PO0")).toMatchObject({
      category: "ORGAN_ABSENT",
      placeholder: true,
    });
    expect(classify(reference, "PO999")).toMatchObject({
      category: "ORGAN_ABSENT",
      placeholder: false,
    });
  });

  it("finds no group record when the date falls outside every record", () => {
    const { reference } = model(organs, [
      actor([groupMandate("PM1", "PA1", "PO1", { start: "2023-04-01" })]),
    ]);
    expect(classify(reference, "PO1").category).toBe("NO_GROUP_RECORD");
  });

  it("does not read the records of another legislature", () => {
    const { reference } = model(organs, [
      actor([groupMandate("PM1", "PA1", "PO1", { legislature: "15" })]),
    ]);
    expect(classify(reference, "PO1").category).toBe("NO_GROUP_RECORD");
  });

  it("reports two distinct organs valid the same day before any agreement", () => {
    const { reference } = model(organs, [
      actor([groupMandate("PM1", "PA1", "PO1"), groupMandate("PM2", "PA1", "PO2")]),
    ]);
    expect(classify(reference, "PO1").category).toBe("MULTIPLE_DISTINCT_ORGANS");
  });

  it("ignores a record with no start date, because it cannot say when it applies", () => {
    const { reference } = model(organs, [
      actor([groupMandate("PM1", "PA1", "PO1", { start: null })]),
    ]);
    expect(classify(reference, "PO1").category).toBe("NO_GROUP_RECORD");
  });

  it("treats an open end as valid from the start with no limit", () => {
    const { reference } = model(organs, [
      actor([groupMandate("PM1", "PA1", "PO1", { end: null })]),
    ]);
    expect(classify(reference, "PO1", "PA1", "PS1", "2099-01-01").category).toBe(
      "AGREE_SINGLE_RECORD"
    );
  });

  it("keeps a non-registered voter against a group record as a disagreement, never an agreement", () => {
    const { reference } = model(organs, [actor([groupMandate("PM1", "PA1", "PO1")])]);
    expect(classify(reference, "PONI").category).toBe("DIFFERENT_GROUP");
  });
});

describe("classifyVote: edge days", () => {
  const one = (overrides: Parameters<typeof groupMandate>[3]) =>
    model(organs, [actor([groupMandate("PM1", "PA1", "PO1", overrides)])]).reference;

  it("marks the first day, the last day, and not the day after the first", () => {
    const reference = one({ start: DAY, end: "2023-06-01" });
    expect(classify(reference, "PO1").edgeDay).toBe(true);
    expect(classify(reference, "PO1", "PA1", "PS1", "2023-06-01").edgeDay).toBe(true);
    expect(classify(reference, "PO1", "PA1", "PS1", "2023-03-15").edgeDay).toBe(false);
  });

  it("marks the day even when the record does not cover it", () => {
    const reference = one({ start: "2023-03-15" });
    expect(classify(reference, "PO1", "PA1", "PS1", "2023-03-15").edgeDay).toBe(true);
    expect(classify(reference, "PO1").edgeDay).toBe(false);
  });

  it("only looks at records of the legislature of the scrutin", () => {
    const reference = one({ start: DAY, legislature: "15" });
    expect(classify(reference, "PO1").edgeDay).toBe(false);
  });
});

describe("classifyVote: the link to the seat mandate", () => {
  const seats = (end: string | null, other = false) =>
    model(organs, [
      acteurFile("PA1", [seatMandate("PS1", "PA1", { end }), groupMandate("PM1", "PA1", "PO1")]),
      ...(other ? [acteurFile("PA2", [seatMandate("PS2", "PA2")])] : []),
    ]).reference;

  it("is covered inside the interval", () => {
    expect(classify(seats(null), "PO1").seat).toBe("COVERED");
    expect(classify(seats("2023-12-31"), "PO1").seat).toBe("COVERED");
  });

  it("separates the end day, covered by the closed reading and not by the exclusive one", () => {
    expect(classify(seats(DAY), "PO1").seat).toBe("COVERED_ON_END_DAY_ONLY");
  });

  it("reports a date outside the interval, an unknown mandate, a missing reference and another actor's mandate", () => {
    expect(classify(seats("2023-03-13"), "PO1").seat).toBe("DATE_OUTSIDE");
    expect(classify(seats(null), "PO1", "PA1", "PS-unknown").seat).toBe("MANDATE_UNKNOWN");
    expect(classify(seats(null, true), "PO1", "PA1", "PS2").seat).toBe("OTHER_ACTOR");
    const parsed = parseScrutin(
      scrutinFile("VTANR5L16V1", [{ organ: "PO1", pour: [{ actor: "PA1", mandate: null }] }])
    );
    if (parsed.status !== "AN") throw new Error("fixture");
    expect(classifyVote(parsed.scrutin.attestations[0]!, seats(null)).seat).toBe("REF_MISSING");
  });
});

describe("the accumulator: every file in one bucket, every vote in one category", () => {
  const { reference } = model(organs, [
    acteurFile("PA1", [seatMandate("PS1", "PA1"), groupMandate("PM1", "PA1", "PO1")]),
    acteurFile("PA2", [seatMandate("PS2", "PA2"), groupMandate("PM2", "PA2", "PO2")]),
  ]);

  const files: unknown[] = [
    scrutinFile("VTANR5L16V1", [
      { organ: "PO1", pour: [{ actor: "PA1", mandate: "PS1" }] },
      { organ: "PO2", contre: [{ actor: "PA2", mandate: "PS2" }] },
    ]),
    scrutinFile("VTANR5L16V2", [{ organ: "PO2", pour: [{ actor: "PA1", mandate: "PS1" }] }]),
    scrutinFile("VTANR5L16V3", [{ organ: "PO0", pour: [{ actor: "PA1", mandate: "PS1" }] }], {
      synthese: { pour: 9, contre: 0, abstention: 0, nonVotant: 0 },
    }),
    scrutinFile("VTCGR5L16V1", [{ organ: "PO1", pour: [{ actor: "PA1" }] }], { singular: true }),
    scrutinFile("VTANR5L16V4", [{ organ: "PO1", pour: [{ actor: "PA1" }, { actor: "PA1" }] }]),
    { scrutin: { uid: "VTSEN5L16V1" } },
    null,
  ];

  function run() {
    const acc = createScrutinsAccumulator();
    for (const file of files) addScrutinParse(acc, parseScrutin(file), reference);
    return { acc, aggregate: finalizeScrutins(acc) };
  }

  it("counts each file once, with the Congrès and the rejections apart", () => {
    const { aggregate } = run();
    expect(aggregate.files).toEqual({
      total: 7,
      anScrutins: 3,
      congres: 1,
      rejected: 3,
      rejectedByReason: { DUPLICATE_ACTOR_IN_SCRUTIN: 1, ROOT_MISSING: 1, UNKNOWN_SCRUTIN_KIND: 1 },
    });
    expect(aggregate.congres.map((c) => c.uid)).toEqual(["VTCGR5L16V1"]);
  });

  it("keeps the Congrès out of every AN figure", () => {
    const { aggregate } = run();
    expect(aggregate.byLegislature["16"]?.anScrutins).toBe(3);
    expect(aggregate.byLegislature["16"]?.nominalVotes).toBe(4);
  });

  it("sums the categories to the nominal votes, and the invariants hold", () => {
    const { aggregate } = run();
    const l = aggregate.byLegislature["16"]!;
    expect(Object.values(l.categories).reduce((a, b) => a + b, 0)).toBe(l.nominalVotes);
    expect(l.categories).toMatchObject({
      AGREE_SINGLE_RECORD: 2,
      DIFFERENT_GROUP: 1,
      ORGAN_ABSENT: 1,
    });
    expect(l.organAbsentPlaceholder).toBe(1);
    expect(scrutinsInvariantViolations(aggregate)).toEqual([]);
  });

  it("separates conservation from admissibility: the mismatched scrutin keeps its vote but is not admissible", () => {
    const l = run().aggregate.byLegislature["16"]!;
    expect(l.coherence).toEqual({ COHERENT: 2, COUNT_MISMATCH: 1, UNVERIFIABLE: 0 });
    expect(l.votesInPublicationAdmissibleScrutins).toBe(3);
    expect(l.votesInScrutinsKeptButNotAdmissible).toBe(1);
    expect(l.nominalVotes).toBe(4);
  });

  it("detects a lost vote: the invariants fail when a count no longer adds up", () => {
    const { aggregate } = run();
    const tampered = structuredClone(aggregate);
    tampered.byLegislature["16"]!.categories.AGREE_SINGLE_RECORD -= 1;
    expect(scrutinsInvariantViolations(tampered)).toContain("L16: categories != nominal votes");
    const lostFile = structuredClone(aggregate);
    lostFile.files.total += 1;
    expect(scrutinsInvariantViolations(lostFile)).toContain(
      "files: AN + Congrès + rejected != total"
    );
  });

  it("reports distinct actors per legislature without double counting", () => {
    expect(run().aggregate.byLegislature["16"]?.distinctActors).toBe(2);
  });

  it("keeps a few identifiers of the anomalies in examples, apart from the aggregate", () => {
    const { acc, aggregate } = run();
    expect(acc.examples.get("category:DIFFERENT_GROUP")).toEqual(["VTANR5L16V2"]);
    expect(JSON.stringify(aggregate)).not.toContain("VTANR5L16V2");
  });

  it("produces every category key, in a fixed order, even at zero", () => {
    expect(Object.keys(run().aggregate.byLegislature["16"]!.categories)).toEqual([
      ...VOTE_CATEGORIES,
    ]);
  });
});

describe("summarizeAmo30: counts and blocking checks", () => {
  const withAll = model(
    [...organs, organeFile("PO9", { codeType: "COMPER" }), { organe: { uid: "PO8" } }],
    [
      acteurFile("PA1", [
        seatMandate("PS1", "PA1"),
        groupMandate("PM1", "PA1", "PO1", { quality: "Membre" }),
        groupMandate("PM2", "PA1", "PONI", {
          quality: "Député non-inscrit",
          start: "2022-06-22",
          end: "2022-06-28",
        }),
      ]),
      acteurFile("PA2", [groupMandate("PM3", "PA2", "PO-unknown")]),
      { acteur: {} },
    ]
  );

  it("gives every organ file, actor file and mandate one outcome", () => {
    expect(withAll.aggregate.organFiles).toMatchObject({
      total: 6,
      groupOrgans: 4,
      outOfScope: 1,
      rejected: 1,
    });
    expect(withAll.aggregate.actorFiles).toMatchObject({ total: 3, accepted: 2, rejected: 1 });
    expect(withAll.aggregate.mandates).toMatchObject({ total: 4, group: 3, seat: 1, rejected: 0 });
    expect(amo30InvariantViolations(withAll.aggregate)).toEqual([]);
  });

  it("classifies the non-registered organ by two signals and leaves a lone name unconfirmed", () => {
    expect(withAll.aggregate.organKinds).toEqual({
      GROUP: 3,
      NON_INSCRIT: 1,
      unclassified: {},
    });
    const lone = model([organeFile("PONI", { abbreviation: "NI", label: "Non inscrit" })], []);
    expect(lone.aggregate.organKinds.unclassified).toEqual({ NI_SIGNAL_UNCONFIRMED: 1 });
  });

  it("flags a group mandate whose organ is not in the referential", () => {
    expect(withAll.aggregate.structure.membershipsWithAbsentOrgan).toBe(1);
    expect(blockingViolations(withAll.aggregate, []).blocking.membershipsWithAbsentOrgan).toBe(1);
  });

  it("counts memberships with no end apart, as open at the snapshot", () => {
    expect(withAll.aggregate.membershipsWithoutEnd).toBe(2);
  });

  it("counts duplicate keys instead of silently overwriting", () => {
    const dup = model(
      [organeFile("PO1"), organeFile("PO1")],
      [acteurFile("PA1", [groupMandate("PM1", "PA1", "PO1"), groupMandate("PM1", "PA1", "PO1")])]
    );
    expect(dup.aggregate.structure.duplicateKeys).toEqual({ organs: 1, memberships: 1, seats: 0 });
    expect(blockingViolations(dup.aggregate, []).blocking.duplicateKeys).toBe(2);
  });

  it("counts a start after an end as a rejection that blocks the import", () => {
    const bad = model(
      [organeFile("PO1")],
      [
        acteurFile("PA1", [
          groupMandate("PM1", "PA1", "PO1", { start: "2023-02-01", end: "2023-01-01" }),
        ]),
      ]
    );
    expect(bad.aggregate.mandates.rejectedByReason).toEqual({ START_AFTER_END: 1 });
    expect(blockingViolations(bad.aggregate, []).blocking.startAfterEnd).toBe(1);
  });

  it("measures overlaps: identical dates, different dates, distinct organs, and across legislatures", () => {
    const m = model(organs, [
      acteurFile("PA1", [
        groupMandate("PM1", "PA1", "PO1", { start: "2023-01-01", end: "2023-06-01" }),
        groupMandate("PM2", "PA1", "PO1", { start: "2023-01-01", end: "2023-06-01" }),
        groupMandate("PM3", "PA1", "PO1", { start: "2023-05-01", end: "2023-09-01" }),
        groupMandate("PM4", "PA1", "PO2", { start: "2023-06-01", end: "2023-12-01" }),
        groupMandate("PM5", "PA1", "PO2", { start: "2023-06-01", legislature: "17" }),
      ]),
    ]);
    expect(m.aggregate.structure.overlapSameOrgan["16"]).toEqual({
      identicalDates: 1,
      differentDates: 2,
    });
    expect(m.aggregate.structure.overlapDistinctOrgans["16"]).toBe(3);
    expect(m.aggregate.structure.overlapAcrossLegislatures).toBe(4);
  });

  it("makes an overlap blocking only for the legislatures the scrutin archives cover", () => {
    const old = model(organs, [
      acteurFile("PA1", [
        groupMandate("PM1", "PA1", "PO1", {
          legislature: "13",
          start: "2010-01-01",
          end: "2010-06-01",
        }),
        groupMandate("PM2", "PA1", "PO2", { legislature: "13", start: "2010-06-01" }),
      ]),
    ]);
    expect(old.aggregate.structure.overlapDistinctOrgans).toEqual({ "13": 1 });
    expect(blockingViolations(old.aggregate, []).blocking.overlapDistinctOrgans).toBe(1);
    const covered16 = {
      files: { total: 0, anScrutins: 0, congres: 0, rejected: 0, rejectedByReason: {} },
      byLegislature: {
        "16": { seat: { MANDATE_UNKNOWN: 0, REF_MISSING: 0, OTHER_ACTOR: 0, DATE_OUTSIDE: 0 } },
      },
      congres: [],
    } as never;
    const scoped = blockingViolations(old.aggregate, [covered16]);
    expect(scoped.blocking.overlapDistinctOrgans).toBe(0);
    expect(scoped.informative.overlapDistinctOrgansOutsideScrutinLegislatures).toBe(1);
  });

  it("counts the vote-to-seat blocking checks from the scrutin aggregate", () => {
    const { reference } = model(organs, [
      acteurFile("PA1", [seatMandate("PS1", "PA1", { end: "2023-03-01" })]),
    ]);
    const acc = createScrutinsAccumulator();
    addScrutinParse(
      acc,
      parseScrutin(
        scrutinFile("VTANR5L16V1", [
          { organ: "PO1", pour: [{ actor: "PA1", mandate: "PS1" }] },
          { organ: "PO2", pour: [{ actor: "PA2", mandate: "PS-x" }] },
        ])
      ),
      reference
    );
    const { blocking } = blockingViolations(model(organs, []).aggregate, [finalizeScrutins(acc)]);
    expect(blocking).toMatchObject({
      voteSeatMandateNotCoveringDate: 1,
      voteSeatMandateNotFoundOrMissing: 1,
      voteSeatMandateOfAnotherActor: 0,
    });
  });
});

describe("the classification is independent of the resolver", () => {
  it("gives the same category whatever the groups are named, because it never reads a current group", () => {
    const a = model(organs, [actor([groupMandate("PM1", "PA1", "PO1")])]).reference;
    const specs: GroupSpec[] = [{ organ: "PO1", pour: [{ actor: "PA1", mandate: "PS1" }] }];
    const parsed = parseScrutin(scrutinFile("VTANR5L16V1", specs));
    if (parsed.status !== "AN") throw new Error("fixture");
    expect(classifyVote(parsed.scrutin.attestations[0]!, a).category).toBe("AGREE_SINGLE_RECORD");
  });
});
