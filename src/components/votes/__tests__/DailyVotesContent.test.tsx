import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DailyVotesContent } from "@/components/votes/DailyVotesContent";
import type { DailyScrutin } from "@/lib/data/scrutins";

function scrutin(i: number, type: DailyScrutin["type"]): DailyScrutin {
  return {
    id: `id-${type}-${i}`,
    externalId: `VTANR5L17V${i}`,
    slug: `2024-05-16-${String(type).toLowerCase()}-${i}`,
    title: `Scrutin ${type} ${i}`,
    votingDate: new Date("2024-05-16T00:00:00Z"),
    sequence: i,
    legislature: 17,
    chamber: "AN",
    votesFor: 120,
    votesAgainst: 80,
    votesAbstain: 3,
    result: i % 2 === 0 ? "ADOPTED" : "REJECTED",
    sourceUrl: null,
    theme: null,
    type,
    summary: null,
    citizenImpact: null,
    policyTitle: null,
  };
}

function scrutinLinks(container: HTMLElement): Set<string> {
  return new Set(
    [...container.querySelectorAll('a[href^="/parlement/votes/"]')].map(
      (a) => a.getAttribute("href")!
    )
  );
}

describe("DailyVotesContent", () => {
  it("links the amendments of the day, not only the texts", () => {
    // The day of the regression: 3 texts, 30 amendments, and 3 links in the server HTML.
    const scrutins = [
      ...Array.from({ length: 3 }, (_, i) => scrutin(i, "ARTICLE")),
      ...Array.from({ length: 30 }, (_, i) => scrutin(i, "AMENDEMENT")),
    ];
    const { container } = render(<DailyVotesContent scrutins={scrutins} />);

    const links = scrutinLinks(container);
    for (const s of scrutins) expect(links).toContain(`/parlement/votes/${s.slug}`);
    expect(links.size).toBe(33);
  });

  it("links a day made only of amendments", () => {
    const scrutins = Array.from({ length: 12 }, (_, i) => scrutin(i, "AMENDEMENT"));
    const { container } = render(<DailyVotesContent scrutins={scrutins} />);
    expect(scrutinLinks(container).size).toBe(12);
  });

  it("counts every scrutin of the day in the summary", () => {
    const scrutins = [scrutin(0, "FINAL"), scrutin(1, "AMENDEMENT"), scrutin(2, "AMENDEMENT")];
    const { container } = render(<DailyVotesContent scrutins={scrutins} />);
    expect(container.textContent).toContain("3 scrutins");
    expect(container.textContent).toContain("2 adoptés");
    expect(container.textContent).toContain("1 rejeté");
  });
});
