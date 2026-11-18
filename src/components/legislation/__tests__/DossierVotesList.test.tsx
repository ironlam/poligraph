import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DossierVotesList } from "@/components/legislation/DossierVotesList";

function vote(i: number, type: "AMENDEMENT" | "ARTICLE") {
  return {
    slug: `2025-03-10-${type.toLowerCase()}-${i}`,
    title: `Scrutin ${type} ${i}`,
    votingDate: new Date("2025-03-10T00:00:00Z"),
    votesFor: 100,
    votesAgainst: 50,
    votesAbstain: 5,
    result: "ADOPTED" as const,
    type,
  };
}

function scrutinLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll('a[href^="/parlement/votes/"]')].map(
    (a) => a.getAttribute("href")!
  );
}

describe("DossierVotesList", () => {
  it("links every vote of the dossier, texts and amendments alike", () => {
    // 15 texts and 40 amendments: both groups go past the ten cards, and the old client
    // component rendered ten links in all, none of them an amendment.
    const votes = [
      ...Array.from({ length: 15 }, (_, i) => vote(i, "ARTICLE")),
      ...Array.from({ length: 40 }, (_, i) => vote(i, "AMENDEMENT")),
    ];
    const { container } = render(<DossierVotesList votes={votes} />);

    const links = scrutinLinks(container);
    expect(new Set(links).size).toBe(55);
    for (const v of votes) expect(links).toContain(`/parlement/votes/${v.slug}`);
  });

  it("folds the votes beyond the first ten without removing them", () => {
    const votes = Array.from({ length: 25 }, (_, i) => vote(i, "AMENDEMENT"));
    const { container } = render(<DossierVotesList votes={votes} />);

    const details = container.querySelector("details")!;
    expect(details.hasAttribute("open")).toBe(false);
    expect(details.querySelector("summary")!.textContent).toBe("Voir les 15 autres amendements");
    expect(scrutinLinks(details)).toHaveLength(15);
    expect(scrutinLinks(container)).toHaveLength(25);
  });

  it("has nothing to fold for a short dossier", () => {
    const { container } = render(
      <DossierVotesList votes={[vote(1, "ARTICLE"), vote(2, "ARTICLE")]} />
    );
    expect(container.querySelector("details")).toBeNull();
    expect(scrutinLinks(container)).toHaveLength(2);
  });
});
