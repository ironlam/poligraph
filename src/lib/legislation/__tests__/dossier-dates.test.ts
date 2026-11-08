import { describe, expect, it } from "vitest";
import { resolveFilingDate } from "../dossier-dates";

describe("resolveFilingDate", () => {
  it("prend la date du dépôt initial, pas la plus ancienne date d'un acte quelconque", () => {
    // PLF 2027 : une nomination de rapporteur du 2025-10-02 précède le dépôt réel du 2026-10-01.
    const result = resolveFilingDate("2026-10-01T00:00:00.000+02:00", [
      new Date("2025-10-02T00:00:00.000+02:00"),
      new Date("2026-10-01T00:00:00.000+02:00"),
    ]);
    expect(result.filingDate?.toISOString()).toBe("2026-09-30T22:00:00.000Z");
  });

  it("fournit pour le slug le jour calendaire français, pas le jour UTC", () => {
    // minuit à Paris = la veille à 22h UTC : un toISOString() brut donnerait 2026-09-30.
    const result = resolveFilingDate("2026-10-01T00:00:00.000+02:00", []);
    expect(result.slugDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("retombe sur la plus ancienne date connue quand aucun dépôt n'est documenté", () => {
    const result = resolveFilingDate(null, [
      new Date("2024-03-05T10:00:00.000Z"),
      new Date("2024-02-01T10:00:00.000Z"),
    ]);
    expect(result.filingDate?.toISOString()).toBe("2024-02-01T10:00:00.000Z");
    expect(result.slugDate?.toISOString().slice(0, 10)).toBe("2024-02-01");
  });

  it("ignore une date de dépôt illisible", () => {
    const result = resolveFilingDate("pas une date", [new Date("2024-02-01T10:00:00.000Z")]);
    expect(result.filingDate?.toISOString()).toBe("2024-02-01T10:00:00.000Z");
  });

  it("renvoie null quand rien n'est connu", () => {
    expect(resolveFilingDate(null, [])).toEqual({ filingDate: null, slugDate: null });
  });
});
