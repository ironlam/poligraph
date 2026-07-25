import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue #536 — structural guarantees of the CourtDecision model.
 *
 * Read from the schema file rather than exercised against a database: this
 * repository's local `.env` points at production, so a test that writes rows would
 * write them there. What matters here is not that Prisma can insert — it can — but
 * that the guarantees the design rests on cannot be removed without a test failing.
 *
 * Behavioural tests (create, link, unlink) land with the service in PR 2, where
 * there is code to exercise.
 */

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`);
  expect(start, `model ${name} absent du schéma`).toBeGreaterThan(-1);
  const end = schema.indexOf("\n}", start);
  return schema.slice(start, end);
}

describe("CourtDecision — identité de la décision (#536)", () => {
  const model = modelBlock("CourtDecision");

  it("rend ecli unique : un ECLI identifie exactement une décision", () => {
    expect(model).toMatch(/ecli\s+String\?\s+@unique/);
  });

  it("rend judilibreId unique : c'est une clé externe", () => {
    expect(model).toMatch(/judilibreId\s+String\?\s+@unique/);
  });

  it("NE rend PAS le pourvoi unique, ni brut ni normalisé", () => {
    // Un même pourvoi peut produire plusieurs décisions (rejet, cassation
    // partielle, renvoi). Rendre ce champ unique interdirait de les enregistrer.
    expect(model).not.toMatch(/pourvoiNumber\s+String\?\s+@unique/);
    expect(model).not.toMatch(/pourvoiNumberNormalized\s+String\?\s+@unique/);
  });

  it("indexe la forme normalisée du pourvoi, pour rapprocher sans dédupliquer", () => {
    expect(model).toMatch(/@@index\(\[pourvoiNumberNormalized\]\)/);
    expect(model).toMatch(/pourvoiNumberNormalized\s+String\?/);
  });

  it("garde une forme d'affichage distincte de la forme normalisée", () => {
    expect(model).toMatch(/pourvoiNumber\s+String\?/);
  });

  it("porte la juridiction, la chambre, la date et le sens de la décision", () => {
    for (const field of ["decisionDate", "court", "chamber", "solution", "sourceUrl"]) {
      expect(model, `${field} absent`).toContain(field);
    }
  });

  it("n'ajoute ni caseNumber ni caseNumbers", () => {
    // Différés : à 0 ligne, et les deux champs d'`Affair` ne veulent pas dire la
    // même chose (l'un est affiché et saisi à la main, l'autre sert au
    // rapprochement machine). Les recopier importerait cette confusion.
    expect(model).not.toContain("caseNumber");
  });
});

describe("AffairCourtDecision — la liaison (#536)", () => {
  const model = modelBlock("AffairCourtDecision");

  it("interdit deux fois la même liaison, par sa clé primaire composite", () => {
    expect(model).toMatch(/@@id\(\[affairId,\s*courtDecisionId\]\)/);
  });

  it("est supprimée avec l'affaire, jamais l'inverse", () => {
    expect(model).toMatch(/affair\s+Affair\s+@relation\([^)]*onDelete: Cascade/);
  });

  it("est supprimée avec la décision, jamais l'inverse", () => {
    expect(model).toMatch(/courtDecision\s+CourtDecision\s+@relation\([^)]*onDelete: Cascade/);
  });

  it("n'a pas d'enum de relation", () => {
    // Un seul cas réel observé ne peut pas justifier cinq valeurs, dont certaines
    // relèvent de #516 ou décrivent une relation entre deux décisions.
    expect(model).not.toContain("relationType");
    expect(schema).not.toContain("enum CourtDecisionRelation");
    expect(schema).not.toContain("enum JudicialDecisionRelation");
  });

  it("garde un champ de notes libre en attendant assez de cas", () => {
    expect(model).toMatch(/notes\s+String\?/);
  });

  it("indexe le côté décision, pour lister les affaires d'une décision", () => {
    expect(model).toMatch(/@@index\(\[courtDecisionId\]\)/);
  });
});

describe("Affair — ce que cette PR ne touche pas (#536)", () => {
  const model = modelBlock("Affair");

  it("expose la relation inverse", () => {
    expect(model).toMatch(/courtDecisions\s+AffairCourtDecision\[\]/);
  });

  it("conserve ses identifiants historiques et leur contrainte", () => {
    // La transition les garde en place ; leur retrait est une PR ultérieure, et
    // `ecli @unique` ne peut être levée qu'après peuplement et lecture de la
    // décision.
    expect(model).toMatch(/ecli\s+String\?\s+@unique/);
    for (const field of [
      "pourvoiNumber",
      "caseNumber",
      "caseNumbers",
      "chamber",
      "court",
      "verdictDate",
    ]) {
      expect(model, `${field} retiré d'Affair`).toContain(field);
    }
  });
});
