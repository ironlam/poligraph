// @vitest-environment node
import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import {
  acteurFile,
  groupMandate,
  organeFile,
  scrutinFile,
  seatMandate,
  type GroupSpec,
} from "@/lib/parlement/historical-groups/__fixtures__/official-files";
import { openArchiveBytes, ArchiveIntegrityError } from "../historical-groups-archive";
import {
  analyzeArchives,
  compareToBaseline,
  differences,
  failures,
  isAmo30Archive,
} from "../historical-groups-validation";
import { parseArgs } from "../../validate-historical-groups";

function archive(files: Record<string, unknown>) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(typeof content === "string" ? content : JSON.stringify(content)));
  }
  return openArchiveBytes(zip.toBuffer());
}

const amoFiles = (extra: Record<string, unknown> = {}) => ({
  "json/organe/PO1.json": organeFile("PO1", { abbreviation: "AAA" }),
  "json/organe/PO2.json": organeFile("PO2", { abbreviation: "BBB" }),
  "json/organe/PO9.json": organeFile("PO9", { codeType: "COMPER" }),
  "json/acteur/PA1.json": acteurFile("PA1", [
    seatMandate("PS1", "PA1"),
    groupMandate("PM1", "PA1", "PO1"),
  ]),
  "json/acteur/PA2.json": acteurFile("PA2", [
    seatMandate("PS2", "PA2"),
    groupMandate("PM2", "PA2", "PO2"),
  ]),
  "json/deport/D1.json": { deport: {} },
  ...extra,
});

const groups: GroupSpec[] = [
  { organ: "PO1", pour: [{ actor: "PA1", mandate: "PS1" }] },
  { organ: "PO2", contre: [{ actor: "PA2", mandate: "PS2" }] },
];

const scrutinFiles = (extra: Record<string, unknown> = {}) => ({
  "json/VTANR5L16V1.json": scrutinFile("VTANR5L16V1", groups),
  "json/VTANR5L16V2.json": scrutinFile("VTANR5L16V2", [
    { organ: "PO2", pour: [{ actor: "PA1", mandate: "PS1" }] },
  ]),
  "json/VTCGR5L16V1.json": scrutinFile("VTCGR5L16V1", groups, { singular: true }),
  ...extra,
});

