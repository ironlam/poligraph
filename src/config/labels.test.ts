import { describe, it, expect } from "vitest";
import {
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_COLORS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
  AFFAIR_CATEGORY_LABELS,
  CATEGORY_TO_SUPER,
  getCategoriesForSuper,
  MANDATE_TYPE_LABELS,
  AFFAIR_EVENT_TYPE_LABELS,
  DOSSIER_STATUS_LABELS,
  DOSSIER_STATUS_COLORS,
  DOSSIER_STATUS_ICONS,
  DOSSIER_STATUS_DESCRIPTIONS,
  DOSSIER_STATUS_SITUATIONS,
  CANDIDACY_STATUS_LABELS,
  FACTCHECK_ALLOWED_SOURCES,
  canonicalizeFactCheckSource,
} from "./labels";

describe("AFFAIR_STATUS_LABELS", () => {
  it("should have labels for all statuses", () => {
    const statuses = [
      "ENQUETE_PRELIMINAIRE",
      "INSTRUCTION",
      "MISE_EN_EXAMEN",
      "RENVOI_TRIBUNAL",
      "PROCES_EN_COURS",
      "CONDAMNATION_PREMIERE_INSTANCE",
      "APPEL_EN_COURS",
      "CONDAMNATION_DEFINITIVE",
      "RELAXE",
      "ACQUITTEMENT",
      "NON_LIEU",
      "PRESCRIPTION",
      "CLASSEMENT_SANS_SUITE",
    ];

    statuses.forEach((status) => {
      expect(AFFAIR_STATUS_LABELS).toHaveProperty(status);
      expect(typeof AFFAIR_STATUS_LABELS[status as keyof typeof AFFAIR_STATUS_LABELS]).toBe(
        "string"
      );
    });
  });

  it("should have matching colors for all statuses", () => {
    Object.keys(AFFAIR_STATUS_LABELS).forEach((status) => {
      expect(AFFAIR_STATUS_COLORS).toHaveProperty(status);
    });
  });

  it("should have presumption flags for all statuses", () => {
    Object.keys(AFFAIR_STATUS_LABELS).forEach((status) => {
      expect(AFFAIR_STATUS_NEEDS_PRESUMPTION).toHaveProperty(status);
      expect(
        typeof AFFAIR_STATUS_NEEDS_PRESUMPTION[
          status as keyof typeof AFFAIR_STATUS_NEEDS_PRESUMPTION
        ]
      ).toBe("boolean");
    });
  });
});

describe("AFFAIR_STATUS_NEEDS_PRESUMPTION", () => {
  it("should return true for ongoing cases", () => {
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.ENQUETE_PRELIMINAIRE).toBe(true);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.MISE_EN_EXAMEN).toBe(true);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.PROCES_EN_COURS).toBe(true);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.APPEL_EN_COURS).toBe(true);
  });

  it("should return false for final verdicts", () => {
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.CONDAMNATION_DEFINITIVE).toBe(false);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.RELAXE).toBe(false);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.ACQUITTEMENT).toBe(false);
    expect(AFFAIR_STATUS_NEEDS_PRESUMPTION.NON_LIEU).toBe(false);
  });
});

describe("AFFAIR_CATEGORY_LABELS", () => {
  it("should have labels for sensitive categories", () => {
    expect(AFFAIR_CATEGORY_LABELS.AGRESSION_SEXUELLE).toBe("Agression sexuelle");
    expect(AFFAIR_CATEGORY_LABELS.HARCELEMENT_SEXUEL).toBe("Harcèlement sexuel");
    expect(AFFAIR_CATEGORY_LABELS.VIOLENCE).toBe("Violence");
  });

  it("should have labels for financial categories", () => {
    expect(AFFAIR_CATEGORY_LABELS.CORRUPTION).toBe("Corruption");
    expect(AFFAIR_CATEGORY_LABELS.FRAUDE_FISCALE).toBe("Fraude fiscale");
    expect(AFFAIR_CATEGORY_LABELS.DETOURNEMENT_FONDS_PUBLICS).toBe("Détournement de fonds publics");
  });
});

