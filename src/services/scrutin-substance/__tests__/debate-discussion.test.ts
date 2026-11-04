// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { extractSeanceFromXml } from "@/services/sync/debate-transcript-parse";
import { extractAmendmentDiscussion, validateArgumentCitations } from "../debate-discussion";

const xml = readFileSync(
  new URL("../../sync/__tests__/fixtures/discussion-commune-2024-11-07.xml", import.meta.url),
  "utf8"
);
const seance = extractSeanceFromXml(xml)!;
const target = { number: "I-2697", texteRef: "PRJLANR5L17B0324" };
const discussion = extractAmendmentDiscussion(seance.paragraphs, target)!;

describe("official common discussion, 2697 and 3652", () => {
  it("preserves the real announcements and the commission's reply, even marked sommaire=1", () => {
    expect(seance.paragraphs).toHaveLength(15);
    expect(discussion.common).toBe(true);
    expect(discussion.amendmentNumbers).toEqual(["2697", "3652"]);
    expect(discussion.paragraphs.find((p) => p.id === "3558833")?.scope).toBe("target");
    expect(discussion.paragraphs.find((p) => p.id === "3558836")?.scope).toBe("other");
    expect(discussion.paragraphs.find((p) => p.id === "3558839")?.scope).toBe("shared");
    // An unqualified later reply is context, not automatically an opinion on every amendment.
    expect(discussion.paragraphs.find((p) => p.id === "3558845")?.scope).toBe("context");
    expect(discussion.paragraphs.at(-1)?.id).toBe("3558850");
  });
  it("refuses the same amendment number in a different examined text", () => {
    expect(
      extractAmendmentDiscussion(seance.paragraphs, { ...target, texteRef: "PRJLANR5L17B0999" })
    ).toBeNull();
  });
  it("never confuses the two budget parts when the séance omits the prefix", () => {
    expect(
      extractAmendmentDiscussion(seance.paragraphs, { ...target, number: "II-2697" })
    ).toBeNull();
    const missingPart = seance.paragraphs.map((p) => ({ ...p, budgetPart: null }));
    expect(extractAmendmentDiscussion(missingPart, target)).toBeNull();
  });
  it("does not mistake vote announcements for a debate with arguments", () => {
    const noSpeech = seance.paragraphs.filter(
      (p) => p.role === "president" || /^\s*\(/.test(p.text)
    );
    expect(extractAmendmentDiscussion(noSpeech, target)).toBeNull();
    const result = discussion.paragraphs.find((p) => p.id === "3558846")!;
    expect(
      validateArgumentCitations(
        "Un argument",
        [{ paragraphId: result.id, quote: result.text, scope: "target" }],
        discussion
      )
    ).toBeNull();
  });
  it("refuses an unclosed discussion rather than include an unknown tail", () => {
    expect(extractAmendmentDiscussion(seance.paragraphs.slice(0, 10), target)).toBeNull();
  });
  it("refuses competing episodes for the same amendment", () => {
    expect(
      extractAmendmentDiscussion([...seance.paragraphs, ...seance.paragraphs], target)
    ).toBeNull();
  });
  it("refuses an oversized discussion instead of dropping its last speakers", () => {
    const rows = seance.paragraphs.map((p) =>
      p.id === "3558833" ? { ...p, text: p.text.repeat(30) } : p
    );
    expect(extractAmendmentDiscussion(rows, target)).toBeNull();
  });
  it("requires exact citations and prevents using another amendment's speech", () => {
    const own = discussion.paragraphs.find((p) => p.id === "3558833")!;
    const other = discussion.paragraphs.find((p) => p.id === "3558836")!;
    const cite = { paragraphId: own.id, quote: own.text.slice(0, 80), scope: "target" };
    expect(validateArgumentCitations("Argument sur la cible", [cite], discussion)).toHaveLength(1);
    expect(
      validateArgumentCitations(
        "Argument",
        [{ ...cite, quote: "Une citation fabriquée sans source" }],
        discussion
      )
    ).toBeNull();
    expect(
      validateArgumentCitations(
        "Argument",
        [{ paragraphId: other.id, quote: other.text.slice(0, 80), scope: "target" }],
        discussion
      )
    ).toBeNull();
    expect(validateArgumentCitations("Argument", [], discussion)).toBeNull();
    expect(validateArgumentCitations("", [], discussion)).toEqual([]);
  });
  it("accepts a common argument only with a shared paragraph and explicit scope", () => {
    const shared = discussion.paragraphs.find((p) => p.id === "3558839")!;
    const cite = { paragraphId: shared.id, quote: shared.text.slice(0, 80), scope: "shared" };
    expect(validateArgumentCitations("Argument commun", [cite], discussion)).toHaveLength(1);
    expect(
      validateArgumentCitations("Argument propre", [{ ...cite, scope: "target" }], discussion)
    ).toBeNull();
  });
});
