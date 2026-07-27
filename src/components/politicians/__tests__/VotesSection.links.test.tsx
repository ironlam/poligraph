import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { VotesSection } from "@/components/politicians/VotesSection";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The @/components/votes barrel reaches src/lib/data/scrutins at import time,
// which instantiates the Prisma client. Nothing here queries: stub it out so the
// suite stays a pure render test with no DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

// Minimal shape: only the "Derniers votes" branch is under test, so the stats /
// parliamentary-card fields stay at their empty values.
const voteData = (scrutin: { id: string; slug: string | null }) =>
  ({
    stats: { total: 1, pour: 1, contre: 0, abstention: 0 },
    recentVotes: [
      {
        id: "vote-1",
        position: "POUR",
        scrutin: {
          ...scrutin,
          title: "Projet de loi de finances",
          votingDate: new Date("2026-03-04"),
          result: "ADOPTED",
          policyTitle: null,
        },
      },
    ],
  }) as never;

const renderSection = (scrutin: { id: string; slug: string | null }) =>
  render(
    <VotesSection
      slug="jean-dupont"
      voteData={voteData(scrutin)}
      parliamentaryCard={null}
      currentMandate={null}
      currentGroup={null}
    />
  );

describe("VotesSection : liens des derniers votes", () => {
  it("pointe sur le slug du scrutin, pas sur le cuid qui ne fait que rediriger", () => {
    const { container } = renderSection({
      id: "cmr3vd86j010c04jp8dsdb49o",
      slug: "2026-03-04-projet-de-loi-de-finances",
    });

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/parlement/votes/2026-03-04-projet-de-loi-de-finances");
    expect(hrefs).not.toContain("/parlement/votes/cmr3vd86j010c04jp8dsdb49o");
  });

  it("retombe sur l'identifiant quand le scrutin n'a pas de slug", () => {
    const { container } = renderSection({ id: "cmr3vd86j010c04jp8dsdb49o", slug: null });

    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/parlement/votes/cmr3vd86j010c04jp8dsdb49o");
  });
});
