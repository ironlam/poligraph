import { describe, it, expect } from "vitest";
import { AFFAIR_EXPORT_COLUMNS } from "@/app/api/export/affaires/columns";

/**
 * The CSV is consumed by scripts, so its header set and order are a contract. Issue #576
 * replaces a boolean column with a month count, which is a breaking change: a line in the
 * PR description does not catch a later accidental reorder, a test does.
 */
describe("contrat de colonnes de l'export affaires", () => {
  const keys = AFFAIR_EXPORT_COLUMNS.map((c) => c.key);

  it("ne porte plus la colonne booléenne de sursis", () => {
    expect(keys).not.toContain("prisonSuspended");
    expect(AFFAIR_EXPORT_COLUMNS.map((c) => c.header)).not.toContain("Prison avec sursis");
  });

  it("place chaque part ferme juste après son total", () => {
    expect(keys.indexOf("prisonFirmMonths")).toBe(keys.indexOf("prisonMonths") + 1);
    expect(keys.indexOf("ineligibilityFirmMonths")).toBe(keys.indexOf("ineligibilityMonths") + 1);
  });

  it("nomme les colonnes sans employer « ferme » pour l'inéligibilité", () => {
    // « inéligibilité ferme » n'est pas la langue des arrêts.
    const headers = AFFAIR_EXPORT_COLUMNS.map((c) => c.header);
    expect(headers).toContain("Prison, part non assortie du sursis (mois)");
    expect(headers).toContain("Inéligibilité, part non assortie du sursis (mois)");
  });

  it("n'a ni clé ni en-tête en double", () => {
    expect(new Set(keys).size).toBe(keys.length);
    const headers = AFFAIR_EXPORT_COLUMNS.map((c) => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });
});
