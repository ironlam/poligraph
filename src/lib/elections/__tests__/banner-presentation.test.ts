import { describe, it, expect } from "vitest";
import { getBannerPresentation } from "@/lib/elections/banner-presentation";
import type { ElectionType } from "@/generated/prisma";

const ALL_TYPES: ElectionType[] = [
  "PRESIDENTIELLE",
  "LEGISLATIVES",
  "SENATORIALES",
  "MUNICIPALES",
  "DEPARTEMENTALES",
  "REGIONALES",
  "EUROPEENNES",
  "REFERENDUM",
];

const CTX = { electionSlug: "presidentielle-2027", sourcedCandidacyCount: 25 };

describe("getBannerPresentation", () => {
  it("couvre les huit types d'élection", () => {
    for (const type of ALL_TYPES) {
      expect(getBannerPresentation(type)).toBeDefined();
    }
  });

  it("donne à la présidentielle une promesse éditoriale et les blocs de scores", () => {
    const p = getBannerPresentation("PRESIDENTIELLE");
    expect(p.promise).not.toBeNull();
    expect(p.showRound1Scores).toBe(true);
    expect(p.showWinnerScore).toBe(true);
  });

  it("ouvre le dossier depuis l'état FAR", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").primaryAction("FAR", CTX);
    expect(action).toEqual({
      label: "Ouvrir le dossier",
      href: "/elections/presidentielle-2027",
      external: false,
    });
  });

  it("compte les candidatures « recensées » et non « documentées »", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").secondaryAction("FAR", CTX);
    expect(action?.label).toBe("25 candidatures recensées");
    expect(action?.label).not.toContain("documentées");
  });

  it("accorde le libellé au singulier sur une seule candidature", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").secondaryAction("FAR", {
      ...CTX,
      sourcedCandidacyCount: 1,
    });
    expect(action?.label).toBe("1 candidature recensée");
  });

  it("envoie vers un service externe le jour du vote", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").primaryAction("VOTING_DAY", CTX);
    expect(action.external).toBe(true);
    expect(action.href).toMatch(/^https:\/\//);
  });

  it("n'offre aucun lien secondaire le jour du vote", () => {
    expect(getBannerPresentation("PRESIDENTIELLE").secondaryAction("VOTING_DAY", CTX)).toBeNull();
  });

  it("propose de comparer les deux programmes entre les tours", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").primaryAction("BETWEEN_ROUNDS", CTX);
    expect(action.label).toBe("Comparer les deux programmes");
  });

  it("bascule vers le suivi des promesses après le second tour", () => {
    const action = getBannerPresentation("PRESIDENTIELLE").primaryAction("AFTER", CTX);
    expect(action.label).toBe("Suivre les promesses");
    // /suivi does not exist yet: the hub is the honest fallback, never a dead link.
    expect(action.href).toBe("/elections/presidentielle-2027");
  });

  it("omet « Résultats détaillés » pour la présidentielle, dont la page générique est le hub", () => {
    expect(getBannerPresentation("PRESIDENTIELLE").secondaryAction("AFTER", CTX)).toBeNull();
  });

  it("n'accorde aucun bouton présidentiel aux autres types", () => {
    for (const type of ALL_TYPES.filter((t) => t !== "PRESIDENTIELLE")) {
      const p = getBannerPresentation(type);
      const ctx = { electionSlug: "municipales-2032", sourcedCandidacyCount: 0 };
      expect(p.primaryAction("BETWEEN_ROUNDS", ctx).label).not.toContain("programmes");
      expect(p.primaryAction("AFTER", ctx).label).not.toContain("promesses");
      expect(p.showRound1Scores).toBe(false);
      expect(p.showWinnerScore).toBe(false);
      expect(p.promise).toBeNull();
    }
  });

  it("renvoie les autres types vers leur page d'élection générique", () => {
    const ctx = { electionSlug: "municipales-2032", sourcedCandidacyCount: 0 };
    expect(getBannerPresentation("MUNICIPALES").primaryAction("FAR", ctx).href).toBe(
      "/elections/municipales-2032"
    );
    expect(getBannerPresentation("MUNICIPALES").secondaryAction("AFTER", ctx)?.label).toBe(
      "Résultats détaillés"
    );
  });
});
