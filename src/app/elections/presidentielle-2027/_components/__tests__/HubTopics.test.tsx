import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HubTopics } from "../HubTopics";

describe("HubTopics", () => {
  it("propose des liens de recherche compacts avec leur thématique", () => {
    render(
      <HubTopics
        subtopics={[
          {
            slug: "acces-aux-soins",
            label: "Accès aux soins",
            theme: "SANTE",
            themeLabel: "Santé",
            measureCount: 12,
            candidacyCount: 7,
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Explorer un sujet précis" })).toBeInTheDocument();
    expect(screen.getByText("Santé")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Accès aux soins/ })).toHaveAttribute(
      "href",
      "/elections/presidentielle-2027/recherche?q=Acc%C3%A8s+aux+soins"
    );
  });

  it("ne rend pas de section sans sous-thème validé", () => {
    const { container } = render(<HubTopics subtopics={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
