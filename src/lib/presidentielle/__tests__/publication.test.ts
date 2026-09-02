import { describe, expect, it } from "vitest";
import {
  PUBLIC_HUB_CANDIDACY_WHERE,
  PUBLIC_PRESIDENTIAL_FICHE_WHERE,
  PUBLIC_PRESIDENTIAL_MEASURE_WHERE,
} from "../publication";

describe("autorités publiques du corpus présidentiel", () => {
  it("exige une identité sourcée et un politique public pour le champ du hub", () => {
    expect(PUBLIC_HUB_CANDIDACY_WHERE).toEqual(
      expect.objectContaining({
        status: { not: null },
        sourceUrl: { not: null },
        sourceLabel: { not: null },
        politicianId: { not: null },
        politician: { is: { publicationStatus: "PUBLISHED" } },
      })
    );
  });

  it("ajoute à la fiche une extension publiée et une mesure primaire actuellement défendue", () => {
    expect(PUBLIC_PRESIDENTIAL_FICHE_WHERE.presidentialData).toEqual({
      is: { publicationStatus: "PUBLISHED" },
    });
    expect(JSON.stringify(PUBLIC_PRESIDENTIAL_FICHE_WHERE.measures)).toContain(
      '"withdrawnAt":null'
    );
    expect(JSON.stringify(PUBLIC_PRESIDENTIAL_FICHE_WHERE.measures)).toContain('"tier":"PRIMARY"');
  });

  it("ferme les mesures retirées et compose la porte complète de leur fiche", () => {
    expect(PUBLIC_PRESIDENTIAL_MEASURE_WHERE.withdrawnAt).toBeNull();
    expect(PUBLIC_PRESIDENTIAL_MEASURE_WHERE.candidacy).toEqual({
      is: PUBLIC_PRESIDENTIAL_FICHE_WHERE,
    });
  });
});
