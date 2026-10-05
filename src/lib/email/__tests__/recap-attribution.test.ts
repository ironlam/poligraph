import { beforeEach, describe, it, expect, vi } from "vitest";
import { CERTAINTY_LABELS, getCertaintyLevel } from "@/config/certainty";
import {
  ATTRIBUTION_ROWS,
  type AttributionRow,
} from "@/lib/affairs/__tests__/fixtures/attribution";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  scrutinFindMany: vi.fn(),
  factCheckGroupBy: vi.fn(),
  pressArticleFindMany: vi.fn(),
  pressArticleCount: vi.fn(),
  politicianFindMany: vi.fn(),
  affairFindMany: vi.fn(),
  platformUpdateFindMany: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    scrutin: { findMany: mocks.scrutinFindMany },
    factCheck: { groupBy: mocks.factCheckGroupBy },
    pressArticle: { findMany: mocks.pressArticleFindMany, count: mocks.pressArticleCount },
    politician: { findMany: mocks.politicianFindMany },
    affair: { findMany: mocks.affairFindMany },
    platformUpdate: { findMany: mocks.platformUpdateFindMany },
  },
}));

import { getWeeklyRecap, type WeeklyRecapData } from "@/lib/data/recap";
import { renderNewsletterHtml } from "../render-recap";

const CERTAINTY_LABEL_VALUES = Object.values(CERTAINTY_LABELS);
const WITNESS_ROLE = "Témoin/Secondaire";
const witness = ATTRIBUTION_ROWS.find((r) => r.key === "indirectWitnessConvicted")!;
const directConvicted = ATTRIBUTION_ROWS.find((r) => r.key === "directPenalConvicted")!;

const titleOf = (row: AttributionRow): string => `Affaire de test ${row.key}`;
const slugOf = (row: AttributionRow): string => `affaire-${row.key}`;

function sqlText(call: unknown[]): string {
  const query = call[0] as { sql?: string } | readonly string[];
  if (!Array.isArray(query)) return (query as { sql?: string }).sql ?? "";
  return query.join("?");
}

/**
 * Émule la requête SQL des nouvelles affaires sur la fixture : même périmètre de lignes
 * (implication hors victime, plaignant, simple mention), et seulement les colonnes que la
 * requête sélectionne réellement.
 */
function affairRowsFor(sql: string): Record<string, unknown>[] {
  const excluded = ["VICTIM", "PLAINTIFF", "MENTIONED_ONLY"];
  return ATTRIBUTION_ROWS.filter((r) => !excluded.includes(r.involvement)).map((r) => {
    const row: Record<string, unknown> = {
      slug: slugOf(r),
      title: titleOf(r),
      politicianName: `Élu ${r.key}`,
      politicianSlug: `elu-${r.key}`,
    };
    if (/a\.status\s+as\s+"status"|a\.status,/.test(sql)) row.status = r.status;
    if (/a\.involvement\s+as\s+"involvement"|a\.involvement,/.test(sql)) {
      row.involvement = r.involvement;
    }
    if (sql.includes('as "certaintyLevel"')) row.certaintyLevel = getCertaintyLevel(r.status);
    return row;
  });
}

function pressArticleWithAllAffairs() {
  return {
    id: "article-1",
    title: "Article de test",
    feedSource: "Source de test",
    url: "https://example.org/article-1",
    imageUrl: null,
    publishedAt: new Date("2026-08-11T08:00:00.000Z"),
    aiSummary: "Résumé.",
    isAffairRelated: true,
    mentions: [],
    partyMentions: [],
    affairLinks: ATTRIBUTION_ROWS.map((r) => ({
      affair: {
        slug: slugOf(r),
        title: titleOf(r),
        status: r.status,
        involvement: r.involvement,
      },
    })),
  };
}

async function loadRecap(): Promise<WeeklyRecapData> {
  return getWeeklyRecap(new Date("2026-08-10T00:00:00.000Z"));
}

/** Bloc HTML de l'entrée d'affaire qui contient ce titre (un `<div>` par entrée). */
function htmlEntryFor(html: string, title: string): string {
  const entries = html.split('<div style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">');
  const entry = entries.find((e) => e.includes(title));
  if (!entry) throw new Error(`entrée introuvable : ${title}`);
  return entry.split("</div>")[0]!;
}

/** Ligne du texte brut qui porte le titre de l'affaire. */
function textLineFor(text: string, title: string): string {
  const line = text.split("\n").find((l) => l.endsWith(title));
  if (!line) throw new Error(`ligne introuvable : ${title}`);
  return line;
}

