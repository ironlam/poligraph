import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PrioritesCandidacyRow, PrioritesData } from "@/lib/data/priorites";
import { PrioritesGate } from "../PrioritesGate";

/**
 * The component renders the desktop table AND the mobile cards in the DOM, switching between them
 * with `md:hidden` / `hidden md:block`. jsdom applies no Tailwind breakpoint, so every duplicated
 * figure appears twice: assertions use `getAllByText` and check the count, which also catches a
 * layout that silently stops rendering one of the two.
 */

function row(over: Partial<PrioritesCandidacyRow> = {}): PrioritesCandidacyRow {
  return {
    candidacyId: "c-1",
    candidateName: "Candidate Fixture",
    politicianSlug: "candidate-fixture",
    partyLabel: "Parti Fixture",
    verifiedMeasureCount: 12,
    themesCoveredCount: 4,
    primarySourceMeasureCount: 7,
    primarySourceShare: 7 / 12,
    programmeMeasureCount: 12,
    eligible: false,
    ...over,
  };
}

function data(over: Partial<PrioritesData> = {}): PrioritesData {
  return {
    electionSlug: "presidentielle-2027",
    documentedRows: [],
    undocumentedCount: 0,
    eligibleCount: 0,
    coverageRatio: null,
    coverageExtremes: null,
    corpusSameNature: false,
    segmentationDoctrinePublished: false,
    publishable: false,
    publishableThemes: [],
    lastReviewedAt: null,
    ...over,
  };
}

const evaluatedAt = "7 août 2026";

describe("PrioritesGate : la règle centrale", () => {
  it("ne rend aucun pourcentage de répartition, même avec des candidatures documentées", () => {
    const { container } = render(
      <PrioritesGate
        data={data({
          documentedRows: [row(), row({ candidacyId: "c-2", candidateName: "Autre Fixture" })],
        })}
        evaluatedAt={evaluatedAt}
      />
    );

    // Portée sur la section d'éligibilité, la seule qui porte des chiffres de candidats. Le bloc
    // pédagogique sur le biais de découpage affiche volontairement « Éducation 100 % » : c'est un
    // exemple de phrase, pas une donnée, et l'y inclure ferait échouer le test pour la mauvaise raison.
    const section = container.querySelector("section[aria-labelledby='eligibilite']");
    expect(section).not.toBeNull();

    // Les seuls pourcentages admis ici : le seuil de sources primaires (60) et la part réellement
    // mesurée (7 sur 12, soit 58). Une répartition par sujet ferait apparaître une valeur hors de
    // cet ensemble. Relevé sur les seuls éléments FEUILLES : le textContent d'une ligne de tableau
    // recolle « il en manque 1 » et « 58 % » en un « 158 » que personne n'affiche.
    const valeurs = new Set(
      [...section!.querySelectorAll("*")]
        .filter((el) => el.children.length === 0)
        .flatMap((el) => [...(el.textContent ?? "").matchAll(/(\d+)\s%/g)].map((m) => Number(m[1])))
    );
    expect([...valeurs].sort((a, b) => a - b)).toEqual([58, 60]);

    // Ni barre, ni jauge : sous le seuil, aucune forme graphique de répartition.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector("meter")).toBeNull();
  });

  it("nomme l'état fermé et date l'évaluation", () => {
    render(<PrioritesGate data={data()} evaluatedAt={evaluatedAt} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /Corpus encore insuffisant pour comparer/i })
    ).toBeInTheDocument();
    expect(screen.getByText(`Seuils évalués le ${evaluatedAt}`)).toBeInTheDocument();
  });
});

