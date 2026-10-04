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

const hashOf = (doc: PoliticianProfileDocument) =>
  hashSerializedDocument(serializeProfileDocument(doc));

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

  it("ignore un updatedAt de mandat dans l'empreinte", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    (a.identity.mandates[0] as unknown as Record<string, unknown>).updatedAt = new Date(
      "2026-09-01T10:00:00.000Z"
    );
    (b.identity.mandates[0] as unknown as Record<string, unknown>).updatedAt = new Date(
      "2026-10-02T04:00:00.000Z"
    );
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it("ignore identity.updatedAt, même un autre jour (décision du propriétaire)", () => {
    const later = sampleDocument();
    later.identity.updatedAt = new Date("2026-09-15T08:00:00.000Z");
    expect(hashOf(later)).toBe(hashOf(sampleDocument()));
  });

  it("ignore le lastConfirmedAt d'un mandat réécrit à chaque sync", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    (a.identity.mandates[0] as unknown as Record<string, unknown>).lastConfirmedAt = new Date(
      "2026-09-01T04:00:00.000Z"
    );
    (b.identity.mandates[0] as unknown as Record<string, unknown>).lastConfirmedAt = new Date(
      "2026-09-02T04:00:00.000Z"
    );
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it("ignore tout …CheckedAt, à toute profondeur", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    const stamp = (doc: PoliticianProfileDocument, iso: string) => {
      const identity = doc.identity as unknown as Record<string, unknown>;
      identity.photoCheckedAt = new Date(iso);
      identity.careerCheckedAt = new Date(iso);
      identity.webSearchCheckedAt = new Date(iso);
      (doc.dossier.affairs[0] as unknown as Record<string, unknown>).exposeCheckedAt = new Date(
        iso
      );
    };
    stamp(a, "2026-09-01T04:00:00.000Z");
    stamp(b, "2026-09-20T04:00:00.000Z");
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it("ignore les horodatages de traitement d'une affaire, jamais affichés", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    for (const [doc, iso] of [
      [a, "2026-09-01T04:00:00.000Z"],
      [b, "2026-09-20T04:00:00.000Z"],
    ] as const) {
      const affair = doc.dossier.affairs[0] as unknown as Record<string, unknown>;
      affair.descriptionEnrichedAt = new Date(iso);
      affair.slappQualifiedAt = new Date(iso);
      affair.verifiedAt = new Date(iso);
    }
    expect(hashOf(a)).toBe(hashOf(b));
  });

  it("garde biographyGeneratedAt, affiché sous la biographie", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    (a.identity as unknown as Record<string, unknown>).biographyGeneratedAt = new Date(
      "2026-09-01T04:00:00.000Z"
    );
    (b.identity as unknown as Record<string, unknown>).biographyGeneratedAt = new Date(
      "2026-09-20T04:00:00.000Z"
    );
    expect(hashOf(a)).not.toBe(hashOf(b));
  });

  it("ne retire verifiedAt qu'au niveau d'une affaire", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    (a.identity as unknown as Record<string, unknown>).verifiedAt = new Date("2026-09-01");
    (b.identity as unknown as Record<string, unknown>).verifiedAt = new Date("2026-09-20");
    expect(hashOf(a)).not.toBe(hashOf(b));
  });

  it("garde le createdAt d'une affaire, dernier critère de tri affiché", () => {
    const a = sampleDocument();
    const b = sampleDocument();
    (a.dossier.affairs[0] as unknown as Record<string, unknown>).createdAt = new Date(
      "2025-01-01T00:00:00.000Z"
    );
    (b.dossier.affairs[0] as unknown as Record<string, unknown>).createdAt = new Date(
      "2025-06-01T00:00:00.000Z"
    );
    expect(hashOf(a)).not.toBe(hashOf(b));
  });

  it("change d'empreinte quand un champ affiché change", () => {
    const renamed = sampleDocument();
    renamed.identity.fullName = "Jeanne Autre";
    expect(hashOf(renamed)).not.toBe(hashOf(sampleDocument()));
  });

  it("stocke les horodatages ignorés par l'empreinte", () => {
    const doc = sampleDocument();
    (doc.identity.mandates[0] as unknown as Record<string, unknown>).updatedAt = new Date(
      "2026-10-02T04:00:00.000Z"
    );
    const out = serializeProfileDocument(doc) as {
      identity: { updatedAt: unknown; mandates: { updatedAt: unknown }[] };
    };
    expect(out.identity.mandates[0]!.updatedAt).toEqual({ $date: "2026-10-02T04:00:00.000Z" });
    expect(out.identity.updatedAt).toEqual({ $date: "2026-09-01T10:00:00.000Z" });
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
