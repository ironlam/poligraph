import { describe, expect, it } from "vitest";
import type { AffairStatus } from "@/generated/prisma";
import { planReconcile, type MonitoringState } from "../reconcile-plan";

const d = (s: string) => new Date(s + "T00:00:00Z");

const published = { publicationStatus: "PUBLISHED", involvement: "DIRECT" } as const;
const affair = (status: AffairStatus) => ({ status, ...published });

function state(over: Partial<MonitoringState> = {}): MonitoringState {
  return {
    active: true,
    nextReviewAt: d("2027-01-01"),
    dueReason: "CADENCE",
    dueNote: null,
    dateOrigin: "CADENCE",
    statusAtSchedule: "PROCES_EN_COURS",
    flaggedReason: "SIGNAL",
    consecutiveAutoDeferrals: 2,
    ...over,
  };
}

describe("planReconcile, hors périmètre", () => {
  const draft = {
    status: "MISE_EN_EXAMEN",
    publicationStatus: "DRAFT",
    involvement: "DIRECT",
  } as const;
  it("ne crée rien pour un brouillon", () => {
    expect(planReconcile(draft, null, d("2026-10-07"))).toEqual({ kind: "noop" });
  });
  it("désactive un suivi actif sans toucher la date", () => {
    expect(planReconcile(draft, state(), d("2026-10-07"))).toEqual({
      kind: "update",
      data: { active: false },
    });
  });
  it("laisse en l'état un suivi déjà inactif", () => {
    expect(planReconcile(draft, state({ active: false }), d("2026-10-07"))).toEqual({
      kind: "noop",
    });
  });
});

describe("planReconcile, création", () => {
  it("crée un suivi à cadence pour une affaire ouverte", () => {
    expect(planReconcile(affair("MISE_EN_EXAMEN"), null, d("2026-10-07"))).toEqual({
      kind: "create",
      data: {
        active: true,
        nextReviewAt: d("2027-04-07"),
        dueReason: "CADENCE",
        dueNote: null,
        dateOrigin: "CADENCE",
        statusAtSchedule: "MISE_EN_EXAMEN",
        flaggedReason: null,
        consecutiveAutoDeferrals: 0,
      },
    });
  });
  it("ne crée rien pour un statut terminal", () => {
    expect(planReconcile(affair("RELAXE"), null, d("2026-10-07"))).toEqual({ kind: "noop" });
  });
});

describe("planReconcile, réactivation", () => {
  it("réactive un suivi HUMAN devenu publié en gardant la date", () => {
    const cur = state({
      active: false,
      dateOrigin: "HUMAN",
      dueReason: "DELIBERE",
      nextReviewAt: d("2026-12-02"),
      flaggedReason: null,
      consecutiveAutoDeferrals: 0,
    });
    expect(planReconcile(affair("PROCES_EN_COURS"), cur, d("2026-11-20"))).toEqual({
      kind: "update",
      data: { active: true },
    });
  });
  it("ne réactive pas un suivi inactif sur un statut terminal", () => {
    const cur = state({ active: false, statusAtSchedule: "RELAXE" });
    expect(planReconcile(affair("RELAXE"), cur, d("2026-12-02"))).toEqual({ kind: "noop" });
  });
});

describe("planReconcile, changement de statut", () => {
  const today = d("2026-10-07");
  it("recalcule la cadence depuis aujourd'hui quand la date est de cadence", () => {
    expect(planReconcile(affair("CONDAMNATION_PREMIERE_INSTANCE"), state(), today)).toEqual({
      kind: "update",
      data: {
        nextReviewAt: d("2027-01-07"),
        dueReason: "CADENCE",
        dueNote: null,
        dateOrigin: "CADENCE",
        statusAtSchedule: "CONDAMNATION_PREMIERE_INSTANCE",
        flaggedReason: null,
        consecutiveAutoDeferrals: 0,
      },
    });
  });
  it("garde une date HUMAN strictement future et sa note", () => {
    const cur = state({
      dateOrigin: "HUMAN",
      dueReason: "AUDIENCE",
      dueNote: "Audience fixée par le tribunal",
      nextReviewAt: d("2026-10-08"),
    });
    expect(planReconcile(affair("CONDAMNATION_PREMIERE_INSTANCE"), cur, today)).toEqual({
      kind: "update",
      data: { statusAtSchedule: "CONDAMNATION_PREMIERE_INSTANCE", flaggedReason: null },
    });
  });
  it("recalcule quand la date HUMAN est passée ou égale à aujourd'hui", () => {
    const past = state({ dateOrigin: "HUMAN", nextReviewAt: d("2026-10-01") });
    const equal = state({ dateOrigin: "HUMAN", nextReviewAt: today });
    for (const cur of [past, equal]) {
      expect(planReconcile(affair("APPEL_EN_COURS"), cur, today)).toMatchObject({
        kind: "update",
        data: { nextReviewAt: d("2026-11-07"), dateOrigin: "CADENCE" },
      });
    }
  });
  it("efface la note d'une date HUMAN remplacée par la cadence", () => {
    const cur = state({
      dateOrigin: "HUMAN",
      dueReason: "DELIBERE",
      dueNote: "Délibéré annoncé",
      nextReviewAt: d("2026-10-01"),
    });
    expect(planReconcile(affair("APPEL_EN_COURS"), cur, today)).toMatchObject({
      kind: "update",
      data: { nextReviewAt: d("2026-11-07"), dueReason: "CADENCE", dueNote: null },
    });
  });
  it("passe en DELAI_RECOURS à +2 mois pour une relaxe", () => {
    expect(planReconcile(affair("RELAXE"), state(), today)).toMatchObject({
      kind: "update",
      data: {
        nextReviewAt: d("2026-12-07"),
        dueReason: "DELAI_RECOURS",
        dateOrigin: "CADENCE",
      },
    });
  });
});

describe("planReconcile, rien à faire", () => {
  it("ne fait rien quand le statut n'a pas changé", () => {
    expect(planReconcile(affair("PROCES_EN_COURS"), state(), d("2026-10-07"))).toEqual({
      kind: "noop",
    });
  });
});
