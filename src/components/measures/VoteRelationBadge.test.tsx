import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VoteRelation } from "@/lib/measures/vote-relation";
import { VoteRelationBadge } from "./VoteRelationBadge";

const ALL: VoteRelation[] = [
  "FAVORABLE_SAME_OBJECT",
  "DEFAVORABLE_SAME_OBJECT",
  "ABSTENTION_SAME_OBJECT",
  "ABSENCE_SAME_OBJECT",
  "DIFFERENT_POSITIONS",
  "BROADER_TEXT",
  "NOT_RECHECKED_SINCE_REFORMULATION",
  "NO_VOTE_IN_SCOPE",
  "SEARCH_NOT_DONE",
];

describe("VoteRelationBadge", () => {
  it("rend chacun des neuf états sans cellule vide ni tiret seul", () => {
    for (const relation of ALL) {
      const { container, unmount } = render(<VoteRelationBadge relation={relation} />);
      const text = container.textContent?.trim() ?? "";
      expect(text.length).toBeGreaterThan(1);
      expect(text).not.toBe("-");
      expect(text).not.toBe("—");
      unmount();
    }
  });

  it("un état de position sur le même objet porte une pastille de position et sa base", () => {
    const { container } = render(<VoteRelationBadge relation="FAVORABLE_SAME_OBJECT" />);
    expect(container.querySelector("[data-vote-position]")).not.toBeNull();
    expect(screen.getByText("Pour")).toBeInTheDocument();
    expect(screen.getByText(/même objet/)).toBeInTheDocument();
  });

  it("un état sans position ne porte aucune pastille de position", () => {
    const { container } = render(<VoteRelationBadge relation="BROADER_TEXT" />);
    expect(container.querySelector("[data-vote-position]")).toBeNull();
    expect(screen.getByText(/texte plus large/)).toBeInTheDocument();
  });

  it("ni abstention ni absence ne rendent le libellé Contre", () => {
    const abst = render(<VoteRelationBadge relation="ABSTENTION_SAME_OBJECT" />);
    expect(abst.queryByText("Contre")).toBeNull();
    abst.unmount();
    const abs = render(<VoteRelationBadge relation="ABSENCE_SAME_OBJECT" />);
    expect(abs.queryByText("Contre")).toBeNull();
  });

  it("recherche non effectuée s'affiche comme périmètre non examiné, jamais comme une position", () => {
    const { container } = render(<VoteRelationBadge relation="SEARCH_NOT_DONE" />);
    expect(container.querySelector("[data-vote-position]")).toBeNull();
    expect(screen.getByText(/périmètre non examiné/)).toBeInTheDocument();
  });

  it("le détail sourcé est rendu quand il est fourni", () => {
    render(
      <VoteRelationBadge
        relation="FAVORABLE_SAME_OBJECT"
        basisDetails="scrutin no 1234, Assemblée, législature 17, vérifié le 4 août 2026"
      />
    );
    expect(screen.getByText(/scrutin no 1234/)).toBeInTheDocument();
  });
});