describe("analyzeArchives", () => {
  const analysis = analyzeArchives(archive(amoFiles()), [archive(scrutinFiles())]);

  it("accounts for every file of both archives", () => {
    const { amo30, scrutins } = analysis.baseline;
    expect(amo30.aggregate.organFiles).toMatchObject({
      total: 3,
      groupOrgans: 2,
      outOfScope: 1,
      rejected: 0,
    });
    expect(amo30.aggregate.actorFiles).toMatchObject({ total: 2, accepted: 2 });
    expect(amo30.archive.entriesByFolder).toEqual({
      "json/acteur": 2,
      "json/deport": 1,
      "json/organe": 3,
    });
    expect(scrutins[0]?.aggregate.files).toMatchObject({
      total: 3,
      anScrutins: 2,
      congres: 1,
      rejected: 0,
    });
    expect(analysis.invariantViolations).toEqual([]);
  });

  it("separates the Congrès from the AN figures", () => {
    const aggregate = analysis.baseline.scrutins[0]!.aggregate;
    expect(aggregate.congres).toEqual([
      { uid: "VTCGR5L16V1", date: "2023-03-14", legislature: 16, groupCount: 2, listedVotants: 2 },
    ]);
    expect(aggregate.byLegislature["16"]).toMatchObject({ anScrutins: 2, nominalVotes: 3 });
  });

  it("finds no blocking violation on sound data", () => {
    expect(Object.values(analysis.blocking).every((value) => value === 0)).toBe(true);
    expect(failures(analysis, [])).toEqual([]);
  });

  it("counts a file that is not JSON as a rejection instead of dropping it", () => {
    const withGarbage = analyzeArchives(archive(amoFiles()), [
      archive(scrutinFiles({ "json/broken.json": "{not json" })),
    ]);
    const files = withGarbage.baseline.scrutins[0]!.aggregate.files;
    expect(files).toMatchObject({ total: 4, rejected: 1, rejectedByReason: { ROOT_MISSING: 1 } });
    expect(withGarbage.invariantViolations).toEqual([]);
  });

  it("fails on a broken invariant", () => {
    expect(failures({ ...analysis, invariantViolations: ["files: lost one"] }, [])).toEqual([
      "invariant: files: lost one",
    ]);
  });

  it("fails on a blocking violation of the referential", () => {
    const bad = analyzeArchives(
      archive(
        amoFiles({
          "json/acteur/PA3.json": acteurFile("PA3", [groupMandate("PM3", "PA3", "PO-unknown")]),
          "json/acteur/PA4.json": acteurFile("PA4", [
            groupMandate("PM4", "PA4", "PO1", { start: "2023-02-01", end: "2023-01-01" }),
          ]),
        })
      ),
      [archive(scrutinFiles())]
    );
    expect(bad.blocking).toMatchObject({ membershipsWithAbsentOrgan: 1, startAfterEnd: 1 });
    expect(failures(bad, [])).toEqual([
      "blocking: startAfterEnd = 1",
      "blocking: membershipsWithAbsentOrgan = 1",
    ]);
  });

  it("refuses an archive with a folder it was not written for", () => {
    expect(() =>
      analyzeArchives(archive(amoFiles({ "json/other/x.json": {} })), [archive(scrutinFiles())])
    ).toThrow(ArchiveIntegrityError);
    expect(() =>
      analyzeArchives(archive(amoFiles()), [archive(scrutinFiles({ "json/sub/x.json": {} }))])
    ).toThrow(ArchiveIntegrityError);
  });

  it("recognises an AMO30 archive by its organ folder", () => {
    expect(isAmo30Archive(archive(amoFiles()))).toBe(true);
    expect(isAmo30Archive(archive(scrutinFiles()))).toBe(false);
  });

  it("puts no identifier of a person and no name in the baseline", () => {
    const text = JSON.stringify(analysis.baseline);
    expect(text).not.toMatch(/PA\d|PM\d|PS\d/);
    expect(text).not.toMatch(/VTANR|VTCGR5L16V2/);
    // The only scrutin identifier allowed is the Congrès one: it names a vote, not a person.
    expect(text).toContain("VTCGR5L16V1");
  });

  it("keeps the examples of anomalies apart, with identifiers of scrutins only", () => {
    expect(Object.keys(analysis.examples)).toContainEqual(
      expect.stringMatching(/:category:DIFFERENT_GROUP$/)
    );
    expect(JSON.stringify(analysis.examples)).not.toMatch(/PA\d/);
  });

  it("is deterministic: the same archives give the same baseline, byte for byte", () => {
    const again = analyzeArchives(archive(amoFiles()), [archive(scrutinFiles())]);
    expect(JSON.stringify(again.baseline)).toBe(JSON.stringify(analysis.baseline));
  });
});

