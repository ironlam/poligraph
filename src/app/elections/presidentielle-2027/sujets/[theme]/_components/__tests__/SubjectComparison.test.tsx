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
    pendingReviewMeasureCount: 0,
    lastReviewedAt: null,
    fallbackPublishableTheme: null,
    ...over,
  };
}

describe("SubjectComparison", () => {
  it("annonce l'ordre alphabétique d'affichage", () => {
    render(<SubjectComparison data={data()} />);
    expect(screen.getByText(/présentées par ordre alphabétique/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Mesure retirée le/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Communiqué de retrait" })).toBeInTheDocument();
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
    expect(screen.getByText(/Mesure retirée le/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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
    const alix = screen.getByRole("heading", { level: 2, name: "Alix" }).closest("article");
    expect(
      within(alix as HTMLElement).getByText(/périmètre examiné sans résultat/)
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
    const link = screen.getByRole("link", { name: "Programme de parti" });
    expect(link).toHaveAttribute("href", "https://example.org/programme.pdf");
    const li = link.closest("li");
    expect(li).toHaveTextContent("Source primaire");
    expect(li).toHaveTextContent(/janvier 2027/);
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
    expect(screen.getByRole("link", { name: "Discours du 1er mars" })).toHaveAttribute(
      "href",
      "https://example.org/annonce"
    );
  });
});
