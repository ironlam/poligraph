import { describe, expect, it } from "vitest";
import type { ElectedSenator } from "@/lib/senatoriales/results-summary";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";
import {
  TERM_2020_END,
  TERM_2026_START,
  assertReadyToSwitch,
  closedMandatePatch,
  planMandates,
  renewedMandateData,
} from "../senatoriales-mandates-plan";

const seat = (politicianId: string, departmentCode: string | null = "08"): OutgoingSenateSeat => ({
  politicianId,
  fullName: politicianId,
  slug: politicianId,
  departmentCode,
  constituency: departmentCode,
  series: 2,
  groupCode: null,
  groupName: null,
  groupShortName: null,
});

const elected = (politicianId: string | null, constituencyCode = "08"): ElectedSenator => ({
  constituencyCode,
  constituencyName: constituencyCode,
  name: politicianId ?? "Inconnu",
  nuanceLabel: null,
  round: 1,
  politicianId,
  politicianSlug: politicianId,
  status: politicianId ? "reelected" : "unresolved",
  gender: "F",
});

describe("planMandates", () => {
  it("ferme au 30 septembre le mandat d'un sortant non réélu", () => {
    const actions = planMandates({
      elected: [],
      outgoing: [seat("sortant")],
      currentSeries2Mandates: [{ id: "m1", politicianId: "sortant" }],
    });
    expect(actions).toEqual([{ kind: "close", mandateId: "m1", endDate: TERM_2020_END }]);
  });

  it("renouvelle un sortant réélu sans le fermer une seconde fois", () => {
    const actions = planMandates({
      elected: [elected("reelu")],
      outgoing: [seat("reelu")],
      currentSeries2Mandates: [{ id: "m2", politicianId: "reelu" }],
    });
    expect(actions).toEqual([
      { kind: "renew", closeMandateId: "m2", politicianId: "reelu", departmentCode: "08" },
    ]);
  });

  it("ouvre un mandat pour un nouvel élu rattaché, sans département pour ZZ", () => {
    const actions = planMandates({
      elected: [elected("nouvelle", "ZZ")],
      outgoing: [],
      currentSeries2Mandates: [],
    });
    expect(actions).toEqual([{ kind: "open", politicianId: "nouvelle", departmentCode: null }]);
  });

  it("laisse un élu non rattaché à une action manuelle", () => {
    const actions = planMandates({
      elected: [elected(null, "69")],
      outgoing: [],
      currentSeries2Mandates: [],
    });
    expect(actions).toEqual([{ kind: "manual", name: "Inconnu", constituencyCode: "69" }]);
  });

  it("ouvre sans fermer quand un réélu n'a plus de mandat courant", () => {
    const actions = planMandates({
      elected: [elected("reelu")],
      outgoing: [seat("reelu")],
      currentSeries2Mandates: [],
    });
    expect(actions).toEqual([{ kind: "open", politicianId: "reelu", departmentCode: "08" }]);
  });

  it("traite chaque siège sortant exactement une fois", () => {
    const outgoing = [seat("a"), seat("b"), seat("c")];
    const actions = planMandates({
      elected: [elected("b")],
      outgoing,
      currentSeries2Mandates: outgoing.map((s, i) => ({
        id: `m${i}`,
        politicianId: s.politicianId,
      })),
    });
    const handled = actions.filter((a) => a.kind === "close" || a.kind === "renew");
    expect(handled).toHaveLength(3);
  });
});

describe("assertReadyToSwitch", () => {
  it("refuse avant le 1er octobre 2026", () => {
    expect(() => assertReadyToSwitch(new Date("2026-09-30T20:00:00Z"), 64)).toThrow(/1er octobre/);
  });

  it("refuse tant que les 64 circonscriptions ne sont pas publiées", () => {
    expect(() => assertReadyToSwitch(new Date("2026-10-01T08:00:00Z"), 61)).toThrow(/61 sur 64/);
  });

  it("accepte le 1er octobre avec les 64 circonscriptions", () => {
    expect(() => assertReadyToSwitch(new Date("2026-10-01T08:00:00Z"), 64)).not.toThrow();
  });
});

describe("renouvellement : transfert de l'identifiant Sénat", () => {
  const old = {
    politicianId: "reelu",
    title: "Sénateur Ardennes",
    constituency: "Ardennes",
    departmentCode: "08",
    externalId: "senat-19001A",
    sourceUrl: "https://www.senat.fr/senateur/x.html",
    officialUrl: "https://www.senat.fr/senateur/x.html",
  };

  it("ouvre le mandat 2026 avec l'identifiant Sénat de l'ancien", () => {
    expect(renewedMandateData(old)).toMatchObject({
      politicianId: "reelu",
      type: "SENATEUR",
      institution: "Sénat",
      title: "Sénateur Ardennes",
      externalId: "senat-19001A",
      senateSeries: 2,
      startDate: TERM_2026_START,
      isCurrent: true,
      source: "SENAT",
    });
  });

  it("retire l'identifiant de l'ancien mandat, que le sync rouvrirait sinon", () => {
    expect(closedMandatePatch({ transferExternalId: true })).toEqual({
      isCurrent: false,
      endDate: TERM_2020_END,
      externalId: null,
    });
  });

  it("garde l'identifiant d'un sortant non réélu", () => {
    expect(closedMandatePatch({ transferExternalId: false })).toEqual({
      isCurrent: false,
      endDate: TERM_2020_END,
    });
  });
});
