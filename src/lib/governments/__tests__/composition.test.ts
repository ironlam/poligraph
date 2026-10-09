import { describe, expect, it } from "vitest";
import {
  buildSameDayContext,
  categoryAt,
  compositionAt,
  consultableRange,
  documentedChanges,
  overlapsPeriod,
} from "../composition";
import type { Category, CompositionResult, Episode, GovernmentDates } from "../types";

// --- Fixtures ---------------------------------------------------------------

function gov(overrides: Partial<GovernmentDates> = {}): GovernmentDates {
  return {
    id: "g1",
    slug: "test-1",
    primeMinisterAppointedAt: "2024-01-09",
    formedAt: "2024-01-11",
    resignedAt: "2024-07-16",
    resignedEvidence: "ACT",
    endedAt: "2024-09-21",
    compositionVerifiedAt: null,
    hasDerivedDate: false,
    ...overrides,
  };
}

function ep(membershipId: string, overrides: Partial<Episode> = {}): Episode {
  return {
    membershipId,
    mandateId: `m-${membershipId}`,
    mandatePublicId: null,
    governmentId: "g1",
    politicianId: `p-${membershipId}`,
    type: "MINISTRE",
    title: `Ministre ${membershipId}`,
    start: "2024-01-11",
    startEvidence: "ACT",
    startSourceUrl: null,
    end: null,
    endEvidence: null,
    endSourceUrl: null,
    endKind: null,
    lastConfirmedAt: "2024-09-01",
    predecessorMembershipId: null,
    sameDayOrderEstablished: false,
    sameDayOrderSourceUrl: null,
    ...overrides,
  };
}

type Ok = Extract<CompositionResult, { status: "ok" }>;

function ok(result: CompositionResult): Ok {
  if (result.status !== "ok") throw new Error(`statut inattendu : ${JSON.stringify(result)}`);
  return result;
}

function categoryOf(result: Ok, membershipId: string): Category | null {
  for (const [category, list] of Object.entries(result.byCategory) as [Category, Episode[]][]) {
    if (list.some((e) => e.membershipId === membershipId)) return category;
  }
  return null;
}

function ids(list: Episode[]): string[] {
  return list.map((e) => e.membershipId).sort();
}

function alone(g: GovernmentDates, e: Episode, date: string): Category | null {
  return categoryAt(g, e, date, buildSameDayContext([e], date));
}

const D = "2024-03-05";
const stable = ep("stable");
const predecessor = ep("pred", { end: D, endEvidence: "ACT", endKind: "INDIVIDUAL" });

// --- Tests ------------------------------------------------------------------