describe("comparison with a baseline", () => {
  const amoBytes = () => archive(amoFiles());
  const reference = analyzeArchives(amoBytes(), [archive(scrutinFiles())]).baseline;

  it("is a strict match for the same bytes", () => {
    const current = analyzeArchives(amoBytes(), [archive(scrutinFiles())]);
    const comparison = compareToBaseline(current.baseline, reference);
    expect(comparison.map((c) => c.status)).toEqual(["STRICT_MATCH", "STRICT_MATCH"]);
    expect(failures(current, comparison)).toEqual([]);
  });

  it("fails when identical bytes give other figures: the parser or the baseline is wrong", () => {
    const tampered = structuredClone(reference);
    tampered.scrutins[0]!.aggregate.byLegislature["16"]!.categories.DIFFERENT_GROUP += 1;
    const current = analyzeArchives(amoBytes(), [archive(scrutinFiles())]);
    const comparison = compareToBaseline(current.baseline, tampered);
    expect(comparison[1]).toMatchObject({ status: "STRICT_MISMATCH", differenceCount: 1 });
    expect(comparison[1]?.differences).toEqual([
      { path: "byLegislature.16.categories.DIFFERENT_GROUP", baseline: 2, current: 1 },
    ]);
    expect(failures(current, comparison)).toEqual([
      "baseline: scrutins:L16 differs on identical input (1 figures)",
    ]);
  });

  it("reports a changed scrutin archive without treating the change as an error", () => {
    const changed = scrutinFiles({
      "json/VTANR5L16V3.json": scrutinFile("VTANR5L16V3", [
        { organ: "PO1", pour: [{ actor: "PA1", mandate: "PS1" }] },
      ]),
    });
    const current = analyzeArchives(amoBytes(), [archive(changed)]);
    const comparison = compareToBaseline(current.baseline, reference);
    expect(comparison[1]?.status).toBe("CHANGED_INPUT");
    expect(comparison[1]?.differenceCount).toBeGreaterThan(0);
    expect(comparison[1]?.differences.map((d) => d.path)).toContain(
      "byLegislature.16.nominalVotes"
    );
    expect(failures(current, comparison)).toEqual([]);
  });

  it("reports a changed referential as a changed input, and the scrutins read against it too", () => {
    const changedAmo = archive(
      amoFiles({
        "json/acteur/PA5.json": acteurFile("PA5", [
          seatMandate("PS5", "PA5"),
          groupMandate("PM5", "PA5", "PO1"),
        ]),
      })
    );
    const current = analyzeArchives(changedAmo, [archive(scrutinFiles())]);
    const comparison = compareToBaseline(current.baseline, reference);
    expect(comparison[0]?.status).toBe("CHANGED_INPUT");
    // Same scrutin bytes, but read against another referential: not a strict comparison either.
    expect(comparison[1]?.status).toBe("CHANGED_INPUT");
    expect(failures(current, comparison)).toEqual([]);
  });

  it("treats the same scrutin bytes read against another referential as a changed input", () => {
    const another = archive(
      amoFiles({ "json/organe/PO3.json": organeFile("PO3", { abbreviation: "CCC" }) })
    );
    const current = analyzeArchives(another, [archive(scrutinFiles())]);
    const comparison = compareToBaseline(current.baseline, reference);
    expect(comparison.map((c) => c.status)).toEqual(["CHANGED_INPUT", "CHANGED_INPUT"]);
  });

  it("says when there is no baseline for an archive", () => {
    const other = archive(scrutinFiles());
    const current = analyzeArchives(amoBytes(), [other]);
    const noScrutins = { ...reference, scrutins: [] };
    expect(compareToBaseline(current.baseline, noScrutins)[1]?.status).toBe("NO_BASELINE");
  });
});

describe("differences", () => {
  it("lists every path that differs or exists on one side only, sorted", () => {
    const a = { x: { b: 1, a: 2 }, only: 3, same: 4 };
    const b = { x: { b: 1, a: 5 }, extra: 6, same: 4 };
    expect(differences(a, b)).toEqual([
      { path: "extra", baseline: undefined, current: 6 },
      { path: "only", baseline: 3, current: undefined },
      { path: "x.a", baseline: 2, current: 5 },
    ]);
  });

  it("finds nothing between equal values", () => {
    expect(differences({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toEqual([]);
  });
});

describe("parseArgs", () => {
  it("accepts one AMO30 archive and several scrutin archives", () => {
    const parsed = parseArgs([
      "--amo30",
      "a.zip",
      "--scrutins",
      "s1.zip",
      "--scrutins",
      "s2.zip",
      "--examples",
    ]);
    expect(parsed).toMatchObject({
      amo30: "a.zip",
      scrutins: ["s1.zip", "s2.zip"],
      examples: true,
      emitBaseline: false,
    });
  });

  it.each([
    [[], "--amo30"],
    [["--amo30", "a.zip"], "--scrutins"],
    [["--amo30", "a.zip", "--scrutins"], "needs a path"],
    [["--amo30", "a.zip", "--scrutins", "s.zip", "--download"], "unknown argument"],
  ])("refuses %j with a usage message", (argv, fragment) => {
    const parsed = parseArgs(argv);
    expect(typeof parsed).toBe("string");
    expect(parsed).toContain(fragment);
  });

  it("has no option that fetches or writes: nothing to give a URL or an output path to", () => {
    for (const option of ["--url", "--output", "--out", "--write", "--db"]) {
      expect(typeof parseArgs(["--amo30", "a.zip", "--scrutins", "s.zip", option, "x"])).toBe(
        "string"
      );
    }
  });
});
