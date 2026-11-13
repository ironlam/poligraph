import { describe, it, expect } from "vitest";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_DESCRIPTIONS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
} from "@/config/labels";
import { getCertaintyLevel } from "@/config/certainty";
import { getJudicialMaturity, CONDAMNATION_STATUSES } from "@/config/judicial-maturity";
import { getAffairNoticeVariant } from "@/components/affairs/AffairStatusNotice";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import { VALID_STATUSES } from "@/lib/security/schemas/affair";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";
import { OPEN_STATUSES, TERMINAL_STATUSES } from "@/lib/affairs/monitoring/cadence";

/**
 * Issue #1281 : `CONDAMNATION_EN_APPEL`, condamnation prononcée ou confirmée par une cour
 * d'appel, sans pourvoi connu. Aucun registre public ne dit si un pourvoi a été formé, donc
 * ce n'est ni `POURVOI_EN_CASSATION` (qui affirme qu'il l'a été) ni `CONDAMNATION_DEFINITIVE`
 * (qui affirme que les recours sont épuisés).
 *
 * Invariant : c'est une condamnation (elle compte dans les agrégats à charge), elle n'est
 * pas définitive, et son libellé ne prétend rien sur le pourvoi.
 */

const STATUS = "CONDAMNATION_EN_APPEL" as const;

describe("CONDAMNATION_EN_APPEL : c'est une condamnation", () => {
  it("relève du niveau « condamnation » de la maturité judiciaire", () => {
    expect(getJudicialMaturity(STATUS)).toBe("CONDAMNATION");
    expect(CONDAMNATION_STATUSES).toContain(STATUS);
  });

  it("entre dans l'agrégat public des condamnations", () => {
    const where = getConvictionOnlyWhere();
    expect((where.status as { in: string[] }).in).toContain(STATUS);
  });

  it("compte comme condamnation non définitive, jamais comme définitive", () => {
    const counts = computeJudicialCounts([
      { involvement: "DIRECT", status: STATUS, jurisdictionOrder: "PENAL" },
    ]);
    expect(counts.condamnationsNonDefinitives).toBe(1);
    expect(counts.condamnationsDefinitives).toBe(0);
  });

  it("est acceptée par la validation Zod de la modération", () => {
    expect(VALID_STATUSES).toContain(STATUS);
  });
});

describe("CONDAMNATION_EN_APPEL : elle n'est pas définitive", () => {
  it("porte la certitude « prononcée », pas « établie »", () => {
    expect(getCertaintyLevel(STATUS)).toBe("PRONONCE");
  });

  it("garde la présomption d'innocence", () => {
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION[STATUS]).toBe(true);
  });

  it("affiche un encart dédié, ni « pourvoi » ni « définitive »", () => {
    expect(getAffairNoticeVariant(STATUS, "DIRECT")).toBe("en_appel");
  });

  it("surveille l'affaire : ouverte, pas terminale", () => {
    expect(OPEN_STATUSES.has(STATUS)).toBe(true);
    expect(TERMINAL_STATUSES.has(STATUS)).toBe(false);
  });
});

describe("CONDAMNATION_EN_APPEL : le texte public n'affirme rien d'inconnu", () => {
  it("le libellé ne parle pas de pourvoi formé", () => {
    expect(AFFAIR_STATUS_LABELS[STATUS]).toBe("Condamnation en appel");
    expect(AFFAIR_STATUS_LABELS[STATUS].toLowerCase()).not.toContain("pourvoi");
  });

  // Le délai de pourvoi est de 5 jours francs : « reste possible » serait faux dès la semaine
  // suivante. On ne sait pas s'il a été formé, et sans pourvoi la condamnation est définitive.
  it("la description dit que le pourvoi a pu être formé, sans l'affirmer ni le nier", () => {
    const text = AFFAIR_STATUS_DESCRIPTIONS[STATUS];
    expect(text).toContain("a pu être formé");
    expect(text).toContain("aucun registre public");
    expect(text).not.toContain("reste possible");
  });
});