describe("récap : la certitude ne s'attribue qu'au mis en cause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockImplementation((...args: unknown[]) => {
      const sql = sqlText(args);
      return Promise.resolve(sql.includes('FROM "Affair" a') ? affairRowsFor(sql) : []);
    });
    mocks.scrutinFindMany.mockResolvedValue([]);
    mocks.factCheckGroupBy.mockResolvedValue([]);
    mocks.pressArticleFindMany.mockResolvedValue([pressArticleWithAllAffairs()]);
    mocks.pressArticleCount.mockResolvedValue(1);
    mocks.politicianFindMany.mockResolvedValue([]);
    mocks.affairFindMany.mockResolvedValue([]);
    mocks.platformUpdateFindMany.mockResolvedValue([]);
  });

  it("nouvelles affaires : le témoin garde son rôle et n'a pas de certitude", async () => {
    const recap = await loadRecap();
    const witnessEntry = recap.affairs.newAffairs.find((a) => a.slug === slugOf(witness))!;
    const directEntry = recap.affairs.newAffairs.find((a) => a.slug === slugOf(directConvicted))!;

    expect(witnessEntry).toMatchObject({ involvement: "INDIRECT", certaintyLevel: null });
    expect(directEntry).toMatchObject({ involvement: "DIRECT", certaintyLevel: "ETABLI" });
  });

  it("le témoin ne passe pas devant les mis en cause dans la liste", async () => {
    const recap = await loadRecap();
    const levels = recap.affairs.newAffairs.map((a) => a.certaintyLevel);
    expect(levels.indexOf(null)).toBe(levels.length - 1);
  });

  it("affaires liées aux articles : aucune certitude hors DIRECT", async () => {
    const recap = await loadRecap();
    const [story] = recap.press.storiesOfTheWeek;
    expect(story).toBeDefined();

    for (const row of ATTRIBUTION_ROWS) {
      const mention = story!.mentions.affairs.find((a) => a.slug === slugOf(row))!;
      const aggregate = recap.press.byAffair.find((a) => a.slug === slugOf(row))!;
      const expected = row.involvement === "DIRECT" ? getCertaintyLevel(row.status) : null;
      expect(mention.certaintyLevel, row.key).toBe(expected);
      expect(aggregate.certaintyLevel, row.key).toBe(expected);
      expect(mention.involvement, row.key).toBe(row.involvement);
    }
  });

  it("e-mail HTML : l'entrée du témoin affiche son rôle, aucun libellé de certitude", async () => {
    const { html } = renderNewsletterHtml({
      recap: await loadRecap(),
      editorialIntro: "",
      politician: null,
    });

    const witnessHtml = htmlEntryFor(html, titleOf(witness));
    expect(witnessHtml).toContain(WITNESS_ROLE);
    for (const label of CERTAINTY_LABEL_VALUES) expect(witnessHtml).not.toContain(label);

    const directHtml = htmlEntryFor(html, titleOf(directConvicted));
    expect(directHtml).toContain(CERTAINTY_LABELS.ETABLI);
  });

  it("e-mail texte brut : la ligne du témoin porte son rôle, aucun libellé de certitude", async () => {
    const { text } = renderNewsletterHtml({
      recap: await loadRecap(),
      editorialIntro: "",
      politician: null,
    });

    const witnessLine = textLineFor(text, titleOf(witness));
    expect(witnessLine).toBe(`[${WITNESS_ROLE}] ${titleOf(witness)}`);
    for (const label of CERTAINTY_LABEL_VALUES) expect(witnessLine).not.toContain(label);

    expect(textLineFor(text, titleOf(directConvicted))).toBe(
      `[${CERTAINTY_LABELS.ETABLI}] ${titleOf(directConvicted)}`
    );
  });

  it("e-mail dont la seule affaire est un témoin condamné : aucun libellé de certitude nulle part", async () => {
    mocks.queryRaw.mockImplementation((...args: unknown[]) => {
      const sql = sqlText(args);
      if (!sql.includes('FROM "Affair" a')) return Promise.resolve([]);
      return Promise.resolve(affairRowsFor(sql).filter((r) => r.slug === slugOf(witness)));
    });
    mocks.pressArticleFindMany.mockResolvedValue([]);
    mocks.pressArticleCount.mockResolvedValue(0);

    const { html, text } = renderNewsletterHtml({
      recap: await loadRecap(),
      editorialIntro: "",
      politician: null,
    });

    for (const output of [html, text]) {
      expect(output).toContain(WITNESS_ROLE);
      for (const label of CERTAINTY_LABEL_VALUES) expect(output).not.toContain(label);
    }
  });
});
