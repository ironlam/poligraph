import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  deserializeProfileDocument,
  hashSerializedDocument,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "../document";

// Fictitious fixture. The real identity/dossier types are deep Prisma payloads, so the fixture
// carries only the fields these tests exercise.
function sampleDocument(
  fineAmount: unknown = new Prisma.Decimal("1500.50")
): PoliticianProfileDocument {
  return {
    identity: {
      id: "pol_1",
      slug: "jeanne-exemple",
      fullName: "Jeanne Exemple",
      updatedAt: new Date("2026-09-01T10:00:00.000Z"),
      deathDate: null,
      mandates: [{ id: "m1", startDate: new Date("2024-07-08T00:00:00.000Z"), endDate: null }],
    },
    dossier: {
      affairs: [
        {
          id: "a1",
          fineAmount,
          events: [{ date: new Date("2025-03-02T00:00:00.000Z"), label: "Audience" }],
        },
      ],
    },
    voteStats: null,
    mandateType: "DEPUTE",
  } as unknown as PoliticianProfileDocument;
}

describe("document de fiche politicien", () => {
  it("restitue exactement le document, dates comprises", () => {
    const doc = sampleDocument(1500.5);
    const back = deserializeProfileDocument(serializeProfileDocument(doc) as Prisma.JsonValue);
    expect(back).toEqual(doc);
    const identity = back.identity as unknown as {
      updatedAt: Date;
      mandates: { startDate: Date }[];
    };
    expect(identity.updatedAt).toBeInstanceOf(Date);
    expect(identity.mandates[0]!.startDate).toBeInstanceOf(Date);
  });

  it("donne la même empreinte quel que soit l'ordre des clés", () => {
    expect(hashSerializedDocument({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashSerializedDocument({ b: { d: 3, c: 2 }, a: 1 })
    );
  });

  it("garde l'ordre des tableaux dans l'empreinte", () => {
    expect(hashSerializedDocument({ a: [1, 2] })).not.toBe(hashSerializedDocument({ a: [2, 1] }));
  });

  it("change d'empreinte quand une date change d'une milliseconde", () => {
    const a = serializeProfileDocument(sampleDocument());
    const later = sampleDocument();
    later.identity.updatedAt = new Date(later.identity.updatedAt.getTime() + 1);
    expect(hashSerializedDocument(a)).not.toBe(
      hashSerializedDocument(serializeProfileDocument(later))
    );
  });

  it("convertit un Decimal en nombre", () => {
    const out = serializeProfileDocument(sampleDocument()) as {
      dossier: { affairs: { fineAmount: unknown }[] };
    };
    expect(out.dossier.affairs[0]!.fineAmount).toBe(1500.5);
  });

  it("abandonne les propriétés undefined et garde null", () => {
    const doc = { ...sampleDocument(), voteStats: null } as PoliticianProfileDocument;
    (doc.identity as unknown as Record<string, unknown>).extra = undefined;
    const out = serializeProfileDocument(doc) as { identity: object; voteStats: unknown };
    expect("extra" in out.identity).toBe(false);
    expect(out.voteStats).toBeNull();
  });

  it("refuse un bigint en nommant son chemin", () => {
    const doc = sampleDocument();
    (doc.identity as unknown as Record<string, unknown>).big = BigInt(1);
    expect(() => serializeProfileDocument(doc)).toThrow(
      "profile-snapshot: valeur non sérialisable à identity.big"
    );
  });

  it("refuse une fonction en nommant son chemin", () => {
    const doc = sampleDocument();
    (doc.identity as unknown as Record<string, unknown>).fn = () => 1;
    expect(() => serializeProfileDocument(doc)).toThrow(/valeur non sérialisable à identity\.fn/);
  });
});
