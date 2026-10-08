import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ChronologySummary } from "@/components/affairs/ChronologySummary";
import type { PublicAffairEvent } from "@/components/affairs/AffairChronology";

const today = new Date("2026-10-08T10:00:00Z");

function ev(overrides: Partial<PublicAffairEvent>): PublicAffairEvent {
  return {
    id: "e",
    status: "PUBLISHED",
    incidental: false,
    type: "AUDIENCE",
    date: new Date("2025-03-10T00:00:00Z"),
    datePrecision: "DAY",
    dateEnd: null,
    occurrence: "HELD",
    outcome: null,
    title: null,
    court: null,
    description: null,
    sourceUrl: null,
    sourceTitle: null,
    sourceKind: null,
    ...overrides,
  } as PublicAffairEvent;
}

const text = (c: HTMLElement) => c.textContent?.replace(/\s+/g, " ").trim();

describe("ChronologySummary", () => {
  it("n'affiche rien sans étape", () => {
    const { container } = render(<ChronologySummary events={[]} today={today} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pluriel avec dernière étape tenue", () => {
    const { container } = render(
      <ChronologySummary
        events={[
          ev({ id: "1", type: "FAITS", date: new Date("2020-01-01T00:00:00Z") }),
          ev({ id: "2", type: "JUGEMENT", date: new Date("2024-06-12T00:00:00Z") }),
        ]}
        today={today}
      />
    );
    expect(text(container)).toBe("2 étapes · dernière : Jugement, 12 juin 2024");
  });

  it("singulier", () => {
    const { container } = render(
      <ChronologySummary events={[ev({ type: "JUGEMENT" })]} today={today} />
    );
    expect(text(container)).toMatch(/^1 étape · dernière : /);
  });

  it("ajoute la prochaine étape annoncée", () => {
    const { container } = render(
      <ChronologySummary
        events={[
          ev({ id: "1", type: "JUGEMENT", date: new Date("2024-06-12T00:00:00Z") }),
          ev({
            id: "2",
            type: "APPEL",
            occurrence: "SCHEDULED",
            date: new Date("2027-02-03T00:00:00Z"),
          }),
        ]}
        today={today}
      />
    );
    expect(text(container)).toContain(" · prochaine : ");
    expect(text(container)).toContain("3 février 2027");
  });

  it("ne compte pas comme prochaine une étape annoncée passée", () => {
    const { container } = render(
      <ChronologySummary
        events={[
          ev({ id: "1", type: "JUGEMENT", date: new Date("2024-06-12T00:00:00Z") }),
          ev({
            id: "2",
            type: "APPEL",
            occurrence: "SCHEDULED",
            date: new Date("2025-02-03T00:00:00Z"),
          }),
        ]}
        today={today}
      />
    );
    expect(text(container)).not.toContain("prochaine");
    expect(text(container)).toMatch(/^2 étapes/);
  });

  it("omet « dernière » quand aucune étape n'est tenue", () => {
    const { container } = render(
      <ChronologySummary
        events={[
          ev({ type: "APPEL", occurrence: "SCHEDULED", date: new Date("2027-02-03T00:00:00Z") }),
        ]}
        today={today}
      />
    );
    expect(text(container)).not.toContain("dernière");
    expect(text(container)).toContain("prochaine");
  });

  it("ignore les étapes non publiées ou sans statut (ancien snapshot)", () => {
    const noStatus = { ...ev({ id: "x" }), status: undefined } as unknown as PublicAffairEvent;
    const { container } = render(
      <ChronologySummary
        events={[noStatus, ev({ id: "y", status: "DRAFT" as PublicAffairEvent["status"] })]}
        today={today}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
