import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CondamnationCard } from "../CondamnationCard";

const baseAffair = {
  id: "aff1",
  slug: "test-affair",
  title: "Affaire de test",
  status: "CONDAMNATION_DEFINITIVE" as const,
  category: "CORRUPTION" as const,
  severity: "GRAVE" as const,
  involvement: "DIRECT" as const,
  verdictDate: new Date("2024-06-15"),
  startDate: null,
  factsDate: null,
  sentence: "3 ans avec sursis, 15 000 € d'amende",
  politicianId: "pol1",
  partyAtTimeId: null,
  partyAtTime: null,
  politician: {
    id: "pol1",
    slug: "jean-test",
    firstName: "Jean",
    lastName: "Test",
    fullName: "Jean Test",
    photoUrl: null,
    blobPhotoUrl: null,
    currentParty: null,
  },
  sources: [{ id: "s1" }, { id: "s2" }],
} as unknown as Parameters<typeof CondamnationCard>[0]["affair"];

describe("CondamnationCard", () => {
  it("renders a definitive conviction", () => {
    const { container, getByText } = render(<CondamnationCard affair={baseAffair} definitif />);
    expect(getByText("Affaire de test")).toBeTruthy();
    expect(getByText("Jean Test")).toBeTruthy();
    expect(container.querySelector('[data-definitif="true"]')).toBeTruthy();
  });

  it("renders a non-definitive conviction with prononcee label", () => {
    const nonDef = {
      ...baseAffair,
      status: "CONDAMNATION_PREMIERE_INSTANCE",
    };
    const { getAllByText } = render(<CondamnationCard affair={nonDef} definitif={false} />);
    expect(getAllByText(/non définitif/i, { exact: false }).length).toBeGreaterThan(0);
  });
});