describe("CATEGORY_TO_SUPER", () => {
  it("should map financial categories to FINANCES", () => {
    expect(CATEGORY_TO_SUPER.FRAUDE_FISCALE).toBe("FINANCES");
    expect(CATEGORY_TO_SUPER.BLANCHIMENT).toBe("FINANCES");
    expect(CATEGORY_TO_SUPER.ABUS_BIENS_SOCIAUX).toBe("FINANCES");
  });

  it("should map personal harm categories to PERSONNES", () => {
    expect(CATEGORY_TO_SUPER.VIOLENCE).toBe("PERSONNES");
    expect(CATEGORY_TO_SUPER.HARCELEMENT_MORAL).toBe("PERSONNES");
    expect(CATEGORY_TO_SUPER.AGRESSION_SEXUELLE).toBe("PERSONNES");
  });

  it("should map probity categories to PROBITE", () => {
    expect(CATEGORY_TO_SUPER.CORRUPTION).toBe("PROBITE");
    expect(CATEGORY_TO_SUPER.EMPLOI_FICTIF).toBe("PROBITE");
    expect(CATEGORY_TO_SUPER.TRAFIC_INFLUENCE).toBe("PROBITE");
  });
});

describe("getCategoriesForSuper", () => {
  it("should return categories for PERSONNES", () => {
    const categories = getCategoriesForSuper("PERSONNES");
    expect(categories).toContain("VIOLENCE");
    expect(categories).toContain("HARCELEMENT_MORAL");
    expect(categories).toContain("AGRESSION_SEXUELLE");
  });

  it("should return categories for FINANCES", () => {
    const categories = getCategoriesForSuper("FINANCES");
    expect(categories).toContain("FRAUDE_FISCALE");
    expect(categories).toContain("BLANCHIMENT");
  });

  it("should return empty array for invalid super-category", () => {
    // @ts-expect-error Testing invalid input
    const categories = getCategoriesForSuper("INVALID");
    expect(categories).toHaveLength(0);
  });
});

describe("MANDATE_TYPE_LABELS", () => {
  it("should have labels for common mandate types", () => {
    expect(MANDATE_TYPE_LABELS.DEPUTE).toBe("Député");
    expect(MANDATE_TYPE_LABELS.SENATEUR).toBe("Sénateur");
    expect(MANDATE_TYPE_LABELS.MINISTRE).toBe("Ministre");
    expect(MANDATE_TYPE_LABELS.PREMIER_MINISTRE).toBe("Premier ministre");
  });

  it("should have labels for local mandates", () => {
    expect(MANDATE_TYPE_LABELS.MAIRE).toBe("Maire");
    expect(MANDATE_TYPE_LABELS.CONSEILLER_MUNICIPAL).toBe("Conseiller municipal");
  });
});

describe("AFFAIR_EVENT_TYPE_LABELS", () => {
  it("should have labels for key judicial events", () => {
    expect(AFFAIR_EVENT_TYPE_LABELS.MISE_EN_EXAMEN).toBe("Mise en examen");
    expect(AFFAIR_EVENT_TYPE_LABELS.PROCES).toBe("Procès");
    expect(AFFAIR_EVENT_TYPE_LABELS.CONDAMNATION).toBe("Condamnation");
    expect(AFFAIR_EVENT_TYPE_LABELS.APPEL).toBe("Appel interjeté");
  });

  it("should have labels for all event types", () => {
    const eventCount = Object.keys(AFFAIR_EVENT_TYPE_LABELS).length;
    expect(eventCount).toBeGreaterThanOrEqual(20); // We defined 25 event types
  });
});

