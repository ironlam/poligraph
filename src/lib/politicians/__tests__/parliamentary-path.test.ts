import { describe, expect, it } from "vitest";
import { MandateType } from "@/generated/prisma";
import {
  buildParliamentaryPath,
  type PathLegislatureInput,
  type PathMandate,
} from "../parliamentary-path";

const NOW = new Date("2026-10-20T00:00:00.000Z");

const L15: PathLegislatureInput = {
  number: 15,
  period: "2017-2022",
  span: { start: new Date("2017-06-27"), end: new Date("2022-06-21") },
  votes: null,
  votesImported: false,
};
const L16: PathLegislatureInput = {
  number: 16,
  period: "2022-2024",
  span: { start: new Date("2022-06-28"), end: new Date("2024-06-09") },
  votes: null,
  votesImported: true,
};
const L17: PathLegislatureInput = {
  number: 17,
  period: "depuis 2024",
  span: { start: new Date("2024-07-18"), end: null },
  votes: null,
  votesImported: true,
};

function deputy(
  id: string,
  startDate: string,
  endDate: string | null,
  overrides: Partial<PathMandate> = {}
): PathMandate {
  return {
    id,
    politicianId: "depute",
    type: MandateType.DEPUTE,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    isCurrent: false,
    constituency: "Essonne (1ère)",
    source: null,
    lastConfirmedAt: null,
    ...overrides,
  };
}

const withVotes = (l: PathLegislatureInput, total: number, issue: null | "NO_MANDATE" = null) => ({
  ...l,
  votes: { total, perimeterIssue: issue },
});

describe("buildParliamentaryPath", () => {
  it("décrit deux législatures concordantes, la plus récente d'abord", () => {
    const rows = buildParliamentaryPath({
      mandates: [
        deputy("m16", "2022-06-22", "2024-06-09"),
        deputy("m17", "2024-07-01", null, { isCurrent: true }),
      ],
      legislatures: [L15, withVotes(L16, 4000), withVotes(L17, 9000)],
      now: NOW,
    });

    expect(rows.map((r) => r.legislature)).toEqual([17, 16]);
    expect(rows[0]).toMatchObject({
      votes: { total: 9000 },
      datesStatus: { kind: "complete", reason: "CONSISTENT" },
    });
    expect(rows[0]!.mandates.map((m) => m.id)).toEqual(["m17"]);
    expect(rows[1]!.mandates.map((m) => m.id)).toEqual(["m16"]);
  });

  it("n'invente aucune législature sans mandat ni vote", () => {
    const rows = buildParliamentaryPath({
      mandates: [deputy("m17", "2024-07-01", null, { isCurrent: true })],
      legislatures: [L15, L16, withVotes(L17, 10)],
      now: NOW,
    });

    expect(rows.map((r) => r.legislature)).toEqual([17]);
  });

  it("garde une législature sans votes importés et dit que les dates ne sont pas recoupées", () => {
    const rows = buildParliamentaryPath({
      mandates: [deputy("m15", "2017-06-21", "2022-06-21")],
      legislatures: [L15, L16, L17],
      now: NOW,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      legislature: 15,
      votes: null,
      votesImported: false,
      datesStatus: { kind: "unverified", reason: "NOT_CROSS_CHECKED" },
    });
  });

  it("garde des votes sans mandat de député documenté (16e, aucun mandat en base)", () => {
    const rows = buildParliamentaryPath({
      mandates: [],
      legislatures: [withVotes(L16, 2427, "NO_MANDATE")],
      now: NOW,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      legislature: 16,
      mandates: [],
      votes: { total: 2427 },
      datesStatus: { kind: "unverified", reason: "NO_MANDATE" },
    });
  });

  it("ne rattache pas à la 16e un mandat enregistré en 2026 (votes de 2022 à 2024)", () => {
    const rows = buildParliamentaryPath({
      mandates: [deputy("recent", "2026-04-17", null, { isCurrent: true })],
      legislatures: [withVotes(L16, 2008, "NO_MANDATE"), L17],
      now: NOW,
    });

    const l16 = rows.find((r) => r.legislature === 16)!;
    expect(l16.mandates).toEqual([]);
    expect(l16.datesStatus.reason).toBe("NO_MANDATE");
    const l17 = rows.find((r) => r.legislature === 17)!;
    expect(l17.mandates.map((m) => m.id)).toEqual(["recent"]);
    expect(l17.votes).toBeNull();
  });

  it("signale deux mandats qui se chevauchent dans la 15e (cas Dupont-Aignan)", () => {
    const rows = buildParliamentaryPath({
      mandates: [
        deputy("generique", "1997-06-01", "2022-06-19"),
        deputy("m15", "2017-06-21", "2022-06-21"),
        deputy("m16", "2022-06-22", "2024-06-09"),
      ],
      legislatures: [L15, withVotes(L16, 3000), L17],
      now: NOW,
    });

    const l15 = rows.find((r) => r.legislature === 15)!;
    expect(l15.datesStatus).toEqual({ kind: "unverified", reason: "OVERLAPPING_MANDATES" });
    expect(l15.mandates.map((m) => m.id)).toEqual(["generique", "m15"]);
    // Le mandat générique ne déborde pas sur la 16e : il se termine avant.
    const l16 = rows.find((r) => r.legislature === 16)!;
    expect(l16.mandates.map((m) => m.id)).toEqual(["m16"]);
    expect(l16.datesStatus.kind).toBe("complete");
  });

  it("reprend la raison des votes hors mandat sans la recalculer", () => {
    const rows = buildParliamentaryPath({
      mandates: [deputy("m16", "2022-06-22", "2024-06-09")],
      legislatures: [{ ...L16, votes: { total: 10, perimeterIssue: "VOTES_OUTSIDE_MANDATE" } }],
      now: NOW,
    });

    expect(rows[0]!.datesStatus).toEqual({ kind: "unverified", reason: "VOTES_OUTSIDE_MANDATE" });
  });

  it("ne laisse pas un mandat fermé sans date de fin s'étendre aux législatures suivantes", () => {
    const rows = buildParliamentaryPath({
      mandates: [deputy("sans-fin", "2017-07-01", null)],
      legislatures: [L15, L16, L17],
      now: NOW,
    });

    expect(rows.map((r) => r.legislature)).toEqual([15]);
  });

  it("ignore les mandats qui ne sont pas des mandats de député", () => {
    const senator = deputy("senat", "2020-10-01", null, {
      type: MandateType.SENATEUR,
      isCurrent: true,
    });

    expect(
      buildParliamentaryPath({ mandates: [senator], legislatures: [L15, L16, L17], now: NOW })
    ).toEqual([]);
  });

  it("garde plusieurs mandats distincts dans une même législature (suppléant qui revient)", () => {
    const rows = buildParliamentaryPath({
      mandates: [
        deputy("b", "2025-09-01", null, { isCurrent: true }),
        deputy("a", "2024-07-01", "2025-03-01"),
      ],
      legislatures: [withVotes(L17, 500)],
      now: NOW,
    });

    expect(rows[0]!.mandates.map((m) => m.id)).toEqual(["a", "b"]);
    expect(rows[0]!.datesStatus.kind).toBe("complete");
  });
});
