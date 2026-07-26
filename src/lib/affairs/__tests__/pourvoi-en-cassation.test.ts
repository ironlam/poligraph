import { describe, it, expect } from "vitest";
import { AffairStatus } from "@/generated/prisma";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_STATUS_DESCRIPTIONS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
} from "@/config/labels";
import { getCertaintyLevel, CERTAINTY_LABELS } from "@/config/certainty";
import { getJudicialMaturity, CONDAMNATION_STATUSES } from "@/config/judicial-maturity";
import { getAffairNoticeVariant } from "@/components/affairs/AffairStatusNotice";
import { computeJudicialCounts } from "@/lib/politicians/judicial-counts";
import { VALID_STATUSES } from "@/lib/security/schemas/affair";
import { getConvictionOnlyWhere } from "@/lib/affairs/public-filters";

/**
 * Issue #511 — `POURVOI_EN_CASSATION`: convicted on appeal, cassation appeal filed.
 *
 * The enum could not express it, so those affairs had to carry
 * `CONDAMNATION_PREMIERE_INSTANCE`, which names the wrong court, or
 * `CONDAMNATION_DEFINITIVE`, which claims the decision is final. Both are misleading
 * on a fiche about a named person.
 *
 * The invariant this file protects: the status is a conviction (it counts in adverse
 * aggregates) AND it is not final (presumption notice, never counted as definitive).
 */

const STATUS = "POURVOI_EN_CASSATION" as const;

describe("POURVOI_EN_CASSATION — c'est une condamnation", () => {
  it("relève du niveau « condamnation » de la maturité judiciaire", () => {
    expect(getJudicialMaturity(STATUS)).toBe("CONDAMNATION");
    expect(CONDAMNATION_STATUSES).toContain(STATUS);
  });

  it("entre dans l'agrégat public des condamnations", () => {
    // Sinon la fiche disparaîtrait des compteurs en changeant de statut, ce qui
    // ferait passer une correction de précision pour une disparition.
    const where = getConvictionOnlyWhere();
    expect((where.status as { in: string[] }).in).toContain(STATUS);
  });

  // Le filtre « condamnation prononcée » du listing (`CERTAINTY_STATUS`) est couvert
  // dans `src/lib/data/__tests__/condamnations.test.ts` : ce module construit le
  // client Prisma au chargement, et ce fichier reste sans dépendance à la base.

  it("compte comme condamnation non définitive, jamais comme définitive", () => {
    const counts = computeJudicialCounts([
      { involvement: "DIRECT", status: STATUS },
      { involvement: "DIRECT", status: "CONDAMNATION_DEFINITIVE" },
    ]);

    expect(counts.condamnationsNonDefinitives).toBe(1);
    expect(counts.condamnationsDefinitives).toBe(1);
  });
});

describe("POURVOI_EN_CASSATION — elle n'est pas définitive", () => {
  it("porte la certitude « prononcée », pas « établie »", () => {
    expect(getCertaintyLevel(STATUS)).toBe("PRONONCE");
    expect(CERTAINTY_LABELS[getCertaintyLevel(STATUS)]).toBe("Condamnation non définitive");
  });

  it("déclenche le rappel de présomption d'innocence", () => {
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION[STATUS]).toBe(true);
  });

  it("affiche un encart propre au pourvoi, pas « en cours d'appel »", () => {
    // L'appel est terminé : c'est la cassation qui est pendante. Réutiliser le
    // texte non définitif générique dirait quelque chose de faux.
    expect(getAffairNoticeVariant(STATUS, "DIRECT")).toBe("pourvoi");
    expect(getAffairNoticeVariant("CONDAMNATION_PREMIERE_INSTANCE", "DIRECT")).toBe(
      "non_definitive"
    );
  });

  it("n'affiche aucun encart à charge quand la personne n'est pas mise en cause", () => {
    for (const involvement of ["MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const) {
      // Un encart de tiers, pas un encart de présomption : le pourvoi ne dit rien
      // de cette personne, c'est un tiers qui a été condamné.
      expect(getAffairNoticeVariant(STATUS, involvement)).toBe("third_party");
    }
  });
});

describe("POURVOI_EN_CASSATION — libellés", () => {
  it("porte le libellé public complet", () => {
    expect(AFFAIR_STATUS_LABELS[STATUS]).toBe(
      "Condamnation non définitive, pourvoi en cassation en cours"
    );
  });

  it("porte une description et une couleur", () => {
    expect(AFFAIR_STATUS_DESCRIPTIONS[STATUS]).toContain("pourvoi en cassation");
    expect(AFFAIR_STATUS_DESCRIPTIONS[STATUS]).toContain("pas définitive");
    expect(AFFAIR_STATUS_COLORS[STATUS]).toBeTruthy();
  });

  it("ne se présente pas avec la même intensité qu'une condamnation définitive", () => {
    expect(AFFAIR_STATUS_COLORS[STATUS]).not.toBe(AFFAIR_STATUS_COLORS.CONDAMNATION_DEFINITIVE);
  });
});

describe("garde : l'énumération Zod de modération suit Prisma", () => {
  // Le trou trouvé en #511 : la liste contenait « PROCES » et « APPEL », deux
  // valeurs d'AffairEventType. Conséquence, la modération ne pouvait pas poser
  // « Procès en cours » ni « Appel en cours », et « APPEL » passait Zod pour
  // échouer ensuite en base.
  const prismaValues = Object.keys(AffairStatus).sort();

  it("accepte exactement les valeurs de AffairStatus", () => {
    expect([...VALID_STATUSES].sort()).toEqual(prismaValues);
  });

  it("n'accepte aucune valeur d'AffairEventType", () => {
    for (const wrong of ["PROCES", "APPEL", "JUGEMENT", "POURVOI_CASSATION"]) {
      expect(VALID_STATUSES as readonly string[]).not.toContain(wrong);
    }
  });

  it("les libellés couvrent aussi toute l'énumération", () => {
    // AFFAIR_STATUS_LABELS est un Record exhaustif, donc le compilateur le garantit ;
    // cette assertion protège contre un passage à Partial<Record<...>>.
    expect(Object.keys(AFFAIR_STATUS_LABELS).sort()).toEqual(prismaValues);
  });
});
