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

function candidate(name: string): SubjectCandidateEntry["candidate"] {
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
  };
}

function entry(name: string, measures: SubjectCandidateEntry["measures"]): SubjectCandidateEntry {
  return { candidate: candidate(name), measures };
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
    ...over,
  };
}

describe("SubjectComparison", () => {
  it("annonce l'ordre alphabétique et l'absence de classement", () => {
    render(<SubjectComparison data={data()} />);
    expect(screen.getByText(/ordre alphabétique, sans classement/i)).toBeInTheDocument();
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
});
