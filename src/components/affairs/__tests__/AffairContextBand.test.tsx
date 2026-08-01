import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AffairContextBand } from "@/components/affairs/AffairContextBand";

const base = {
  politicianSlug: "jean-dupont",
  fullName: "Jean Dupont",
  photoUrl: null,
  meta: "Député du Calvados",
  affairCount: 3,
  party: null,
  involvement: "MENTIONED_ONLY" as const,
  subjectLabel: null,
  subjectKind: null,
  subjectNote: null,
  involvementNote: null,
};

describe("AffairContextBand — affichage sujet / rôle (B1 P2)", () => {
  it("sujet renseigné : deux colonnes « Visé » / « Suivi »", () => {
    render(
      <AffairContextBand
        {...base}
        subjectLabel="Lagardère News"
        subjectKind="ORGANISATION"
        subjectNote="Groupe de presse"
      />
    );
    expect(screen.getByText("Visé par la procédure")).toBeTruthy();
    expect(screen.getByText("Suivi sur cette page")).toBeTruthy();
    expect(screen.getByText("Lagardère News")).toBeTruthy();
    expect(screen.getByText(/Personne morale/)).toBeTruthy();
    expect(screen.getByText(/Non poursuivi/)).toBeTruthy();
  });

  it("sans sujet : pas de colonnes", () => {
    render(<AffairContextBand {...base} />);
    expect(screen.queryByText("Visé par la procédure")).toBeNull();
  });

  it("involvementNote : remplace la phrase de rôle générique", () => {
    render(
      <AffairContextBand {...base} involvementNote="Président de la commission d'enquête visée." />
    );
    expect(screen.getByRole("note").textContent).toContain(
      "Président de la commission d'enquête visée."
    );
  });

  it("sans involvementNote : phrase de rôle générique selon l'implication", () => {
    render(<AffairContextBand {...base} involvement="VICTIM" />);
    expect(screen.getByRole("note").textContent).toContain("figure comme victime");
  });

  it("accusé (DIRECT) : pas d'étage de rôle", () => {
    render(<AffairContextBand {...base} involvement="DIRECT" />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
