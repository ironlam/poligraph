import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CONVICTION_ROWS } from "@/lib/affairs/__tests__/fixtures/conviction-rows";
import { PartyAffairsCard, type PartyAffair } from "../PartyAffairsCard";

function toPartyAffairs(rows: readonly (typeof CONVICTION_ROWS)[keyof typeof CONVICTION_ROWS][]) {
  return rows.map(
    (row, i): PartyAffair => ({
      ...row,
      id: `affair-${i}`,
      slug: `affaire-${i}`,
      title: `Affaire fictive ${i}`,
      verdictDate: null,
      politician: { fullName: `Personne ${i}` },
    })
  );
}

function cardText(affairs: PartyAffair[]): string {
  const { container } = render(
    <PartyAffairsCard affairs={affairs} partySlug="parti-a" definitiveConvictions={0} />
  );
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("PartyAffairsCard", () => {
  it("affiche les quatre compteurs avec les libellés de la carte de liste", () => {
    const text = cardText(toPartyAffairs(Object.values(CONVICTION_ROWS)));

    expect(text).toContain("3 condamnations définitives");
    expect(text).toContain("3 condamnations non définitives");
    expect(text).toContain("1 procédure en cours");
    expect(text).toContain("1 close sans condamnation");
  });

  it("accorde au singulier", () => {
    const text = cardText(
      toPartyAffairs([CONVICTION_ROWS.definitiveCorruptionGrave, CONVICTION_ROWS.appealCorruption])
    );

    expect(text).toContain("1 condamnation définitive");
    expect(text).toContain("1 condamnation non définitive");
  });

  it("ne compte pas une enquête préliminaire parmi les procédures en cours", () => {
    const text = cardText(
      toPartyAffairs([CONVICTION_ROWS.preliminaryInquiry, CONVICTION_ROWS.miseEnExamen])
    );

    expect(text).toContain("1 procédure en cours");
    expect(text).not.toMatch(/2 procédures? en cours|Procédure en cours \(2\)/);
  });

  it("ne compte pas une condamnation non pénale", () => {
    const text = cardText(toPartyAffairs([CONVICTION_ROWS.nonPenalDefinitive]));

    expect(text).not.toMatch(/1 condamnation/);
    expect(text).not.toContain("Condamnation définitive (1)");
  });
});
