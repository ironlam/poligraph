import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CandidacyStatusBadge, candidacyBadgeLabel } from "../CandidacyStatusBadge";

describe("CandidacyStatusBadge", () => {
  it.each([
    ["DECLARE", "Annoncée"],
    ["PRESSENTI", "Pressentie"],
    ["ENVISAGE", "Évoquée"],
    ["RETIRE", "Retirée"],
  ] as const)("mappe %s vers son libellé public", (status, label) => {
    expect(candidacyBadgeLabel(status)).toBe(label);
  });

  it("reste une information sans lien", () => {
    render(<CandidacyStatusBadge status="DECLARE" />);
    expect(screen.getByText("Annoncée")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ne peut plus porter d'URL externe", () => {
    const source = readFileSync(
      "src/app/elections/presidentielle-2027/_components/CandidacyStatusBadge.tsx",
      "utf8"
    );
    expect(source).not.toMatch(/href=|sourceUrl|target=/);
  });
});
