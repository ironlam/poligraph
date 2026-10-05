import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartyAffairsList, type PartyAffair } from "../PartyAffairsList";
import {
  ATTRIBUTION_ROWS,
  type AttributionRow,
} from "@/lib/affairs/__tests__/fixtures/attribution";

const KEYS: AttributionRow["key"][] = [
  "directPenalConvicted",
  "indirectWitnessConvicted",
  "victimViolence",
  "mentionedOnlyConvicted",
];

const AFFAIRS: PartyAffair[] = KEYS.map((key) => {
  const row = ATTRIBUTION_ROWS.find((r) => r.key === key)!;
  return {
    id: key,
    slug: key,
    title: `Affaire ${key}`,
    description: "Faits décrits par les sources.",
    status: row.status,
    category: row.category,
    involvement: row.involvement,
    jurisdictionOrder: row.jurisdictionOrder,
    sentence: null,
    verdictDate: null,
    startDate: null,
    factsDate: null,
    politician: { id: `pol-${key}`, fullName: key, slug: key },
  };
});

describe("PartyAffairsList : onglets par stade", () => {
  it("l'onglet Condamnations ne compte que la personne mise en cause au pénal ; Toutes garde les quatre", () => {
    render(<PartyAffairsList affairs={AFFAIRS} />);

    expect(screen.getByText("Toutes les affaires (4)")).toBeTruthy();
    for (const key of KEYS) expect(screen.getByText(`Affaire ${key}`)).toBeTruthy();

    // Même logique que le compteur « Condamnations » de la page : DIRECT, ordre pénal.
    const tab = screen.getByRole("button", { name: /^Condamnations/ });
    expect(tab.textContent).toBe("Condamnations1");

    fireEvent.click(tab);
    expect(screen.getByText("Affaire directPenalConvicted")).toBeTruthy();
    for (const key of KEYS.slice(1)) expect(screen.queryByText(`Affaire ${key}`)).toBe(null);
  });
});
