import { describe, expect, it } from "vitest";
import {
  buildSameDayContext,
  categoryAt,
  compositionAt,
  consultableRange,
  defaultCompositionDate,
  documentedChanges,
  lastCaretakerDay,
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
    currentAffairsAttested: false,
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
    currentAffairsEndedAt: null,
    startActId: null,
    endActId: null,
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

    const attested = gov({ currentAffairsAttested: true });
    const lastDay = ok(compositionAt(attested, [resigning], "2024-07-16"));
    expect(categoryOf(lastDay, "res")).toBe("established");
    expect(lastDay.caretaker).toBe(false);

    const caretaking = ok(compositionAt(attested, [resigning], "2024-08-01"));
    expect(categoryOf(caretaking, "res")).toBe("currentAffairs");
    expect(caretaking.caretaker).toBe(true);
    expect(caretaking.establishedPersons).toBe(1);

    // Caretaker period ends the day before the successor team's appointment (endedAt).
    const dayBefore = ok(compositionAt(attested, [resigning], "2024-09-20"));
    expect(categoryOf(dayBefore, "res")).toBe("currentAffairs");
    const onEnd = ok(compositionAt(attested, [resigning], "2024-09-21"));
    expect(categoryOf(onEnd, "res")).toBeNull();
    expect(onEnd.caretaker).toBe(false);

    const dataset = gov({ resignedEvidence: "DATASET", currentAffairsAttested: true });
    const unproven = ok(compositionAt(dataset, [resigning], "2024-08-01"));
    expect(categoryOf(unproven, "res")).toBe("undocumented");
    expect(unproven.caretaker).toBe(false);
    expect(unproven.establishedPersons).toBe(0);

    expect(alone(attested, resigning, "2024-09-22")).toBeNull();
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
      currentAffairsAttested: true,
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
  it("affaires courantes, successeur pas encore nommé", () => {
    const resigned = gov({
      endedAt: null,
      compositionVerifiedAt: "2024-08-01",
      currentAffairsAttested: true,
    });
    const resigning = ep("res", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });
    const r = ok(compositionAt(resigned, [resigning], "2024-07-20"));
    expect(categoryOf(r, "res")).toBe("currentAffairs");
    expect(r.establishedPersons).toBe(1);
    expect(r.caretaker).toBe(true);

    const dataset = { ...resigned, resignedEvidence: "DATASET" as const };
    const r2 = ok(compositionAt(dataset, [resigning], "2024-07-20"));
    expect(categoryOf(r2, "res")).toBe("undocumented");
    expect(r2.establishedPersons).toBe(0);
    expect(r2.caretaker).toBe(false);
  });

  it("affaires courantes non attestées", () => {
    const resigning = ep("res", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });
    const notAttested = gov({ currentAffairsAttested: false });
    expect(alone(notAttested, resigning, "2024-07-16")).toBe("established");
    const r = ok(compositionAt(notAttested, [resigning], "2024-08-01"));
    expect(categoryOf(r, "res")).toBe("undocumented");
    expect(r.caretaker).toBe(false);
    expect(r.establishedPersons).toBe(0);
    expect(alone(notAttested, resigning, "2024-09-21")).toBe("undocumented");

    const inProgress = gov({
      endedAt: null,
      compositionVerifiedAt: "2024-08-01",
      currentAffairsAttested: false,
    });
    expect(alone(inProgress, resigning, "2024-07-20")).toBe("undocumented");
  });

  it("décharge individuelle", () => {
    const g = gov({ currentAffairsAttested: true });
    const discharged = ep("le-maire", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
      currentAffairsEndedAt: "2024-07-16",
    });
    const other = ep("other", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });
    const all = [discharged, other];

    const lastDay = ok(compositionAt(g, all, "2024-07-16"));
    expect(ids(lastDay.byCategory.established)).toEqual(["le-maire", "other"]);

    const next = ok(compositionAt(g, all, "2024-07-17"));
    expect(categoryOf(next, "le-maire")).toBeNull();
    expect(categoryOf(next, "other")).toBe("currentAffairs");
    expect(next.establishedPersons).toBe(1);

    const dayBefore = ok(compositionAt(g, all, "2024-09-20"));
    expect(categoryOf(dayBefore, "le-maire")).toBeNull();
    expect(categoryOf(dayBefore, "other")).toBe("currentAffairs");
    const onEnd = ok(compositionAt(g, all, "2024-09-21"));
    expect(categoryOf(onEnd, "other")).toBeNull();
  });

  it("borne individuelle avant la fin du gouvernement", () => {
    const l1 = gov({
      id: "lecornu-1",
      slug: "lecornu-1",
      primeMinisterAppointedAt: "2025-09-09",
      formedAt: "2025-10-05",
      resignedAt: "2025-10-06",
      endedAt: "2025-10-12",
      currentAffairsAttested: true,
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
    const pm1 = ep("pm-1", {
      governmentId: "lecornu-1",
      politicianId: "p-lecornu",
      type: "PREMIER_MINISTRE",
      start: "2025-09-10",
      end: "2025-10-06",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
      currentAffairsEndedAt: "2025-10-10",
    });
    const min1 = ep("min-1", {
      governmentId: "lecornu-1",
      start: "2025-10-05",
      end: "2025-10-06",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });
    const pm2 = ep("pm-2", {
      governmentId: "lecornu-2",
      politicianId: "p-lecornu",
      type: "PREMIER_MINISTRE",
      start: "2025-10-10",
      lastConfirmedAt: "2025-11-01",
    });
    const min2 = ep("min-2", {
      governmentId: "lecornu-2",
      start: "2025-10-12",
      lastConfirmedAt: "2025-11-01",
    });
    const all = [pm1, min1, pm2, min2];

    const bound = ok(compositionAt(l1, all, "2025-10-10"));
    expect(ids(bound.byCategory.currentAffairs)).toEqual(["min-1", "pm-1"]);
    expect(bound.establishedPersons).toBe(2);

    const after = ok(compositionAt(l1, all, "2025-10-11"));
    expect(categoryOf(after, "pm-1")).toBeNull();
    expect(ids(after.byCategory.currentAffairs)).toEqual(["min-1"]);
    expect(after.establishedPersons).toBe(1);
    expect(alone(l2, pm2, "2025-10-11")).toBe("established");

    const r2 = ok(compositionAt(l2, all, "2025-10-20"));
    expect(ids(r2.byCategory.established)).toEqual(["min-2", "pm-2"]);
    expect(r2.establishedPersons).toBe(2);

    // Une borne individuelle ne prolonge jamais la présence au-delà de la fin du gouvernement.
    const late = { ...pm1, currentAffairsEndedAt: "2025-10-20" };
    expect(alone(l1, late, "2025-10-11")).toBe("currentAffairs");
    expect(alone(l1, late, "2025-10-12")).toBeNull();
    expect(alone(l1, late, "2025-10-13")).toBeNull();

    // Lecornu I ends on 2025-10-12: nobody that day, the non-reconducted on the day before.
    expect(ids(ok(compositionAt(l1, all, "2025-10-12")).byCategory.currentAffairs)).toEqual([]);
    expect(ids(ok(compositionAt(l1, all, "2025-10-11")).byCategory.currentAffairs)).toEqual([
      "min-1",
    ]);
  });

  it("borne inconnue", () => {
    const resigned = gov({
      endedAt: null,
      compositionVerifiedAt: "2024-08-01",
      currentAffairsAttested: true,
    });
    const resigning = ep("res", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
    });
    expect(alone(resigned, resigning, "2024-08-01")).toBe("currentAffairs");
    expect(alone(resigned, resigning, "2024-08-02")).toBe("undocumented");

    // Borne individuelle connue et dépassée : absente, même dans la période documentée.
    const bounded = { ...resigning, currentAffairsEndedAt: "2024-07-20" };
    expect(alone(resigned, bounded, "2024-07-20")).toBe("currentAffairs");
    expect(alone(resigned, bounded, "2024-07-21")).toBeNull();
  });
});