describe("compositionAt et categoryAt", () => {
  it("remplacement lié, ordre établi", () => {
    const successor = ep("succ", {
      start: D,
      predecessorMembershipId: "pred",
      sameDayOrderEstablished: true,
    });
    const r = ok(compositionAt(gov(), [stable, predecessor, successor], D));
    expect(categoryOf(r, "succ")).toBe("established");
    expect(categoryOf(r, "pred")).toBeNull();
    expect(ids(r.byCategory.established)).toEqual(["stable", "succ"]);
    expect(r.byCategory.transition).toEqual([]);
    expect(r.establishedPersons).toBe(2);
  });

  it("remplacement lié, ordre non établi", () => {
    const successor = ep("succ", { start: D, predecessorMembershipId: "pred" });
    const all = [stable, predecessor, successor];

    const day = ok(compositionAt(gov(), all, D));
    expect(ids(day.byCategory.transition)).toEqual(["pred", "succ"]);
    expect(ids(day.byCategory.established)).toEqual(["stable"]);
    expect(day.establishedPersons).toBe(1);

    const eve = ok(compositionAt(gov(), all, "2024-03-04"));
    expect(eve.byCategory.transition).toEqual([]);
    expect(ids(eve.byCategory.established)).toEqual(["pred", "stable"]);

    const next = ok(compositionAt(gov(), all, "2024-03-06"));
    expect(next.byCategory.transition).toEqual([]);
    expect(ids(next.byCategory.established)).toEqual(["stable", "succ"]);
  });

  it("entrée et sortie sans lien, dates ACT", () => {
    const entry = ep("entry", { start: D });
    const r = ok(compositionAt(gov(), [stable, predecessor, entry], D));
    expect(ids(r.byCategory.established)).toEqual(["entry", "pred", "stable"]);
    expect(r.byCategory.transition).toEqual([]);
    expect(r.establishedPersons).toBe(3);
  });

  it("entrée et sortie le même jour, une date DATASET", () => {
    const entry = ep("entry", { start: D, startEvidence: "DATASET" });
    const r = ok(compositionAt(gov(), [stable, predecessor, entry], D));
    expect(ids(r.byCategory.transition)).toEqual(["entry", "pred"]);
    expect(ids(r.byCategory.established)).toEqual(["stable"]);
    expect(r.establishedPersons).toBe(1);
  });

  it("départ isolé", () => {
    const leaving = ep("leaving", { end: D, endEvidence: "DATASET", endKind: "INDIVIDUAL" });
    const day = ok(compositionAt(gov(), [stable, leaving], D));
    expect(categoryOf(day, "leaving")).toBe("established");
    expect(day.byCategory.transition).toEqual([]);
    const after = ok(compositionAt(gov(), [stable, leaving], "2024-03-06"));
    expect(categoryOf(after, "leaving")).toBeNull();
    expect(after.establishedPersons).toBe(1);
  });

  it("jour de formation sans sortie", () => {
    const members = ["a", "b", "c"].map((id) => ep(id, { startEvidence: "DATASET" }));
    const r = ok(compositionAt(gov(), members, "2024-01-11"));
    expect(r.byCategory.transition).toEqual([]);
    expect(ids(r.byCategory.established)).toEqual(["a", "b", "c"]);
    expect(r.establishedPersons).toBe(3);
  });

  it("changement d'intitulé lié, ordre non établi", () => {
    const oldTitle = ep("old", {
      politicianId: "p-same",
      title: "Ministre de l'Économie",
      end: D,
      endEvidence: "ACT",
      endKind: "INDIVIDUAL",
    });
    const unordered = ep("new", {
      politicianId: "p-same",
      title: "Ministre de l'Économie et des Finances",
      start: D,
      predecessorMembershipId: "old",
    });
    const r = ok(compositionAt(gov(), [stable, oldTitle, unordered], D));
    expect(ids(r.byCategory.transition)).toEqual(["new", "old"]);
    expect(ids(r.byCategory.established)).toEqual(["stable"]);
    expect(r.establishedPersons).toBe(1);

    const ordered = { ...unordered, sameDayOrderEstablished: true };
    const r2 = ok(compositionAt(gov(), [stable, oldTitle, ordered], D));
    expect(ids(r2.byCategory.established)).toEqual(["new", "stable"]);
    expect(categoryOf(r2, "old")).toBeNull();
    expect(r2.byCategory.transition).toEqual([]);
    expect(r2.establishedPersons).toBe(2);
  });

  it("cessation collective avec démission ACT", () => {
    const resigning = ep("res", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });

    const lastDay = ok(compositionAt(gov(), [resigning], "2024-07-16"));
    expect(categoryOf(lastDay, "res")).toBe("established");
    expect(lastDay.caretaker).toBe(false);

    const caretaking = ok(compositionAt(gov(), [resigning], "2024-08-01"));
    expect(categoryOf(caretaking, "res")).toBe("currentAffairs");
    expect(caretaking.caretaker).toBe(true);
    expect(caretaking.establishedPersons).toBe(1);

    const onEnd = ok(compositionAt(gov(), [resigning], "2024-09-21"));
    expect(categoryOf(onEnd, "res")).toBe("currentAffairs");

    const dataset = gov({ resignedEvidence: "DATASET" });
    const unproven = ok(compositionAt(dataset, [resigning], "2024-08-01"));
    expect(categoryOf(unproven, "res")).toBe("undocumented");
    expect(unproven.caretaker).toBe(false);
    expect(unproven.establishedPersons).toBe(0);

    expect(alone(gov(), resigning, "2024-09-22")).toBeNull();
  });

  it("fin inconnue", () => {
    const confirmed = ep("conf", { lastConfirmedAt: "2024-05-01" });
    expect(alone(gov(), confirmed, "2024-05-01")).toBe("established");
    expect(alone(gov(), confirmed, "2024-05-02")).toBe("undocumented");

    const never = ep("never", { start: D, lastConfirmedAt: null });
    expect(alone(gov(), never, D)).toBe("established");
    expect(alone(gov(), never, "2024-03-06")).toBe("undocumented");

    const neverDataset = ep("never-ds", {
      start: D,
      startEvidence: "DATASET",
      lastConfirmedAt: null,
    });
    expect(alone(gov(), neverDataset, D)).toBe("undocumented");
  });

  it("date DERIVED", () => {
    const derivedStart = ep("ds", { start: D, startEvidence: "DERIVED" });
    expect(alone(gov(), derivedStart, D)).toBe("undocumented");
    expect(alone(gov(), derivedStart, "2024-03-06")).toBe("established");

    const derivedEnd = ep("de", { end: D, endEvidence: "DERIVED", endKind: "INDIVIDUAL" });
    expect(alone(gov(), derivedEnd, "2024-03-04")).toBe("established");
    expect(alone(gov(), derivedEnd, D)).toBe("undocumented");
    expect(alone(gov(), derivedEnd, "2024-03-06")).toBeNull();
  });

  it("avant l'équipe", () => {
    expect(compositionAt(gov(), [stable], "2024-01-10")).toEqual({
      status: "not_established",
      reason: "before_team",
    });
    expect(compositionAt(gov({ formedAt: null }), [stable], "2024-03-01")).toEqual({
      status: "not_established",
      reason: "no_formation_date",
    });
    const range = { from: "2024-01-11", to: "2024-09-21" };
    expect(compositionAt(gov(), [stable], "2024-09-22")).toEqual({ status: "out_of_range", range });
    expect(compositionAt(gov(), [stable], "2024-01-08")).toEqual({ status: "out_of_range", range });
  });

  it("gouvernement en exercice sans compositionVerifiedAt", () => {
    const inOffice = gov({ resignedAt: null, resignedEvidence: null, endedAt: null });
    expect(consultableRange(inOffice)).toBeNull();
    expect(compositionAt(inOffice, [stable], "2024-03-01")).toEqual({
      status: "not_established",
      reason: "not_verified",
    });

    const verified = { ...inOffice, compositionVerifiedAt: "2024-06-01" };
    expect(consultableRange(verified)).toEqual({ from: "2024-01-11", to: "2024-06-01" });
    expect(compositionAt(verified, [stable], "2024-06-02")).toEqual({
      status: "out_of_range",
      range: { from: "2024-01-11", to: "2024-06-01" },
    });
    expect(ok(compositionAt(verified, [stable], "2024-06-01")).establishedPersons).toBe(1);
  });

  it("même personne, bascule entre deux gouvernements le même jour", () => {
    const day = "2024-09-21";
    const govA = gov({ id: "gA", endedAt: day });
    const govB = gov({
      id: "gB",
      primeMinisterAppointedAt: "2024-09-05",
      formedAt: day,
      resignedAt: null,
      resignedEvidence: null,
      endedAt: null,
      compositionVerifiedAt: "2024-10-01",
    });
    const all = [
      ep("a-stable", { governmentId: "gA", end: day, endEvidence: "ACT", endKind: "INDIVIDUAL" }),
      ep("x-in-a", {
        governmentId: "gA",
        politicianId: "p-x",
        end: day,
        endEvidence: "DATASET",
        endKind: "INDIVIDUAL",
      }),
      ep("x-in-b", {
        governmentId: "gB",
        politicianId: "p-x",
        start: day,
        startEvidence: "DATASET",
        lastConfirmedAt: "2024-10-01",
      }),
      ep("b-other", { governmentId: "gB", start: day, lastConfirmedAt: "2024-10-01" }),
    ];

    const a = ok(compositionAt(govA, all, day));
    const b = ok(compositionAt(govB, all, day));
    for (const list of Object.values(a.byCategory)) {
      expect(list.every((e) => e.governmentId === "gA")).toBe(true);
    }
    for (const list of Object.values(b.byCategory)) {
      expect(list.every((e) => e.governmentId === "gB")).toBe(true);
    }
    expect(ids(a.byCategory.established)).toEqual(["a-stable", "x-in-a"]);
    expect(ids(b.byCategory.established)).toEqual(["b-other", "x-in-b"]);
    expect(a.byCategory.transition).toEqual([]);
    expect(b.byCategory.transition).toEqual([]);
  });

  it("même Premier ministre, deux gouvernements", () => {
    const l1 = gov({
      id: "lecornu-1",
      slug: "lecornu-1",
      primeMinisterAppointedAt: "2025-09-09",
      formedAt: "2025-10-05",
      resignedAt: "2025-10-06",
      endedAt: "2025-10-12",
    });
    const l2 = gov({
      id: "lecornu-2",
      slug: "lecornu-2",
      primeMinisterAppointedAt: "2025-10-10",
      formedAt: "2025-10-12",
      resignedAt: null,
      resignedEvidence: null,
      endedAt: null,
      compositionVerifiedAt: "2025-11-01",
    });
    const all = [
      ep("pm-1", {
        governmentId: "lecornu-1",
        politicianId: "p-lecornu",
        type: "PREMIER_MINISTRE",
        start: "2025-09-10",
        end: "2025-10-06",
        endEvidence: "ACT",
        endKind: "COLLECTIVE_RESIGNATION",
      }),
      ep("min-1", {
        governmentId: "lecornu-1",
        start: "2025-10-05",
        end: "2025-10-06",
        endEvidence: "ACT",
        endKind: "COLLECTIVE_RESIGNATION",
      }),
      ep("pm-2", {
        governmentId: "lecornu-2",
        politicianId: "p-lecornu",
        type: "PREMIER_MINISTRE",
        start: "2025-10-10",
        lastConfirmedAt: "2025-11-01",
      }),
      ep("min-2", {
        governmentId: "lecornu-2",
        start: "2025-10-12",
        lastConfirmedAt: "2025-11-01",
      }),
    ];

    const r1 = ok(compositionAt(l1, all, "2025-10-08"));
    const r2 = ok(compositionAt(l2, all, "2025-10-20"));
    expect(ids(r1.byCategory.currentAffairs)).toEqual(["min-1", "pm-1"]);
    expect(ids(r1.byCategory.established)).toEqual([]);
    expect(ids(r2.byCategory.established)).toEqual(["min-2", "pm-2"]);
    expect(r2.byCategory.currentAffairs).toEqual([]);
  });
});

