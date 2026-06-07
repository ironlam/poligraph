import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AffairCard } from "@/components/politicians/AffairCard";

function makeAffair(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    title: "Affaire de test",
    description: "Description factuelle des faits.",
    status: "RELAXE",
    category: "CORRUPTION",
    involvement: "DIRECT",
    factsDate: null,
    startDate: null,
    verdictDate: new Date("2024-01-15"),
    appeal: false,
    court: null,
    chamber: null,
    caseNumber: null,
    partyAtTime: null,
    events: [],
    sources: [],
    // SentenceDetails nullable fields
    prisonMonths: null,
    prisonSuspended: null,
    fineAmount: null,
    ineligibilityMonths: null,
    communityService: null,
    otherSentence: null,
    sentence: null,
    ...overrides,
  };
}

describe("AffairCard — issues favorables dominantes (RGPD art. 10)", () => {
  it("une relaxe affiche l'encart favorable AVANT la description", () => {
    const { container } = render(<AffairCard affair={makeAffair()} variant="other" />);
    const note = container.querySelector('[role="note"][data-variant="favorable"]');
    expect(note).toBeTruthy();
    const description = Array.from(container.querySelectorAll("p")).find((p) =>
      p.textContent?.includes("Description factuelle")
    );
    expect(description).toBeTruthy();
    // L'encart précède la description dans l'ordre du DOM
    expect(
      note!.compareDocumentPosition(description!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("une prescription affiche son wording distinct, pas celui des relaxes", () => {
    const { container } = render(
      <AffairCard affair={makeAffair({ status: "PRESCRIPTION" })} variant="other" />
    );
    const note = container.querySelector('[role="note"][data-variant="prescription"]');
    expect(note?.textContent).toContain("Action publique éteinte par prescription");
    expect(container.querySelector('[data-variant="favorable"]')).toBeNull();
  });

  it("une affaire close sans condamnation n'affiche jamais la présomption d'innocence", () => {
    for (const status of [
      "RELAXE",
      "ACQUITTEMENT",
      "NON_LIEU",
      "CLASSEMENT_SANS_SUITE",
      "PRESCRIPTION",
    ]) {
      const { container } = render(<AffairCard affair={makeAffair({ status })} variant="other" />);
      expect(container.textContent).not.toContain("présumée innocente");
    }
  });

  it("une procédure en cours DIRECT affiche la présomption d'innocence", () => {
    const { container } = render(
      <AffairCard affair={makeAffair({ status: "MISE_EN_EXAMEN" })} variant="other" />
    );
    expect(container.textContent).toContain("présumée innocente");
  });

  it("aucun encart quand le politicien est victime", () => {
    const { container } = render(
      <AffairCard
        affair={makeAffair({ status: "ENQUETE_PRELIMINAIRE", involvement: "VICTIM" })}
        variant="other"
      />
    );
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});