describe("PrioritesGate : le calcul d'éligibilité", () => {
  it("affiche l'écart restant sur chaque condition non remplie", () => {
    render(<PrioritesGate data={data({ documentedRows: [row()] })} evaluatedAt={evaluatedAt} />);

    // 12 mesures pour un seuil de 15, 4 sujets pour un seuil de 5. Deux rendus chacun.
    expect(screen.getAllByText("il en manque 3")).toHaveLength(2);
    expect(screen.getAllByText("il en manque 1")).toHaveLength(2);
    expect(screen.getAllByText("7 mesures sur 12")).toHaveLength(2);
    expect(screen.getAllByText("58 %")).toHaveLength(2);
  });

  it("dit « condition remplie » plutôt qu'un écart négatif au-dessus du seuil", () => {
    render(
      <PrioritesGate
        data={data({ documentedRows: [row({ verifiedMeasureCount: 20 })] })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.queryByText(/il en manque -/)).not.toBeInTheDocument();
    expect(screen.getAllByText("condition remplie").length).toBeGreaterThan(0);
  });

  it("rend un tiret, jamais « 0 % », pour une candidature sans mesure relue", () => {
    render(
      <PrioritesGate
        data={data({
          documentedRows: [
            row({
              verifiedMeasureCount: 0,
              themesCoveredCount: 0,
              primarySourceMeasureCount: 0,
              primarySourceShare: null,
            }),
          ],
        })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.queryByText("0 %")).not.toBeInTheDocument();
    expect(screen.getAllByText("aucune mesure relue")).toHaveLength(2);
  });

  it("replie les candidatures sans mesure dans une ligne agrégée, avec leur nombre", () => {
    render(
      <PrioritesGate
        data={data({ documentedRows: [row()], undocumentedCount: 9 })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.getAllByText(/9 autres candidatures/)).toHaveLength(2);
    expect(screen.getAllByText("Non incluses")).toHaveLength(2);
  });

  it("colore la barre d'accent sur le NOMBRE de conditions non remplies", () => {
    const { container } = render(
      <PrioritesGate
        data={data({
          documentedRows: [
            // Les trois conditions échouent : 12 < 15, 4 < 5, 58 % < 60 %.
            row({ candidacyId: "c-rouge" }),
            // Une seule échoue : les mesures et les sujets passent, la part de sources non.
            row({
              candidacyId: "c-jaune",
              verifiedMeasureCount: 20,
              themesCoveredCount: 6,
              primarySourceMeasureCount: 2,
              primarySourceShare: 0.1,
            }),
            // Aucune n'échoue.
            row({
              candidacyId: "c-vert",
              verifiedMeasureCount: 20,
              themesCoveredCount: 6,
              primarySourceMeasureCount: 20,
              primarySourceShare: 1,
              eligible: true,
            }),
          ],
        })}
        evaluatedAt={evaluatedAt}
      />
    );

    // Deux rendus par ligne (tableau desktop + carte mobile), d'où les doublons.
    const barres = [...container.querySelectorAll("[data-unmet]")];
    expect(barres.map((b) => b.getAttribute("data-unmet"))).toEqual(["3", "1", "0", "3", "1", "0"]);
    expect(barres.map((b) => b.className)).toEqual([
      expect.stringContaining("bg-destructive"),
      expect.stringContaining("bg-amber-500"),
      expect.stringContaining("bg-primary"),
      expect.stringContaining("bg-destructive"),
      expect.stringContaining("bg-amber-500"),
      expect.stringContaining("bg-primary"),
    ]);

    // Décorative : l'information est déjà écrite en toutes lettres dans chaque cellule, donc la
    // couleur ne la porte jamais seule (WCAG 1.4.1) et le lecteur d'écran ne la répète pas.
    for (const barre of barres) expect(barre.getAttribute("aria-hidden")).toBe("true");
  });

  it("ne dit pas « autres » quand aucune candidature n'est détaillée au-dessus", () => {
    // « 26 autres candidatures » sans une seule ligne détaillée se lit comme si une liste avait
    // disparu. C'est exactement l'état du site aujourd'hui, donc le cas le plus visible de tous.
    render(<PrioritesGate data={data({ undocumentedCount: 26 })} evaluatedAt={evaluatedAt} />);
    expect(screen.getAllByText("26 candidatures")).toHaveLength(2);
    expect(screen.queryByText(/autres candidatures/)).not.toBeInTheDocument();
  });

  it("n'affiche pas la ligne agrégée quand toutes les candidatures ont une mesure", () => {
    render(
      <PrioritesGate
        data={data({ documentedRows: [row()], undocumentedCount: 0 })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.queryByText(/autres? candidatures?/)).not.toBeInTheDocument();
  });

  it("accorde le singulier sur une seule candidature restante", () => {
    render(
      <PrioritesGate
        data={data({ documentedRows: [row()], undocumentedCount: 1 })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.getAllByText("1 autre candidature")).toHaveLength(2);
  });
});

describe("PrioritesGate : les conditions globales", () => {
  it("dit l'écart non calculable tant qu'il n'y a pas deux candidatures éligibles", () => {
    render(<PrioritesGate data={data()} evaluatedAt={evaluatedAt} />);
    expect(screen.getByText(/Pas encore calculable/)).toBeInTheDocument();
    expect(screen.getAllByText("Non remplie")).toHaveLength(3);
  });

  it("rend le rapport avec une virgule décimale et ses deux extrêmes", () => {
    render(
      <PrioritesGate
        data={data({
          eligibleCount: 2,
          coverageRatio: 4,
          coverageExtremes: { most: 12, least: 3 },
        })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(
      screen.getByText(/Rapport de 4,0 aujourd'hui \(12 mesures contre 3\)/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Rapport de 4\.0/)).not.toBeInTheDocument();
  });

  it("marque une condition remplie quand elle l'est", () => {
    render(
      <PrioritesGate
        data={data({ corpusSameNature: true, segmentationDoctrinePublished: true })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.getAllByText("Remplie")).toHaveLength(2);
    expect(screen.getAllByText("Non remplie")).toHaveLength(1);
  });
});

describe("PrioritesGate : ce qui reste consultable", () => {
  it("le dit franchement quand aucune thématique n'est comparable", () => {
    render(<PrioritesGate data={data()} evaluatedAt={evaluatedAt} />);
    expect(screen.getByText(/Aucune thématique n'est encore comparable/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Les 16 thématiques" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes"
    );
  });

  it("renvoie vers les thématiques qui franchissent leur seuil", () => {
    render(
      <PrioritesGate
        data={data({ publishableThemes: [{ slug: "logement-urbanisme", label: "Logement" }] })}
        evaluatedAt={evaluatedAt}
      />
    );
    expect(screen.getByText(/1 thématique franchit son seuil aujourd'hui/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logement" })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes/logement-urbanisme"
    );
  });
});
