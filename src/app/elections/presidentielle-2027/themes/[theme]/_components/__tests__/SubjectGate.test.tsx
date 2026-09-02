import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SubjectPageData } from "@/lib/data/subject-page";
import { SubjectGate } from "../SubjectGate";

function data(over: Partial<SubjectPageData> = {}): SubjectPageData {
  return {
    theme: "LOGEMENT_URBANISME",
    electionSlug: "presidentielle-2027",
    candidates: [],
    candidaciesWithVerifiedMeasure: 1,
    publishable: false,
    requiredCandidaciesWithVerifiedMeasure: 2,
    totalSourcedCandidacies: 4,
    pendingReviewRevisionCount: 3,
    lastReviewedAt: new Date("2027-02-10T00:00:00Z"),
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
    readerGuides: [],
    ...over,
  };
}

describe("SubjectGate", () => {
  it("nomme l'état et affiche le compte de candidatures avec mesure vérifiée sur le seuil requis", () => {
    render(<SubjectGate data={data()} />);
    expect(screen.getByText(/Comparaison pas encore disponible/i)).toBeInTheDocument();
    expect(screen.getByText(/1 sur 2 requises/)).toBeInTheDocument();
  });

  it("calcule le taux de couverture à partir des candidatures sourcées", () => {
    render(
      <SubjectGate data={data({ candidaciesWithVerifiedMeasure: 1, totalSourcedCandidacies: 4 })} />
    );
    expect(screen.getByText("25 %")).toBeInTheDocument();
  });

  it("rend un tiret, jamais un faux 0 %, quand aucune candidature n'est sourcée", () => {
    render(
      <SubjectGate data={data({ candidaciesWithVerifiedMeasure: 0, totalSourcedCandidacies: 0 })} />
    );
    expect(screen.queryByText("0 %")).not.toBeInTheDocument();
    // Un seul tiret désormais : les deux compteurs programme disent « Non calculable », qui ne
    // veut pas la même chose. Le tiret signale un rapport sans dénominateur, pas une donnée
    // qu'on ne sait pas produire.
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  it("borne le taux à 100 % quand le numérateur dépasse le dénominateur", () => {
    render(
      <SubjectGate data={data({ candidaciesWithVerifiedMeasure: 5, totalSourcedCandidacies: 3 })} />
    );
    expect(screen.getByText("100 %")).toBeInTheDocument();
  });

  it("compte des révisions, et n'affirme pas une extraction que le chiffre n'atteste pas", () => {
    render(<SubjectGate data={data({ pendingReviewRevisionCount: 3 })} />);
    expect(screen.getByText("Révisions en attente de relecture")).toBeInTheDocument();
    expect(screen.getByText("3 révisions")).toBeInTheDocument();
    // Le compteur porte sur la révision active : une correction sur une mesure déjà publiée y
    // figure, et « mesure extraite » décrirait autre chose.
    expect(screen.queryByText(/extraite/)).not.toBeInTheDocument();
  });

  it("accorde au singulier quand une seule révision est en attente", () => {
    render(<SubjectGate data={data({ pendingReviewRevisionCount: 1 })} />);
    expect(screen.getByText("1 révision")).toBeInTheDocument();
  });

  it("dit les deux compteurs programme non calculables, sans tiret ambigu", () => {
    render(<SubjectGate data={data()} />);
    expect(screen.getAllByText("Non calculable")).toHaveLength(2);
    expect(
      screen.getByText(/tant que le suivi des programmes publiés n'est pas disponible/)
    ).toBeInTheDocument();
  });

  it("affiche la date de dernière revue publique, au format français", () => {
    render(<SubjectGate data={data({ lastReviewedAt: new Date("2027-02-10T00:00:00Z") })} />);
    expect(screen.getByText(/10 février 2027/)).toBeInTheDocument();
  });

  it("affiche « jamais relu » quand aucune revue publique n'a eu lieu", () => {
    render(<SubjectGate data={data({ lastReviewedAt: null })} />);
    expect(screen.getByText(/jamais relu/i)).toBeInTheDocument();
  });

  it("propose un renvoi vers un thème comparable quand fallbackPublishableTheme est fourni", () => {
    render(
      <SubjectGate data={data({ fallbackPublishableTheme: { slug: "sante", label: "Santé" } })} />
    );
    const link = screen.getByRole("link", { name: "Santé" });
    expect(link).toHaveAttribute("href", "/elections/presidentielle-2027/themes/sante");
  });

  it("n'affiche aucun lien de renvoi quand fallbackPublishableTheme est nul", () => {
    render(<SubjectGate data={data({ fallbackPublishableTheme: null })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
