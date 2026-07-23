import { describe, it, expect } from "vitest";
import { parseScrutinTitle } from "@/services/sync/link-scrutins-to-amendments/parse-title";

describe("parseScrutinTitle", () => {
  it("parses a principal amendment with a number and an author", () => {
    const t = parseScrutinTitle("l'amendement n° 1234 de M. Dupont au projet de loi X");
    expect(t.principalNumbers).toEqual(["1234"]);
    expect(t.subAmendmentNumber).toBeNull();
    expect(t.parentAmendmentNumber).toBeNull();
    expect(t.hasIdentique).toBe(false);
    expect(t.confidence).toBeGreaterThan(0.8);
  });

  it("parses the Potier / Government sub-amendment example verbatim", () => {
    const t = parseScrutinTitle(
      "le sous-amendement n° 2368 de M. Potier à l'amendement n° 2058 du Gouvernement et l'amendement identique suivant de rétablissement de l'article 8 (supprimé) (examen prioritaire) du projet de loi d'urgence pour la protection et la souveraineté agricoles (première lecture)."
    );
    expect(t.subAmendmentNumber).toBe("2368");
    expect(t.parentAmendmentNumber).toBe("2058");
    expect(t.hasIdentique).toBe(true);
    expect(t.principalNumbers).toEqual([]);
    expect(t.confidence).toBeGreaterThan(0.8);
  });

  it("parses an enumerated identique group", () => {
    const t = parseScrutinTitle("les amendements identiques n° 1234 et n° 1235 de Mme Y");
    expect(t.hasIdentique).toBe(true);
    expect(t.identiqueNumbers.sort()).toEqual(["1234", "1235"]);
  });

  it("recognizes 'l'amendement identique suivant' without enumerating", () => {
    const t = parseScrutinTitle("l'amendement n° 1234 et l'amendement identique suivant");
    expect(t.principalNumbers).toEqual(["1234"]);
    expect(t.hasIdentique).toBe(true);
    expect(t.identiqueNumbers).toEqual([]);
    expect(t.warnings.some((w) => w.code === "IDENTIQUE_NOT_ENUMERATED")).toBe(true);
  });

  it("supports budget-prefix numbers (I-390, II-3410)", () => {
    const t = parseScrutinTitle("l'amendement n° I-390 de M. X");
    expect(t.principalNumbers).toEqual(["I-390"]);
    const t2 = parseScrutinTitle("l'amendement n° II-3410 de Mme Y");
    expect(t2.principalNumbers).toEqual(["II-3410"]);
  });

  it("supports the CF budget suffix (II-CF711, I-CF1764)", () => {
    const t = parseScrutinTitle("l'amendement n° II-CF711 du Gouvernement");
    expect(t.principalNumbers).toEqual(["II-CF711"]);
    const t2 = parseScrutinTitle("l'amendement n° I-CF1764 de M. Z");
    expect(t2.principalNumbers).toEqual(["I-CF1764"]);
  });

  it("returns NO_AMENDMENT_CITED when no number is present", () => {
    const t = parseScrutinTitle("la motion de rejet préalable du projet de loi X");
    expect(t.principalNumbers).toEqual([]);
    expect(t.subAmendmentNumber).toBeNull();
    expect(t.warnings.some((w) => w.code === "NO_AMENDMENT_CITED")).toBe(true);
    expect(t.confidence).toBeLessThan(0.4);
  });

  it("returns MULTIPLE_PRINCIPALS when several distinct principal numbers are cited", () => {
    const t = parseScrutinTitle(
      "l'amendement n° 1234 et l'amendement n° 9999 de groupes différents"
    );
    expect(t.principalNumbers.sort()).toEqual(["1234", "9999"]);
    expect(t.warnings.some((w) => w.code === "MULTIPLE_PRINCIPALS")).toBe(true);
  });

  it("ignores numeric tokens that look like article numbers, not amendments", () => {
    const t = parseScrutinTitle("l'amendement n° 1234 modifiant l'article 8 du projet de loi");
    expect(t.principalNumbers).toEqual(["1234"]);
    expect(t.principalNumbers).not.toContain("8");
  });

  it("treats 'sous-amendement' alone as a SUB role even when only the sub number is cited", () => {
    const t = parseScrutinTitle("le sous-amendement n° 42 du Gouvernement");
    expect(t.subAmendmentNumber).toBe("42");
    expect(t.parentAmendmentNumber).toBeNull();
    expect(t.warnings.some((w) => w.code === "SUB_WITHOUT_PARENT")).toBe(true);
  });

  it("reads 'seconde délibération' as deliberation 2", () => {
    const t = parseScrutinTitle(
      "l'amendement n° 1 du Gouvernement de rétablissement de l'article 11 (supprimé) (seconde délibération)"
    );
    expect(t.deliberation).toBe(2);
    expect(t.principalNumbers).toEqual(["1"]);
  });

  it("reads 'première délibération' as deliberation 1", () => {
    const t = parseScrutinTitle("l'amendement n° 42 du Gouvernement (première délibération)");
    expect(t.deliberation).toBe(1);
  });

  it("leaves deliberation null when the title does not mention one", () => {
    const t = parseScrutinTitle("l'amendement n° 1234 de M. Dupont");
    expect(t.deliberation).toBeNull();
  });

  it("detects the délibération accent-insensitively", () => {
    const t = parseScrutinTitle("l'amendement n° 1 du Gouvernement (seconde deliberation)");
    expect(t.deliberation).toBe(2);
  });

  it("is deterministic across repeated calls (no shared regex lastIndex bug)", () => {
    const title = "le sous-amendement n° 2368 de M. Potier à l'amendement n° 2058 du Gouvernement";
    const a = parseScrutinTitle(title);
    const b = parseScrutinTitle(title);
    const c = parseScrutinTitle(title);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
    expect(a.subAmendmentNumber).toBe("2368");
    expect(a.parentAmendmentNumber).toBe("2058");
  });
});
