import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubCorpusState } from "../HubCorpusState";

describe("HubCorpusState", () => {
  it("porte le lien de couverture et qualifie les compteurs comme ceux du corpus", () => {
    render(
      <HubCorpusState
        electionTitle="Élection présidentielle de 2027"
        round1Date={new Date("2027-04-11T12:00:00.000Z")}
        round2Date={new Date("2027-04-25T12:00:00.000Z")}
        dateConfirmed={false}
        verifiedMeasureCount={8}
        themeCount={13}
        comparableThemeCount={4}
        lastReviewedAt={new Date("2026-08-21T12:00:00.000Z")}
        calendarLink={null}
      />
    );

    expect(screen.getByRole("heading", { name: "État du corpus" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Couverture par thématique/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/themes"
    );
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("thématiques suivies, 4 comparables")).toBeInTheDocument();
    expect(screen.getByText(/pas la totalité de la campagne/)).toBeInTheDocument();
    expect(screen.getByText(/dates non confirmées/)).toBeInTheDocument();
  });
});
