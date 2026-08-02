import { describe, it, expect } from "vitest";
import { HUMAN_REVIEWERS, isHumanReview, reviewProvenance } from "@/lib/affairs/review-provenance";

/**
 * Trois états et non deux : « personne », « une machine », « un humain ». Les deux
 * premiers bloquent la publication mais n'appellent pas le même geste, et les confondre
 * est ce qui a rendu le blocage illisible côté modération.
 */
describe("reviewProvenance", () => {
  it("rend NONE quand personne n'a revu", () => {
    expect(reviewProvenance(null)).toBe("NONE");
    expect(reviewProvenance(undefined)).toBe("NONE");
    expect(reviewProvenance("")).toBe("NONE");
  });

  it("rend HUMAN pour un réviseur déclaré", () => {
    expect(reviewProvenance("admin")).toBe("HUMAN");
  });

  it("rend ASSISTED pour la passe de triage existante", () => {
    expect(reviewProvenance("auto-triage")).toBe("ASSISTED");
  });

  /**
   * Le point porteur de tout le module : ce qui n'est pas déclaré humain est assisté.
   *
   * Une liste des robots aurait le sens inverse, et un réviseur automatique ajouté demain
   * publierait sans que personne l'ait décidé. Ici, l'oubli bloque au lieu de publier, et
   * le coût d'un humain non déclaré est qu'il doit se déclarer.
   */
  it("traite tout réviseur inconnu comme assisté", () => {
    for (const unknown of ["auto-triage-v2", "llm-judge", "cron", "Lamine", "sync:daily"]) {
      expect(reviewProvenance(unknown), unknown).toBe("ASSISTED");
    }
  });

  it("ne se laisse pas prendre par une casse différente", () => {
    expect(reviewProvenance("Admin")).toBe("ASSISTED");
    expect(reviewProvenance("ADMIN")).toBe("ASSISTED");
  });

  it("isHumanReview suit reviewProvenance", () => {
    expect(isHumanReview("admin")).toBe(true);
    expect(isHumanReview("auto-triage")).toBe(false);
    expect(isHumanReview(null)).toBe(false);
  });

  it("la liste des humains reste explicite et non vide", () => {
    // Une liste vide bloquerait toute publication : le dire ici plutôt que de le
    // découvrir en production.
    expect(HUMAN_REVIEWERS.length).toBeGreaterThan(0);
    expect(HUMAN_REVIEWERS).toContain("admin");
  });
});
