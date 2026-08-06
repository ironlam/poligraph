import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScreenReaderSummary } from "../ScreenReaderSummary";
import { mandate } from "./factories";

describe("ScreenReaderSummary", () => {
  it("names the group in the mandate list", () => {
    render(
      <ScreenReaderSummary
        mandates={[
          mandate({
            type: "DEPUTE",
            constituency: "Essonne (1ère)",
            parliamentaryData: { parliamentaryGroup: { name: "Les Démocrates" } },
          }),
        ]}
        timelineAffairs={[]}
        minYear={2022}
        maxYear={2026}
      />
    );

    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Député, Groupe Les Démocrates, Essonne (1ère)"
    );
  });

  it("skips the affiliation when it is unknown", () => {
    render(
      <ScreenReaderSummary
        mandates={[mandate({ type: "DEPUTE", constituency: "Essonne (1ère)" })]}
        timelineAffairs={[]}
        minYear={2022}
        maxYear={2026}
      />
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("Député, Essonne (1ère)");
  });
});
