import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PublicMeasure } from "@/lib/data/measures";
import type { SubjectCandidateEntry, SubjectPageData } from "@/lib/data/subject-page";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import { SubjectComparison } from "../SubjectComparison";

function measure(over: Partial<PublicMeasure> = {}): PublicMeasure {
  return {
    id: "m-1",
    publishedRevisionId: "rev-1",
    text: "Encadrer les loyers.",
    precision: "OBJECTIF_SANS_CHIFFRE",
    theme: "LOGEMENT_URBANISME",
    attribution: "PERSONAL",
    politicianId: "p-1",
    candidacyId: "c-1",
    programEditionId: null,
    withdrawal: null,
    sources: [],
    qualifications: [],
    ...over,
  };
}

function source(
  over: Partial<PublicMeasure["sources"][number]> = {}
): PublicMeasure["sources"][number] {
  return {
    id: "s-1",
    measureRevisionId: "rev-1",
    sourceKind: "PROGRAMME_PARTI",
    tier: "PRIMARY",
    url: "https://example.org/programme.pdf",
    page: null,
    publishedAt: new Date("2027-01-15T00:00:00Z"),
    createdAt: new Date("2027-01-16T00:00:00Z"),
    ...over,
  };
}

function candidate(
  name: string,
  over: Partial<SubjectCandidateEntry["candidate"]> = {}
): SubjectCandidateEntry["candidate"] {
  return {
    id: `cand-${name}`,
    candidateName: name,
    politicianSlug: null,
    status: "DECLARE",
    sourceUrl: null,
    sourceLabel: null,
    slogan: null,
    accentColor: null,
    partyLabel: "Parti Fixture",
    partyShortName: "PF",
    declaredAt: null,
    ...over,
  };
}

function entry(
  name: string,
  measures: SubjectCandidateEntry["measures"],
  candidateOver: Partial<SubjectCandidateEntry["candidate"]> = {}
): SubjectCandidateEntry {
  return { candidate: candidate(name, candidateOver), measures };
}

function subjectMeasure(
  m: PublicMeasure,
  relation: VoteRelation
): SubjectCandidateEntry["measures"][number] {
  return { measure: m, voteRelation: relation, voteReference: null };
}

function data(over: Partial<SubjectPageData> = {}): SubjectPageData {
  return {
    theme: "LOGEMENT_URBANISME",
    electionSlug: "presidentielle-2027",
    candidates: [],
    candidaciesWithVerifiedMeasure: 2,
    publishable: true,
    requiredCandidaciesWithVerifiedMeasure: 2,
    totalSourcedCandidacies: 3,
    pendingReviewRevisionCount: 0,
    lastReviewedAt: null,
    fallbackPublishableTheme: null,
    siblingThemes: [
      {
        theme: "LOGEMENT_URBANISME",
        label: "Logement & Urbanisme",
        slug: "logement-urbanisme",
        measureCount: 4,
        publishable: true,
      },
      { theme: "SANTE", label: "Santé", slug: "sante", measureCount: 0, publishable: false },
    ],
    totalMeasuresOnTheme: 4,
    ...over,
  };
}