describe("DOSSIER_STATUS_LABELS", () => {
  it("should have labels for all 8 dossier statuses", () => {
    const statuses = [
      "DEPOSE",
      "EN_COMMISSION",
      "EN_COURS",
      "CONSEIL_CONSTITUTIONNEL",
      "ADOPTE",
      "REJETE",
      "RETIRE",
      "CADUQUE",
    ];
    statuses.forEach((status) => {
      expect(DOSSIER_STATUS_LABELS).toHaveProperty(status);
      expect(typeof DOSSIER_STATUS_LABELS[status as keyof typeof DOSSIER_STATUS_LABELS]).toBe(
        "string"
      );
    });
    expect(Object.keys(DOSSIER_STATUS_LABELS)).toHaveLength(8);
  });

  it("should have matching colors for all dossier statuses", () => {
    Object.keys(DOSSIER_STATUS_LABELS).forEach((status) => {
      expect(DOSSIER_STATUS_COLORS).toHaveProperty(status);
    });
  });

  it("should have matching icons for all dossier statuses", () => {
    Object.keys(DOSSIER_STATUS_LABELS).forEach((status) => {
      expect(DOSSIER_STATUS_ICONS).toHaveProperty(status);
    });
  });

  it("should have matching descriptions for all dossier statuses", () => {
    Object.keys(DOSSIER_STATUS_LABELS).forEach((status) => {
      expect(DOSSIER_STATUS_DESCRIPTIONS).toHaveProperty(status);
    });
  });

  it("should label new statuses correctly", () => {
    expect(DOSSIER_STATUS_LABELS.DEPOSE).toBe("Déposé");
    expect(DOSSIER_STATUS_LABELS.EN_COMMISSION).toBe("En commission");
    expect(DOSSIER_STATUS_LABELS.CONSEIL_CONSTITUTIONNEL).toBe("Conseil constitutionnel");
    expect(DOSSIER_STATUS_LABELS.CADUQUE).toBe("Caduc");
  });

  it("should have a situation sentence for all dossier statuses", () => {
    Object.keys(DOSSIER_STATUS_LABELS).forEach((status) => {
      expect(DOSSIER_STATUS_SITUATIONS).toHaveProperty(status);
      expect(
        typeof DOSSIER_STATUS_SITUATIONS[status as keyof typeof DOSSIER_STATUS_SITUATIONS]
      ).toBe("string");
    });
  });

  it("should keep EN_COURS situation generic (no séance/navette/CMP sub-step)", () => {
    const situation = DOSSIER_STATUS_SITUATIONS.EN_COURS.toLowerCase();
    expect(situation).not.toContain("séance");
    expect(situation).not.toContain("navette");
    expect(situation).not.toContain("cmp");
  });

  it("should not conflate ADOPTE with promulgation", () => {
    expect(DOSSIER_STATUS_SITUATIONS.ADOPTE.toLowerCase()).not.toContain("promulgu");
  });
});

describe("CANDIDACY_STATUS_LABELS", () => {
  it("should have a label for each candidacy status", () => {
    const statuses = ["DECLARE", "PRESSENTI", "ENVISAGE", "RETIRE"];

    expect(Object.keys(CANDIDACY_STATUS_LABELS)).toHaveLength(statuses.length);

    statuses.forEach((status) => {
      expect(CANDIDACY_STATUS_LABELS).toHaveProperty(status);
      const label = CANDIDACY_STATUS_LABELS[status as keyof typeof CANDIDACY_STATUS_LABELS];
      expect(typeof label).toBe("string");
      expect(label).not.toHaveLength(0);
    });
  });

  it("should keep every status distinct so none can be read as another", () => {
    const labels = Object.values(CANDIDACY_STATUS_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("should not describe an unannounced candidacy as declared", () => {
    expect(CANDIDACY_STATUS_LABELS.PRESSENTI).not.toMatch(/déclar/i);
    expect(CANDIDACY_STATUS_LABELS.ENVISAGE).not.toMatch(/déclar/i);
  });
});

describe("canonicalizeFactCheckSource", () => {
  it("leaves a canonical label untouched", () => {
    for (const label of FACTCHECK_ALLOWED_SOURCES) {
      expect(canonicalizeFactCheckSource(label)).toBe(label);
    }
  });

  it("folds the case variants Google returns for allowed outlets", () => {
    expect(canonicalizeFactCheckSource("franceinfo")).toBe("Franceinfo");
    expect(canonicalizeFactCheckSource("FRANCEINFO")).toBe("Franceinfo");
    expect(canonicalizeFactCheckSource("De Facto")).toBe("DE FACTO");
  });

  it("folds accent and spacing variants", () => {
    expect(canonicalizeFactCheckSource("Liberation")).toBe("Libération");
    expect(canonicalizeFactCheckSource("  Le   Monde ")).toBe("Le Monde");
  });

  it("folds the reversed AFP spelling", () => {
    expect(canonicalizeFactCheckSource("Factuel AFP")).toBe("AFP Factuel");
  });

  it("keeps AFP's English desk distinct from its French one", () => {
    expect(canonicalizeFactCheckSource("AFP Fact Check")).toBe("AFP Fact Check");
    expect(FACTCHECK_ALLOWED_SOURCES).not.toContain("AFP Fact Check");
  });

  it("returns an unknown publisher unchanged", () => {
    expect(canonicalizeFactCheckSource("Snopes")).toBe("Snopes");
    expect(canonicalizeFactCheckSource("dpa-factchecking")).toBe("dpa-factchecking");
  });
});
