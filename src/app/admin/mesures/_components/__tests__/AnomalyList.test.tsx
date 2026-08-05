import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnomalyList } from "../AnomalyList";

describe("AnomalyList", () => {
  it("dit explicitement qu'il n'y a rien à signaler", () => {
    render(<AnomalyList anomalies={[]} />);

    expect(
      screen.getByText("Aucune anomalie détectée sur cette mesure et ses révisions.")
    ).toBeInTheDocument();
  });

  it("nomme le défaut et porte l'identifiant concerné", () => {
    // The identifier is what lets a moderator go and fix the row instead of only knowing that
    // something is wrong.
    render(
      <AnomalyList anomalies={[{ code: "published_revision_without_source", detail: "rev-42" }]} />
    );

    expect(screen.getByText("La révision publiée n'a plus aucune source")).toBeInTheDocument();
    expect(screen.getByText(/published_revision_without_source · rev-42/)).toBeInTheDocument();
  });

  it("rend chaque anomalie d'une liste", () => {
    render(
      <AnomalyList
        anomalies={[
          { code: "withdrawn_without_source", detail: "m-1" },
          { code: "orphan_active_draft", detail: "rev-7" },
        ]}
      />
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Retrait sans source : ni URL ni libellé")).toBeInTheDocument();
    expect(screen.getByText("Un brouillon actif qu'aucun pointeur ne désigne")).toBeInTheDocument();
  });
});
