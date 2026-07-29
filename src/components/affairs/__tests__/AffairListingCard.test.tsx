import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AffairListingCard, type AffairListingCardData } from "../AffairListingCard";

function baseAffair(overrides: Partial<AffairListingCardData> = {}): AffairListingCardData {
  return {
    id: "aff1",
    slug: "affaire-de-test",
    title: "Affaire de test",
    description: "Description factuelle des faits reprochés.",
    status: "RELAXE",
    involvement: "DIRECT",
    category: "CORRUPTION",
    verdictDate: new Date("2024-06-15"),
    startDate: null,
    factsDate: null,
    sentence: null,
    sources: { length: 2 },
    politician: {
      slug: "jean-test",
      fullName: "Jean Test",
      currentParty: null,
    },
    partyAtTime: null,
    ...overrides,
  };
}

describe("AffairListingCard : présomption d'innocence (RGPD art. 10)", () => {
  it("affaire accusée en cours d'instruction : encart présomption + pill « Procédure en cours »", () => {
    const { container } = render(
      <AffairListingCard affair={baseAffair({ status: "INSTRUCTION", involvement: "DIRECT" })} />
    );
    expect(container.textContent).toContain("présumée innocente");
    expect(container.textContent).toContain("Procédure en cours");
  });

  it("affaire close favorable : pas d'encart présomption « en cours »", () => {
    const { container } = render(
      <AffairListingCard affair={baseAffair({ status: "RELAXE", involvement: "DIRECT" })} />
    );
    expect(container.textContent).not.toContain("présumée innocente");
  });

  it("non-accusé (victime) : pas de pill de certitude à charge, le rôle porte le badge", () => {
    const { container } = render(
      <AffairListingCard
        affair={baseAffair({ status: "CONDAMNATION_DEFINITIVE", involvement: "VICTIM" })}
      />
    );
    expect(container.textContent).not.toContain("Condamnation définitive");
    expect(container.textContent).toContain("Victime");
  });

  it("non-accusé : bordure neutre, jamais la couleur de certitude à charge", () => {
    const accused = render(
      <AffairListingCard
        affair={baseAffair({ status: "CONDAMNATION_DEFINITIVE", involvement: "DIRECT" })}
      />
    );
    const accusedBorder = accused.container.querySelector("article")!.style.borderLeftColor;
    const victim = render(
      <AffairListingCard
        affair={baseAffair({ status: "CONDAMNATION_DEFINITIVE", involvement: "VICTIM" })}
      />
    );
    const victimBorder = victim.container.querySelector("article")!.style.borderLeftColor;
    expect(accusedBorder).not.toBe("");
    expect(victimBorder).not.toBe(accusedBorder);
  });
});

describe("AffairListingCard : citabilité", () => {
  it("expose un contrôle « Citer » (Copier le lien)", () => {
    render(<AffairListingCard affair={baseAffair()} />);
    expect(screen.getByRole("link", { name: /Copier le lien/i })).toBeTruthy();
  });
});
