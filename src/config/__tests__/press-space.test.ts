import { describe, expect, it } from "vitest";
import {
  CONTRIBUTORS,
  PRESS_MENTIONS,
  PRESS_SPACE_UPDATED_AT,
  publishedContributors,
  sortedMentions,
  type Contributor,
  type PressMention,
} from "../press-space";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_QUOTE_WORDS = 25;

function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function wordCount(text: string): number {
  return text.replace(/\[…\]/g, "").trim().split(/\s+/).filter(Boolean).length;
}

/** Problems with one mention; empty when it is publishable. */
function mentionProblems(m: PressMention): string[] {
  const problems: string[] = [];
  for (const url of [m.url, m.archiveUrl]) {
    if (!url.startsWith("https://")) problems.push(`non-https url: ${url}`);
  }
  if (!m.archiveUrl.startsWith("https://web.archive.org/web/")) problems.push("archive");
  if (!isIsoDate(m.consultedAt)) problems.push("consultedAt");
  if (m.publishedAt !== undefined && !isIsoDate(m.publishedAt)) problems.push("publishedAt");
  if (m.quote.trim() === "") problems.push("empty quote");
  if (wordCount(m.quote) > MAX_QUOTE_WORDS) problems.push("quote too long");
  for (const text of [m.title, m.quote, m.source]) {
    if (/&#|&amp;|&quot;|&lt;|&gt;/.test(text)) problems.push(`html entity: ${text}`);
  }
  return problems;
}

/** Problems with one contributor; empty when it is publishable. */
function contributorProblems(c: Contributor): string[] {
  const problems: string[] = [];
  if (!/^[A-Za-z0-9-]+$/.test(c.handle)) problems.push("handle");
  if (!isIsoDate(c.firstContributionAt)) problems.push("firstContributionAt");
  if (c.consentedAt !== null && !isIsoDate(c.consentedAt)) problems.push("consentedAt");
  if (c.contributions.length === 0) problems.push("no contribution");
  for (const x of c.contributions) {
    if (!/^https:\/\/github\.com\/ironlam\/poligraph\/(pull|issues)\/\d+$/.test(x.url)) {
      problems.push(`link: ${x.url}`);
    }
    // Only merged code is "a contribué"; everything else is a proposal or a report.
    if (x.verb === "a contribué" && x.state !== "livré") problems.push("code not delivered");
  }
  return problems;
}

const validMention = PRESS_MENTIONS[0]!;
const validContributor = CONTRIBUTORS[0]!;

describe("press space mentions", () => {
  it.each(PRESS_MENTIONS.map((m) => [m.source, m] as const))("%s is publishable", (_, m) => {
    expect(mentionProblems(m)).toEqual([]);
  });

  it.each([
    ["http url", { url: "http://example.org" }],
    ["missing archive", { archiveUrl: "https://example.org/copy" }],
    ["bad consultedAt", { consultedAt: "10/10/2026" }],
    ["bad publishedAt", { publishedAt: "2026-13-40" }],
    ["empty quote", { quote: "  " }],
    ["long quote", { quote: "mot ".repeat(MAX_QUOTE_WORDS + 1) }],
    ["html entity", { title: "VÉRIF&#x27; - titre" }],
  ])("rejects a mention with %s", (_, patch) => {
    expect(mentionProblems({ ...validMention, ...patch })).not.toEqual([]);
  });

  it("lists dated mentions first, most recent first", () => {
    const sorted = sortedMentions([
      { ...validMention, url: "https://a.example", publishedAt: undefined },
      { ...validMention, url: "https://b.example", publishedAt: "2026-01-01" },
      { ...validMention, url: "https://c.example", publishedAt: "2026-05-01" },
    ]);
    expect(sorted.map((m) => m.url)).toEqual([
      "https://c.example",
      "https://b.example",
      "https://a.example",
    ]);
  });

  it("has a valid update date for the sitemap", () => {
    expect(isIsoDate(PRESS_SPACE_UPDATED_AT)).toBe(true);
  });
});

describe("press space contributors", () => {
  it.each(CONTRIBUTORS.map((c) => [c.handle, c] as const))("%s is well formed", (_, c) => {
    expect(contributorProblems(c)).toEqual([]);
  });

  it("has no duplicate handle", () => {
    const handles = CONTRIBUTORS.map((c) => c.handle.toLowerCase());
    expect(new Set(handles).size).toBe(handles.length);
  });

  it.each([
    ["bad handle", { handle: "a b" }],
    ["no contribution", { contributions: [] }],
    [
      "foreign link",
      {
        contributions: [
          { verb: "a proposé", label: "x", url: "https://example.org/1", state: "à l'étude" },
        ],
      },
    ],
    [
      "undelivered code",
      {
        contributions: [
          {
            verb: "a contribué",
            label: "x",
            url: "https://github.com/ironlam/poligraph/pull/1",
            state: "à l'étude",
          },
        ],
      },
    ],
  ] as const)("rejects a contributor with %s", (_, patch) => {
    expect(contributorProblems({ ...validContributor, ...patch } as Contributor)).not.toEqual([]);
  });

  it("publishes only contributors who agreed, code first", () => {
    const list: Contributor[] = [
      { ...validContributor, handle: "issue-only", consentedAt: "2026-10-11" },
      { ...validContributor, handle: "no-consent", consentedAt: null },
      {
        handle: "coder",
        firstContributionAt: "2026-12-01",
        consentedAt: "2026-10-11",
        contributions: [
          {
            verb: "a contribué",
            label: "x",
            url: "https://github.com/ironlam/poligraph/pull/1",
            state: "livré",
          },
        ],
      },
    ];
    expect(publishedContributors(list).map((c) => c.handle)).toEqual(["coder", "issue-only"]);
  });
});