describe("SubjectComparison", () => {
  it("annonce le critère de tri réellement appliqué", () => {
    render(<SubjectComparison data={data()} />);
    expect(screen.getByText(/Classées par nom de famille/)).toBeInTheDocument();
  });

  it("rend une absence qualifiée, jamais une cellule vide, pour un candidat sans mesure", () => {
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-a" }), "SEARCH_NOT_DONE")]),
            entry("Chloe", []),
          ],
        })}
      />
    );
    const absence = container.querySelector('[data-absence-kind="no_measure_published"]');
    expect(absence).not.toBeNull();
  });

  it("garde une mesure retirée visible, avec sa source quand les deux champs sont là", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({
                  id: "m-w",
                  text: "Geler les loyers.",
                  withdrawal: {
                    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
                    sourceUrl: "https://example.org/retrait",
                    sourceLabel: "Communiqué de retrait",
                  },
                }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );
    // Deux rendus : le tableau au-dessus de lg, les cartes en dessous. Les deux doivent porter
    // le retrait, sinon un lecteur mobile verrait une mesure abandonnée comme encore défendue.
    expect(screen.getAllByText(/Mesure retirée le/)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Communiqué de retrait" })).toHaveLength(2);
  });

  it("n'affiche pas de lien de source de retrait quand le libellé manque", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(
                measure({
                  id: "m-w2",
                  withdrawal: {
                    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
                    sourceUrl: "https://example.org/retrait",
                    sourceLabel: null,
                  },
                }),
                "SEARCH_NOT_DONE"
              ),
            ]),
          ],
        })}
      />
    );
    expect(screen.getAllByText(/Mesure retirée le/)).toHaveLength(2);
    // Le lien de retrait n'apparaît pas. Les autres liens de la page (sources, sujets, méthode)
    // ne sont pas concernés, d'où la portée sur le paragraphe de retrait lui-même.
    for (const ligne of screen.getAllByText(/Mesure retirée le/)) {
      expect(ligne.querySelector("a")).toBeNull();
    }
  });

  it("rend un état explicite sous le seuil, sans comparaison à un seul candidat", () => {
    render(
      <SubjectComparison
        data={data({
          publishable: false,
          candidaciesWithVerifiedMeasure: 1,
          candidates: [entry("Alix", [subjectMeasure(measure(), "SEARCH_NOT_DONE")])],
        })}
      />
    );
    expect(screen.getByText(/Comparaison pas encore disponible/i)).toBeInTheDocument();
    // Under the gate, no candidate column is rendered at all.
    expect(screen.queryByRole("heading", { level: 2, name: "Alix" })).not.toBeInTheDocument();
  });

  it("rend le libellé de base de la relation aux votes", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-x" }), "NO_VOTE_IN_SCOPE")]),
            entry("Bruno", [subjectMeasure(measure({ id: "m-y" }), "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );
    // La fixture n'a pas de slug de politicien, donc le nom est un texte et non un lien.
    const ligne = screen.getAllByText("Alix")[0]!.closest("tr");
    expect(
      within(ligne as HTMLElement).getByText(/périmètre examiné sans résultat/)
    ).toBeInTheDocument();
  });

  it("affiche les preuves d'une mesure : source cliquable, nature, niveau et date", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [
              subjectMeasure(measure({ id: "m-s", sources: [source()] }), "SEARCH_NOT_DONE"),
            ]),
          ],
        })}
      />
    );
    // Deux rendus, tableau et cartes : la preuve doit tenir dans les deux.
    const liens = screen.getAllByRole("link", { name: "Programme de parti" });
    expect(liens).toHaveLength(2);
    for (const lien of liens) {
      expect(lien).toHaveAttribute("href", "https://example.org/programme.pdf");
      const li = lien.closest("li");
      expect(li).toHaveTextContent("Source primaire");
      expect(li).toHaveTextContent(/janvier 2027/);
    }
  });

  it("rend la source de déclaration de la candidature depuis sa colonne", () => {
    render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure(), "SEARCH_NOT_DONE")], {
              sourceUrl: "https://example.org/annonce",
              sourceLabel: "Discours du 1er mars",
            }),
          ],
        })}
      />
    );
    // La source de déclaration n'est plus répétée par ligne : six libellés de cent caractères
    // écrasaient la première colonne. La page dit que le statut est sourcé et renvoie au champ,
    // qui porte la source de chaque candidature.
    expect(screen.queryByRole("link", { name: "Discours du 1er mars" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir les sources de candidature/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027#candidatures"
    );
  });

  it("n'affirme rien sur la carrière d'un candidat sans mesure sur le sujet", () => {
    // Régression : la cellule vote rendait « N'a jamais siégé » dès que le thème était vide, une
    // affirmation sur un parcours déduite de l'absence de mesure sur UN sujet. Faux pour tous ceux
    // qui ont siégé, et indéductible de ce que cette page lit.
    const { container } = render(
      <SubjectComparison data={data({ candidates: [entry("Chloe", [])] })} />
    );

    expect(container.querySelector('[data-absence-kind="never_sat"]')).toBeNull();
    expect(screen.queryByText(/jamais siégé/i)).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-absence-kind="not_applicable"]').length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pas de mesure publiée à rapprocher d'un scrutin/).length).toBe(2);
  });

  it("ne dit jamais d'une mesure publiée qu'elle n'est pas relue", () => {
    // Une mesure n'est publique que si `reviewedAt` est renseigné : « Pas encore relu » y
    // contredirait le prédicat qui l'a rendue visible. Une précision nulle se dit pour ce qu'elle
    // est, une qualification manquante.
    const { container } = render(
      <SubjectComparison
        data={data({
          candidates: [
            entry("Alix", [subjectMeasure(measure({ precision: null }), "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );

    expect(container.querySelector('[data-absence-kind="not_reviewed"]')).toBeNull();
    expect(screen.queryByText(/Pas encore relu/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Précision non renseignée").length).toBe(2);
  });

  it("ne compte pas une mesure retirée comme une mesure portée", () => {
    // `entry.measures` inclut volontairement les retraits. Une candidature dont tout est retiré ne
    // « porte » plus rien, et le compteur de l'autorité (candidaciesWithVerifiedMeasure) est seul
    // à faire cette distinction.
    const retiree = measure({
      id: "m-out",
      withdrawal: {
        withdrawnAt: new Date("2027-03-01T00:00:00Z"),
        sourceUrl: null,
        sourceLabel: null,
      },
    });
    render(
      <SubjectComparison
        data={data({
          candidaciesWithVerifiedMeasure: 1,
          totalMeasuresOnTheme: 1,
          candidates: [
            entry("Alix", [subjectMeasure(measure({ id: "m-in" }), "SEARCH_NOT_DONE")]),
            entry("Chloe", [subjectMeasure(retiree, "SEARCH_NOT_DONE")]),
          ],
        })}
      />
    );

    // Une seule candidature porte encore une mesure, pas deux.
    expect(screen.getByText(/1 candidature porte une mesure sur ce sujet/)).toBeInTheDocument();
    expect(screen.getByText(/réparties entre 1 candidature/)).toBeInTheDocument();
    // Et sous le nom de celle dont la mesure est retirée, le compte tombe à zéro.
    expect(screen.getAllByText(/aucune mesure sur ce sujet/).length).toBe(2);
  });
});
