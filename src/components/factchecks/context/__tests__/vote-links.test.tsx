import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { ClaimDayBlock, ThemeVotesBlock } from "../FactCheckContextBlocks";
import { EMPTY_FACTCHECK_CONTEXT, type FactCheckContext } from "@/lib/data/factcheck-context";

const author = {
  slug: "manuel-bompard",
  fullName: "Manuel Bompard",
  civility: null,
  photoUrl: null,
  blobPhotoUrl: null,
  mandateTitle: null,
  mandateType: null,
  constituency: null,
  group: null,
  party: null,
};
const vote = (slug: string) => ({
  position: "POUR" as const,
  scrutinSlug: slug,
  scrutinTitle: "Titre court",
  result: "ADOPTED" as const,
});

const context: FactCheckContext = {
  ...EMPTY_FACTCHECK_CONTEXT,
  author,
  claimDay: {
    day: "2026-10-09",
    chambers: [],
    participation: { POUR: 1, CONTRE: 0, ABSTENTION: 0, total: 1 },
    sample: [vote("jour-1")],
  },
  themeVotes: {
    theme: "ECONOMIE_BUDGET",
    participation: { POUR: 2, CONTRE: 0, ABSTENTION: 0, total: 2 },
    recent: [
      { ...vote("theme-1"), votingDate: new Date("2026-11-12") },
      { ...vote("theme-2"), votingDate: new Date("2026-11-04") },
    ],
    recentExcludesAmendments: true,
  },
};

async function render(block: typeof ClaimDayBlock): Promise<string> {
  const element = (await block({ context: Promise.resolve(context) })) as ReactElement;
  return renderToStaticMarkup(element);
}

/** The class attribute of every link to a scrutin detail page. */
function scrutinLinkClasses(html: string, slugs: string[]): string[] {
  return slugs.map((slug) => {
    const match = html.match(new RegExp(`<a[^>]*href="[^"]*${slug}"[^>]*>`));
    expect(match, `lien vers ${slug}`).not.toBeNull();
    return match![0].match(/class="([^"]*)"/)?.[1] ?? "";
  });
}

describe("liens des listes de votes", () => {
  // A one-line title used to give a link about 20 px high on mobile (review of #1424).
  it("donne 44 px de haut à chaque vote du bloc du thème", async () => {
    for (const cls of scrutinLinkClasses(await render(ThemeVotesBlock), ["theme-1", "theme-2"])) {
      expect(cls.split(" ")).toEqual(expect.arrayContaining(["inline-flex", "min-h-11"]));
    }
  });

  it("donne 44 px de haut à chaque vote du bloc du jour de la déclaration", async () => {
    for (const cls of scrutinLinkClasses(await render(ClaimDayBlock), ["jour-1"])) {
      expect(cls.split(" ")).toEqual(expect.arrayContaining(["inline-flex", "min-h-11"]));
    }
  });
});
