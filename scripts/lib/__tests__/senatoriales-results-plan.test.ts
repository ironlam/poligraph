import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";
import {
  parseIndex,
  parseResults,
  type FeedConstituencyResult,
  type FeedConstituencyStatus,
} from "@/lib/senatoriales/results-feed";
import {
  linkElected,
  mergeIndexes,
  planConstituency,
  splitByPriorImport,
  statutorySeatsFor,
} from "../senatoriales-results-plan";

const fixtures = join(__dirname, "../../../src/lib/senatoriales/__tests__/fixtures");
const read = (name: string) => readFileSync(join(fixtures, name), "utf8");

const status = (
  code: string,
  filled: FeedConstituencyStatus["filled"]
): FeedConstituencyStatus => ({
  code,
  name: code,
  resultsIn: filled !== "NON",
  filled,
  updatedAt: null,
});

describe("statutorySeatsFor", () => {
  it("lit la table statutaire, et 6 pour les Français établis hors de France", () => {
    expect(statutorySeatsFor("01")).toBe(3);
    expect(statutorySeatsFor("03")).toBe(2);
    expect(statutorySeatsFor("ZZ")).toBe(6);
  });

  it("refuse un département de la série 1", () => {
    expect(statutorySeatsFor("75")).toBeNull();
  });
});

describe("planConstituency", () => {
  it("ne publie rien tant que la circonscription n'est pas pourvue", () => {
    const allier = parseResults(read("R103.xml"));
    expect(planConstituency(status("03", "NON"), allier)).toEqual({
      code: "03",
      action: "skip",
      reason: "not-filled",
    });
  });

  it("classe une page de maintenance comme non publiée", () => {
    expect(planConstituency(status("33", "T1"), "not-published")).toEqual({
      code: "33",
      action: "skip",
      reason: "not-published",
    });
  });

  it("refuse une circonscription à moitié pourvue", () => {
    const allier = parseResults(read("R103.xml"));
    const half: FeedConstituencyResult = { ...allier, elected: allier.elected.slice(0, 1) };
    expect(planConstituency(status("03", "T1"), half)).toMatchObject({
      action: "skip",
      reason: "seat-count-mismatch",
    });
  });

  it("remplace les élues de l'Ain", () => {
    const decision = planConstituency(status("01", "T1"), parseResults(read("R101.xml")));
    expect(decision.action).toBe("replace");
    if (decision.action === "replace") expect(decision.elected).toHaveLength(3);
  });

  it("accepte le second tour des Ardennes", () => {
    const decision = planConstituency(status("08", "T2"), parseResults(read("R208.xml")));
    expect(decision.action).toBe("replace");
  });
});

describe("linkElected", () => {
  const seat = (fullName: string, departmentCode: string): OutgoingSenateSeat => ({
    politicianId: `snap-${fullName}`,
    fullName,
    slug: fullName,
    departmentCode,
    constituency: departmentCode,
    series: 2,
    groupCode: null,
    groupName: null,
    groupShortName: null,
  });
  const ardennes = parseResults(read("R208.xml")).elected;

  it("rattache d'abord au snapshot, puis au résolveur, sinon laisse vide", () => {
    const linked = linkElected(
      ardennes,
      [seat("Marc Laménie", "08")],
      new Map([["SN2026-08-JOSEPH-Else", "resolver-id"]])
    );
    expect(linked.map((e) => [e.lastName, e.link, e.politicianId])).toEqual([
      ["JOSEPH", "resolver", "resolver-id"],
      ["LAMÉNIE", "outgoing", "snap-Marc Laménie"],
    ]);
  });

  it("ne rattache rien sans décision SAME du résolveur", () => {
    const linked = linkElected(ardennes, [], new Map());
    expect(linked.every((e) => e.link === "none" && e.politicianId === null)).toBe(true);
  });
});

describe("mergeIndexes", () => {
  it("prend le statut T2 quand l'index du second tour dit pourvu au T2", () => {
    const merged = mergeIndexes(parseIndex(read("INDEX1FE.xml")), parseIndex(read("INDEX2FE.xml")));
    expect(merged).toHaveLength(64);
    expect(merged.find((s) => s.status.code === "08")).toMatchObject({
      round: 2,
      status: { filled: "T2" },
    });
    expect(merged.find((s) => s.status.code === "01")).toMatchObject({
      round: 1,
      status: { filled: "T1" },
    });
  });

  it("garde le premier tour quand le second tour n'est pas pourvu", () => {
    const merged = mergeIndexes(parseIndex(read("INDEX1FE.xml")), parseIndex(read("INDEX2FE.xml")));
    expect(merged.find((s) => s.status.code === "973")).toMatchObject({
      round: 1,
      status: { filled: "NON" },
    });
  });
});

describe("splitByPriorImport", () => {
  const ardennes = parseResults(read("R208.xml")).elected;

  it("ne repasse au résolveur aucun élu déjà importé, rattaché ou non", () => {
    const prior = new Map<string, string | null>([
      ["08|Else JOSEPH", "p-joseph"],
      ["08|Marc LAMÉNIE", null],
    ]);
    const { toResolve, priorMatches } = splitByPriorImport(ardennes, prior);
    expect(toResolve).toEqual([]);
    expect([...priorMatches.entries()]).toEqual([["SN2026-08-JOSEPH-Else", "p-joseph"]]);
  });

  it("résout un élu jamais importé", () => {
    const { toResolve } = splitByPriorImport(ardennes, new Map());
    expect(toResolve.map((e) => e.lastName)).toEqual(["JOSEPH", "LAMÉNIE"]);
  });
});
