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
    _count: { sources: 2 },
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
  it("expose un contrôle « Citer » pointant vers le permalien de l'affaire", () => {
    render(<AffairListingCard affair={baseAffair()} />);
    const cite = screen.getByRole("link", { name: /Copier le lien/i });
    // Le lien citable vise la page de l'affaire, pas une ancre de la liste.
    expect(cite.getAttribute("href")).toContain("/affaires/affaire-de-test");
  });

  it("affiche le nombre réel de sources vérifiées", () => {
    const { container } = render(
      <AffairListingCard affair={baseAffair({ _count: { sources: 5 } })} />
    );
    expect(container.textContent).toContain("5 sources vérifiées");
  });
});

describe("AffairListingCard : cible de clic étendue", () => {
  it("le titre est le lien de navigation de la carte et porte le périmètre de retour", () => {
    render(
      <AffairListingCard affair={baseAffair()} retour="certainty=EN_COURS" resultCount={12} />
    );
    const titleLink = screen.getByRole("link", { name: "Affaire de test" });
    const href = titleLink.getAttribute("href")!;
    expect(href).toContain("/affaires/affaire-de-test");
    expect(href).toContain("retour=certainty");
    expect(href).toContain("rn=12");
  });

  it("« Voir détails » n'est pas un second lien vers la même cible", () => {
    render(<AffairListingCard affair={baseAffair()} />);
    expect(screen.getByText(/Voir détails/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Voir détails/ })).toBeNull();
  });

  it("l'élu reste un lien imbriqué indépendant", () => {
    render(<AffairListingCard affair={baseAffair()} />);
    const elu = screen.getByRole("link", { name: "Jean Test" });
    expect(elu.getAttribute("href")).toBe("/politiques/jean-test");
  });

  it("sans périmètre, le lien du titre reste propre", () => {
    render(<AffairListingCard affair={baseAffair()} />);
    const titleLink = screen.getByRole("link", { name: "Affaire de test" });
    expect(titleLink.getAttribute("href")).toBe("/affaires/affaire-de-test");
  });
});
