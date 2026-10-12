import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CandidacyStatusBadge, candidacyBadgeLabel } from "../CandidacyStatusBadge";

describe("CandidacyStatusBadge", () => {
  it.each([
    ["OFFICIAL", "Officielle"],
    ["DECLARE", "Annoncée"],
    ["PRESSENTI", "Pressentie"],
    ["ENVISAGE", "Évoquée"],
    ["RETIRE", "Retirée"],
  ] as const)("mappe %s vers son libellé public", (status, label) => {
    expect(candidacyBadgeLabel(status)).toBe(label);
  });

  it("distingue une défaite à la primaire d'un retrait", () => {
    expect(candidacyBadgeLabel("RETIRE", "Défaite à la primaire")).toBe(
      "Non retenue à la primaire"
    );
    expect(candidacyBadgeLabel("RETIRE", "Retrait personnel")).toBe("Retirée");
    expect(candidacyBadgeLabel("DECLARE", "Défaite à la primaire")).toBe("Annoncée");
    render(<CandidacyStatusBadge status="RETIRE" withdrewReason="Défaite à la primaire" />);
    expect(screen.getByText("Non retenue à la primaire")).toBeInTheDocument();
    expect(screen.queryByText("Retirée")).not.toBeInTheDocument();
  });

  it("reste une information sans lien", () => {
    render(
      <TooltipProvider>
        <CandidacyStatusBadge status="DECLARE" />
      </TooltipProvider>
    );
    expect(screen.getByText("Annoncée")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aide : information" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aide : information" })).toHaveAttribute(
      "title",
      "Aide : information"
    );
  });

  it("ne peut plus porter d'URL externe", () => {
    const source = readFileSync(
      "src/app/elections/presidentielle-2027/_components/CandidacyStatusBadge.tsx",
      "utf8"
    );
    expect(source).not.toMatch(/href=|sourceUrl|target=/);
  });
});
