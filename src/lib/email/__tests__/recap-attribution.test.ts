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
const witness = ATTRIBUTION_ROWS.find((r) => r.key === "indirectWitnessConvicted")!;
const directConvicted = ATTRIBUTION_ROWS.find((r) => r.key === "directPenalConvicted")!;

const titleOf = (row: AttributionRow): string => `Affaire de test ${row.key}`;
const slugOf = (row: AttributionRow): string => `affaire-${row.key}`;

function sqlText(call: unknown[]): string {
  const query = call[0] as { sql?: string } | readonly string[];
  if (!Array.isArray(query)) return (query as { sql?: string }).sql ?? "";
  return query.join("?");
}

function sqlValues(call: unknown[]): unknown[] {
  const query = call[0] as { values?: unknown[] } | readonly string[];
  return Array.isArray(query) ? call.slice(1) : ((query as { values?: unknown[] }).values ?? []);
}

/**
 * Filtre d'implication que la requête SQL applique réellement : la liste d'exclusion écrite à la
 * main, ou le fragment partagé `a.involvement IN (...)` dont on relit les valeurs liées.
 */
function involvementFilterFor(call: unknown[]): (row: AttributionRow) => boolean {
  const sql = sqlText(call);
  if (sql.includes("a.involvement NOT IN ('VICTIM', 'PLAINTIFF', 'MENTIONED_ONLY')")) {
    return (r) => !["VICTIM", "PLAINTIFF", "MENTIONED_ONLY"].includes(r.involvement);
  }
  const match = /a\.involvement IN \(([?,\s]+)\)/.exec(sql);
  if (!match) throw new Error("filtre d'implication introuvable dans la requête des affaires");
  const offset = (sql.slice(0, match.index).match(/\?/g) ?? []).length;
  const size = (match[1]!.match(/\?/g) ?? []).length;
  const allowed = sqlValues(call).slice(offset, offset + size);
  return (r) => allowed.includes(r.involvement);
}

/**
 * Émule la requête SQL des nouvelles affaires sur la fixture : même filtre d'implication que la
 * requête, et seulement les colonnes qu'elle sélectionne réellement.
 */
function affairRowsFor(call: unknown[]): Record<string, unknown>[] {
  const sql = sqlText(call);
  return ATTRIBUTION_ROWS.filter(involvementFilterFor(call)).map((r) => {
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

/** Restreint la requête des affaires à ces lignes de fixture, sans toucher à son filtre. */
function onlyAffairRows(...rows: AttributionRow[]): void {
  mocks.queryRaw.mockImplementation((...args: unknown[]) => {
    const sql = sqlText(args);
    if (!sql.includes('FROM "Affair" a')) return Promise.resolve([]);
    const slugs = rows.map(slugOf);
    return Promise.resolve(affairRowsFor(args).filter((r) => slugs.includes(r.slug as string)));
  });
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
      return Promise.resolve(sql.includes('FROM "Affair" a') ? affairRowsFor(args) : []);
    });
    mocks.scrutinFindMany.mockResolvedValue([]);
    mocks.factCheckGroupBy.mockResolvedValue([]);
    mocks.pressArticleFindMany.mockResolvedValue([pressArticleWithAllAffairs()]);
    mocks.pressArticleCount.mockResolvedValue(1);
    mocks.politicianFindMany.mockResolvedValue([]);
    mocks.affairFindMany.mockResolvedValue([]);
    mocks.platformUpdateFindMany.mockResolvedValue([]);
  });

  it("nouvelles affaires : le témoin n'y figure pas, le mis en cause garde sa certitude", async () => {
    const recap = await loadRecap();
    const directEntry = recap.affairs.newAffairs.find((a) => a.slug === slugOf(directConvicted))!;

    expect(recap.affairs.newAffairs.find((a) => a.slug === slugOf(witness))).toBeUndefined();
    expect(recap.affairs.newAffairs.every((a) => a.involvement === "DIRECT")).toBe(true);
    expect(directEntry).toMatchObject({ involvement: "DIRECT", certaintyLevel: "ETABLI" });
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

  it("e-mail HTML : aucune entrée ni ligne « Impliquant » pour le témoin", async () => {
    onlyAffairRows(witness, directConvicted);
    const { html } = renderNewsletterHtml({
      recap: await loadRecap(),
      editorialIntro: "",
      politician: null,
    });

    expect(() => htmlEntryFor(html, titleOf(witness))).toThrow();
    expect(html).not.toContain(`Élu ${witness.key}`);

    const directHtml = htmlEntryFor(html, titleOf(directConvicted));
    expect(directHtml).toContain(CERTAINTY_LABELS.ETABLI);
    expect(directHtml).toContain(`Élu ${directConvicted.key}`);
  });

  it("e-mail texte brut : aucune ligne pour le témoin, ni « Impliquant » à son nom", async () => {
    onlyAffairRows(witness, directConvicted);
    const { text } = renderNewsletterHtml({
      recap: await loadRecap(),
      editorialIntro: "",
      politician: null,
    });

    expect(() => textLineFor(text, titleOf(witness))).toThrow();
    expect(text).not.toContain(`Impliquant Élu ${witness.key}`);

    expect(textLineFor(text, titleOf(directConvicted))).toBe(
      `[${CERTAINTY_LABELS.ETABLI}] ${titleOf(directConvicted)}`
    );
    expect(text).toContain(`Impliquant Élu ${directConvicted.key}`);
  });

  it("semaine dont la seule affaire est un témoin condamné : ni rôle à charge, ni « Impliquant »", async () => {
    onlyAffairRows(witness);
    mocks.pressArticleFindMany.mockResolvedValue([]);
    mocks.pressArticleCount.mockResolvedValue(0);

    const recap = await loadRecap();
    expect(recap.affairs.newAffairs).toEqual([]);

    const { html, text } = renderNewsletterHtml({ recap, editorialIntro: "", politician: null });
    for (const output of [html, text]) {
      expect(output).not.toContain(titleOf(witness));
      expect(output).not.toContain("Impliquant");
      for (const label of CERTAINTY_LABEL_VALUES) expect(output).not.toContain(label);
    }
  });
});