describe("overlapsPeriod", () => {
  it("overlapsPeriod", () => {
    const open = ep("open", { lastConfirmedAt: "2024-03-01" });
    expect(overlapsPeriod(gov(), open, "2024-02-01", "2024-02-28")).toBe("established");
    expect(overlapsPeriod(gov(), open, "2024-04-01", "2024-05-01")).toBe("undocumented");
    expect(overlapsPeriod(gov(), open, "2023-01-01", "2024-01-10")).toBeNull();

    const closed = ep("closed", { end: D, endEvidence: "ACT", endKind: "INDIVIDUAL" });
    expect(overlapsPeriod(gov(), closed, "2024-03-05", "2024-04-01")).toBe("established");
    expect(overlapsPeriod(gov(), closed, "2024-03-06", "2024-04-01")).toBeNull();
  });
});

describe("documentedChanges", () => {
  it("documentedChanges", () => {
    const g = gov();
    const all = [
      ep("a", { startEvidence: "DATASET", startSourceUrl: "https://data.gouv.fr/x" }),
      ep("b", {
        startEvidence: "ACT",
        startSourceUrl: "https://legifrance.gouv.fr/jorf/1",
        end: "2024-02-10",
        endEvidence: "ACT",
        endSourceUrl: "https://legifrance.gouv.fr/jorf/2",
        endKind: "INDIVIDUAL",
      }),
      ep("c", {
        start: "2024-02-20",
        startEvidence: "DATASET",
        startSourceUrl: "https://data.gouv.fr/y",
      }),
      ep("d", {
        end: D,
        endEvidence: "ACT",
        endSourceUrl: "https://legifrance.gouv.fr/jorf/3",
        endKind: "INDIVIDUAL",
      }),
      ep("e", { start: D, startEvidence: "DATASET", startSourceUrl: "https://data.gouv.fr/z" }),
    ];
    const changes = documentedChanges(g, all);
    expect(changes).toEqual([
      {
        date: "2024-01-11",
        kind: "formation",
        membershipIds: ["a", "b", "d"],
        evidence: "DATASET",
        sourceUrl: null,
      },
      {
        date: "2024-02-10",
        kind: "exit",
        membershipIds: ["b"],
        evidence: "ACT",
        sourceUrl: "https://legifrance.gouv.fr/jorf/2",
      },
      {
        date: "2024-02-20",
        kind: "entry",
        membershipIds: ["c"],
        evidence: "DATASET",
        sourceUrl: "https://data.gouv.fr/y",
      },
      {
        date: D,
        kind: "transition",
        membershipIds: ["d", "e"],
        evidence: "DATASET",
        sourceUrl: null,
      },
      {
        date: "2024-07-16",
        kind: "resignation",
        membershipIds: [],
        evidence: "ACT",
        sourceUrl: null,
      },
    ]);
  });
});
