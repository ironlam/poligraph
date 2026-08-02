import { describe, it, expect } from "vitest";
import { Prisma } from "@/generated/prisma";
import {
  buildAbsorbedSnapshot,
  absorbedAffairSelect,
  ABSORBED_SNAPSHOT_VERSION,
  type AbsorbedAffairRow,
} from "@/services/affairs/absorbed-snapshot";

/**
 * A merge deletes the absorbed row. What these tests hold is that the editorial
 * fields stay readable in the audit trail afterwards (#534) — most of all the
 * description, which is what merges used to be decided by, since the survivor was
 * chosen for being the richer row rather than the right one.
 */

function row(overrides: Partial<AbsorbedAffairRow> = {}): AbsorbedAffairRow {
  return {
    id: "aff_absorbed",
    publicId: "AF-000123",
    slug: "plainte-classee-sans-suite",
    oldSlugs: ["ancien-slug"],
    title: "Plainte classée sans suite",
    description: "Le parquet a classé la plainte sans suite le 3 mars 2026.",
    category: "PRISE_ILLEGALE_INTERETS",
    status: "CLASSEMENT_SANS_SUITE",
    involvement: "DIRECT",
    involvementNote: null,
    subjectLabel: "Lagardère News",
    subjectKind: "ORGANISATION",
    subjectNote: "Groupe de presse",
    severity: "SIGNIFICATIF",
    isRelatedToMandate: true,
    publicationStatus: "DRAFT",
    factsDate: new Date("2025-06-01T00:00:00.000Z"),
    startDate: null,
    verdictDate: new Date("2026-03-03T00:00:00.000Z"),
    court: "Parquet de Paris",
    caseNumber: "2026/00042",
    sentence: null,
    prisonMonths: null,
    prisonFirmMonths: null,
    fineAmount: new Prisma.Decimal("12345.67"),
    ineligibilityMonths: null,
    ineligibilityFirmMonths: null,
    communityService: null,
    otherSentence: null,
    confidenceScore: 80,
    rejectionReason: null,
    linkedAffairId: null,
    ...overrides,
  } as AbsorbedAffairRow;
}

describe("buildAbsorbedSnapshot", () => {
  it("garde la description, ce que la fusion faisait disparaître", () => {
    const snap = buildAbsorbedSnapshot(row());
    expect(snap.description).toBe("Le parquet a classé la plainte sans suite le 3 mars 2026.");
  });

  it("porte un numéro de version, pour qu'un lecteur sache ce qu'il tient", () => {
    expect(buildAbsorbedSnapshot(row()).version).toBe(ABSORBED_SNAPSHOT_VERSION);
  });

  it("garde l'état procédural et les dates", () => {
    const snap = buildAbsorbedSnapshot(row());
    expect(snap.status).toBe("CLASSEMENT_SANS_SUITE");
    expect(snap.category).toBe("PRISE_ILLEGALE_INTERETS");
    expect(snap.factsDate).toBe("2025-06-01T00:00:00.000Z");
    expect(snap.verdictDate).toBe("2026-03-03T00:00:00.000Z");
    expect(snap.startDate).toBeNull();
  });

  it("rend l'amende en chaîne, pas en nombre flottant", () => {
    // Un decimal Postgres passé par un float perd des centimes, sur les chiffres
    // mêmes que ce projet existe pour énoncer exactement.
    const snap = buildAbsorbedSnapshot(row());
    expect(snap.fineAmount).toBe("12345.67");
    expect(typeof snap.fineAmount).toBe("string");
  });

  it("garde les identifiants publics et les anciens slugs", () => {
    const snap = buildAbsorbedSnapshot(row());
    expect(snap.publicId).toBe("AF-000123");
    expect(snap.oldSlugs).toEqual(["ancien-slug"]);
  });

  it("n'émet aucun undefined sur une ligne complète", () => {
    const snap = buildAbsorbedSnapshot(row());
    for (const [key, value] of Object.entries(snap)) {
      expect(value, `${key} ne doit pas être undefined`).not.toBeUndefined();
    }
  });

  it("ramène à null un champ optionnel absent de la ligne", () => {
    // Les champs obligatoires ne sont pas protégés : Prisma les renvoie toujours,
    // et un undefined visible sur l'un d'eux est un symptôme qu'il vaut mieux voir
    // que masquer. Les optionnels, si : undefined et null y sont deux entrées
    // différentes, et JSON.stringify supprime la première sans bruit.
    const partial = {
      id: "x",
      slug: "s",
      title: "t",
      description: "d",
      category: "AUTRE",
      status: "ENQUETE_PRELIMINAIRE",
    } as AbsorbedAffairRow;
    const snap = buildAbsorbedSnapshot(partial);
    const roundTripped = JSON.parse(JSON.stringify(snap)) as Record<string, unknown>;

    for (const field of ["fineAmount", "court", "caseNumber", "publicId", "involvementNote"]) {
      expect(snap[field], `${field} doit être null, pas undefined`).toBeNull();
      expect(roundTripped, `${field} doit survivre au passage en JSON`).toHaveProperty(field);
    }
  });

  it("ne copie aucune relation déjà transférée au survivant", () => {
    // Sources, événements et liens d'articles sont déplacés ligne par ligne : les
    // dupliquer ici gonflerait la table d'audit sans rien préserver.
    const selected = Object.keys(absorbedAffairSelect);
    for (const relation of ["sources", "events", "pressArticles", "courtDecisions"]) {
      expect(selected).not.toContain(relation);
    }
  });

  it("n'emporte pas la description pré-enrichissement", () => {
    // Artefact de rollback interne, pas une affirmation de la fiche.
    expect(Object.keys(absorbedAffairSelect)).not.toContain("originalDescription");
  });
});
