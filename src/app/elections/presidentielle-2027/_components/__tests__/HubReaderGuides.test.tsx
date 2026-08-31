import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubReaderGuides } from "../HubReaderGuides";

describe("HubReaderGuides", () => {
  it("ne réserve aucun espace sans repère validé", () => {
    const { container } = render(<HubReaderGuides guides={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("relie le hub aux repères et au glossaire", () => {
    render(
      <HubReaderGuides
        guides={[
          {
            slug: "zones-faibles-emissions",
            label: "Zone à faibles émissions (ZFE)",
            measureCount: 3,
            candidateCount: 2,
          },
        ]}
      />
    );

    expect(screen.getByRole("link", { name: /Zone à faibles émissions/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/reperes/zones-faibles-emissions"
    );
    expect(screen.getByRole("link", { name: /Voir tout le glossaire/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/reperes"
    );
  });
});