describe("changement de fonction d'une même personne par un même acte", () => {
  // Cas David Amiel, 22 février 2026 : un seul décret met fin à sa fonction de ministre délégué
  // et le nomme ministre, en remplacement d'Amélie de Montchalin (ordre établi par l'acte).
  const DAY = "2026-02-22";
  const g = gov({
    primeMinisterAppointedAt: "2025-10-10",
    formedAt: "2025-10-12",
    resignedAt: null,
    resignedEvidence: null,
    endedAt: null,
    compositionVerifiedAt: "2026-09-30",
  });
  const stable = ep("stable", { start: "2025-10-12", lastConfirmedAt: "2026-09-30" });
  const amielEnd = (endActId: string | null) =>
    ep("amiel-delegue", {
      politicianId: "p-amiel",
      type: "MINISTRE_DELEGUE",
      start: "2025-10-12",
      end: DAY,
      endEvidence: "ACT",
      endKind: "INDIVIDUAL",
      endActId,
      endSourceUrl: "https://legifrance.gouv.fr/decret-22-02",
    });
  const montchalin = ep("montchalin", {
    politicianId: "p-montchalin",
    start: "2025-10-12",
    end: DAY,
    endEvidence: "ACT",
    endKind: "INDIVIDUAL",
    endActId: "act-22-02",
  });
  const amielMinistre = (startActId: string | null) =>
    ep("amiel-ministre", {
      politicianId: "p-amiel",
      start: DAY,
      startEvidence: "ACT",
      startActId,
      startSourceUrl: "https://legifrance.gouv.fr/decret-22-02",
      lastConfirmedAt: "2026-09-30",
      predecessorMembershipId: "montchalin",
      sameDayOrderEstablished: true,
    });

  it("même acte : seule la nouvelle fonction est établie, comptée une fois", () => {
    const all = [stable, montchalin, amielEnd("act-22-02"), amielMinistre("act-22-02")];
    const r = ok(compositionAt(g, all, DAY));
    expect(ids(r.byCategory.established)).toEqual(["amiel-ministre", "stable"]);
    expect(categoryOf(r, "amiel-delegue")).toBeNull();
    expect(categoryOf(r, "montchalin")).toBeNull();
    expect(r.byCategory.transition).toEqual([]);
    expect(r.establishedPersons).toBe(2);

    const changes = documentedChanges(g, all).filter((c) => c.date === DAY);
    expect(changes.map((c) => [c.kind, c.membershipIds])).toEqual([
      ["exit", ["montchalin"]],
      ["titleChange", ["amiel-delegue", "amiel-ministre"]],
    ]);
  });

  it("actes différents : comportement inchangé, l'ancienne fonction reste établie le jour même", () => {
    const all = [stable, montchalin, amielEnd("act-autre"), amielMinistre("act-22-02")];
    const r = ok(compositionAt(g, all, DAY));
    expect(categoryOf(r, "amiel-delegue")).toBe("established");
    expect(categoryOf(r, "amiel-ministre")).toBe("established");
    expect(categoryOf(r, "montchalin")).toBeNull();
  });

  it("acte de fin inconnu : comportement inchangé", () => {
    const all = [stable, montchalin, amielEnd(null), amielMinistre(null)];
    const r = ok(compositionAt(g, all, DAY));
    expect(categoryOf(r, "amiel-delegue")).toBe("established");
    expect(categoryOf(r, "amiel-ministre")).toBe("established");
  });

  it("même acte sans lien de remplacement ni preuve ACT partout : pas de transition", () => {
    // Une sortie DATASET d'une autre personne le même jour rendrait l'entrée « transition »
    // sans la règle ; le même acte établit l'ordre du changement de fonction.
    const other = ep("other", { end: DAY, endEvidence: "DATASET", endKind: "INDIVIDUAL" });
    const entry = { ...amielMinistre("act-22-02"), predecessorMembershipId: null };
    const r = ok(compositionAt(g, [stable, other, amielEnd("act-22-02"), entry], DAY));
    expect(categoryOf(r, "amiel-ministre")).toBe("established");
    expect(categoryOf(r, "amiel-delegue")).toBeNull();
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

  it("période après une borne individuelle", () => {
    const g = gov({ currentAffairsAttested: true });
    const discharged = ep("le-maire", {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
      currentAffairsEndedAt: "2024-07-20",
    });
    expect(overlapsPeriod(g, discharged, "2024-07-21", "2024-09-21")).toBeNull();
    expect(overlapsPeriod(g, discharged, "2024-07-18", "2024-09-21")).toBe("established");

    // Régime non attesté : non établi jusqu'à la borne, absent au-delà.
    const notAttested = gov({ currentAffairsAttested: false });
    expect(overlapsPeriod(notAttested, discharged, "2024-07-18", "2024-09-21")).toBe(
      "undocumented"
    );
    expect(overlapsPeriod(notAttested, discharged, "2024-07-21", "2024-09-21")).toBeNull();
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

  it("transition : un épisode qui entre et sort le même jour apporte ses deux preuves", () => {
    const all = [
      ep("x", {
        start: D,
        startEvidence: "ACT",
        end: D,
        endEvidence: "DATASET",
        endKind: "INDIVIDUAL",
      }),
      ep("y", { start: D }),
      ep("z", { end: D, endEvidence: "ACT", endKind: "INDIVIDUAL" }),
    ];
    const transition = documentedChanges(gov({ resignedAt: null }), all).find(
      (c) => c.kind === "transition"
    );
    expect(transition?.membershipIds).toEqual(["x", "y"]);
    expect(transition?.evidence).toBe("DATASET");
  });

  it("changement d'intitulé lié, ordre établi : source de l'ordre", () => {
    const all = [
      ep("old", {
        politicianId: "p-same",
        end: D,
        endEvidence: "ACT",
        endSourceUrl: "https://legifrance.gouv.fr/fin",
        endKind: "INDIVIDUAL",
      }),
      ep("new", {
        politicianId: "p-same",
        start: D,
        startSourceUrl: "https://legifrance.gouv.fr/debut",
        predecessorMembershipId: "old",
        sameDayOrderEstablished: true,
        sameDayOrderSourceUrl: "https://legifrance.gouv.fr/ordre",
      }),
    ];
    const changes = documentedChanges(gov({ resignedAt: null }), all).filter((c) => c.date === D);
    expect(changes).toEqual([
      {
        date: D,
        kind: "titleChange",
        membershipIds: ["old", "new"],
        evidence: "ACT",
        sourceUrl: "https://legifrance.gouv.fr/ordre",
      },
    ]);
  });

  it("remplacement lié par une autre personne, ordre établi : sortie et entrée", () => {
    const all = [
      ep("pred", {
        end: D,
        endEvidence: "ACT",
        endSourceUrl: "https://legifrance.gouv.fr/fin",
        endKind: "INDIVIDUAL",
      }),
      ep("succ", {
        start: D,
        startSourceUrl: "https://legifrance.gouv.fr/debut",
        predecessorMembershipId: "pred",
        sameDayOrderEstablished: true,
        sameDayOrderSourceUrl: "https://legifrance.gouv.fr/ordre",
      }),
    ];
    const changes = documentedChanges(gov({ resignedAt: null }), all).filter((c) => c.date === D);
    expect(changes).toEqual([
      {
        date: D,
        kind: "exit",
        membershipIds: ["pred"],
        evidence: "ACT",
        sourceUrl: "https://legifrance.gouv.fr/fin",
      },
      {
        date: D,
        kind: "entry",
        membershipIds: ["succ"],
        evidence: "ACT",
        sourceUrl: "https://legifrance.gouv.fr/debut",
      },
    ]);
  });

  it("changement d'intitulé non lié : la source d'ordre d'un autre remplacement n'est pas reprise", () => {
    const all = [
      ep("pred", { end: D, endEvidence: "ACT", endKind: "INDIVIDUAL" }),
      ep("old", {
        politicianId: "p-same",
        end: D,
        endEvidence: "ACT",
        endSourceUrl: "https://legifrance.gouv.fr/meme",
        endKind: "INDIVIDUAL",
      }),
      ep("new", {
        politicianId: "p-same",
        start: D,
        startSourceUrl: "https://legifrance.gouv.fr/meme",
        predecessorMembershipId: "pred",
        sameDayOrderEstablished: true,
        sameDayOrderSourceUrl: "https://legifrance.gouv.fr/ordre",
      }),
    ];
    const titleChange = documentedChanges(gov({ resignedAt: null }), all).find(
      (c) => c.kind === "titleChange"
    );
    expect(titleChange?.membershipIds).toEqual(["old", "new"]);
    expect(titleChange?.sourceUrl).toBe("https://legifrance.gouv.fr/meme");
  });

  it("épisode d'un seul jour : jamais apparié à lui-même", () => {
    const all = [
      ep("x", {
        start: D,
        startEvidence: "ACT",
        end: D,
        endEvidence: "ACT",
        endKind: "INDIVIDUAL",
      }),
    ];
    const changes = documentedChanges(gov({ resignedAt: null }), all).filter((c) => c.date === D);
    expect(changes.map((c) => c.kind)).toEqual(["exit", "entry"]);
    expect(changes.map((c) => c.membershipIds)).toEqual([["x"], ["x"]]);
  });
});

describe("defaultCompositionDate", () => {
  const resigned = (id: string) =>
    ep(id, {
      end: "2024-07-16",
      endEvidence: "ACT",
      endKind: "COLLECTIVE_RESIGNATION",
      lastConfirmedAt: null,
    });

  it("affaires courantes non attestées : la démission, pas la fin du gouvernement", () => {
    const g = gov({ currentAffairsAttested: false });
    const eps = [resigned("a"), resigned("b")];
    expect(ok(compositionAt(g, eps, "2024-09-21")).establishedPersons).toBe(0);
    expect(defaultCompositionDate(g, eps)).toBe("2024-07-16");
    expect(ok(compositionAt(g, eps, "2024-07-16")).establishedPersons).toBe(2);
  });

  it("affaires courantes attestées : la fin de la période", () => {
    const g = gov({ currentAffairsAttested: true });
    // endedAt is the successor's appointment day: the last caretaker day is the day before.
    expect(defaultCompositionDate(g, [resigned("a"), resigned("b")])).toBe("2024-09-20");
  });

  it("gouvernement en exercice : la date de dernière vérification", () => {
    const g = gov({
      resignedAt: null,
      resignedEvidence: null,
      endedAt: null,
      compositionVerifiedAt: "2024-06-01",
    });
    expect(defaultCompositionDate(g, [ep("a", { lastConfirmedAt: "2024-06-01" })])).toBe(
      "2024-06-01"
    );
  });

  it("repli sur la fin de la période quand rien n'est établi nulle part", () => {
    const g = gov({ currentAffairsAttested: false });
    expect(defaultCompositionDate(g, [])).toBe("2024-09-21");
  });

  it("renvoie null sans période consultable", () => {
    expect(defaultCompositionDate(gov({ formedAt: null }), [])).toBeNull();
  });
});

describe("lastCaretakerDay", () => {
  const g = {
    currentAffairsAttested: true,
    resignedEvidence: "ACT" as const,
    endedAt: "2024-09-21",
  };
  const collective = { endKind: "COLLECTIVE_RESIGNATION" as const, currentAffairsEndedAt: null };

  it("la veille de la fin du gouvernement", () => {
    expect(lastCaretakerDay(g, collective)).toBe("2024-09-20");
  });
  it("la borne individuelle ne peut que raccourcir", () => {
    expect(lastCaretakerDay(g, { ...collective, currentAffairsEndedAt: "2024-08-01" })).toBe(
      "2024-08-01"
    );
    expect(lastCaretakerDay(g, { ...collective, currentAffairsEndedAt: "2024-10-01" })).toBe(
      "2024-09-20"
    );
  });
  it("null hors régime attesté, sans fin connue ou pour une fin individuelle", () => {
    expect(lastCaretakerDay({ ...g, currentAffairsAttested: false }, collective)).toBeNull();
    expect(lastCaretakerDay({ ...g, resignedEvidence: "DATASET" }, collective)).toBeNull();
    expect(lastCaretakerDay({ ...g, endedAt: null }, collective)).toBeNull();
    expect(lastCaretakerDay(g, { ...collective, endKind: "INDIVIDUAL" })).toBeNull();
  });
});
