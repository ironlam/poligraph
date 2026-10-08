import { describe, it, expect } from "vitest";
import type { AffairEventType } from "@/generated/prisma";
import { EVENT_TYPE_ORDER, sortEvents } from "../order";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("sortEvents", () => {
  it("trie par date croissante", () => {
    const sorted = sortEvents([
      { id: "b", date: d("2024-06-01"), type: "PROCES" as AffairEventType },
      { id: "a", date: d("2020-01-01"), type: "JUGEMENT" as AffairEventType },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("même jour : plainte avant enquête préliminaire", () => {
    const sorted = sortEvents([
      { date: d("2024-05-13"), type: "ENQUETE_PRELIMINAIRE" as AffairEventType },
      { date: d("2024-05-13"), type: "PLAINTE" as AffairEventType },
    ]);
    expect(sorted.map((e) => e.type)).toEqual(["PLAINTE", "ENQUETE_PRELIMINAIRE"]);
  });

  it("même jour : jugement avant appel", () => {
    const sorted = sortEvents([
      { date: d("2024-05-13"), type: "APPEL" as AffairEventType },
      { date: d("2024-05-13"), type: "JUGEMENT" as AffairEventType },
    ]);
    expect(sorted.map((e) => e.type)).toEqual(["JUGEMENT", "APPEL"]);
  });

  it("même jour : convocation avant procès, faits en premier", () => {
    const sorted = sortEvents([
      { date: d("2024-05-13"), type: "PROCES" as AffairEventType },
      { date: d("2024-05-13"), type: "CONVOCATION_TRIBUNAL" as AffairEventType },
      { date: d("2024-05-13"), type: "FAITS" as AffairEventType },
    ]);
    expect(sorted.map((e) => e.type)).toEqual(["FAITS", "CONVOCATION_TRIBUNAL", "PROCES"]);
  });

  it("garde l'ordre d'entrée à égalité et ne modifie pas l'entrée", () => {
    const input = [
      { id: "1", date: d("2024-05-13"), type: "AUTRE" as AffairEventType },
      { id: "2", date: d("2024-05-13"), type: "AUTRE" as AffairEventType },
    ];
    const reversed = [...input].reverse();
    expect(sortEvents(input).map((e) => e.id)).toEqual(["1", "2"]);
    expect(sortEvents(reversed).map((e) => e.id)).toEqual(["2", "1"]);
    expect(input.map((e) => e.id)).toEqual(["1", "2"]);
  });
});

describe("EVENT_TYPE_ORDER", () => {
  it("donne un rang distinct à chaque type", () => {
    const ranks = Object.values(EVENT_TYPE_ORDER);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ranks).toHaveLength(32);
    expect(EVENT_TYPE_ORDER.FAITS).toBe(0);
    expect(EVENT_TYPE_ORDER.REVELATION).toBe(EVENT_TYPE_ORDER.PLAINTE + 1);
  });
});
