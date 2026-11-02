import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every pipeline that writes AI text about a vote must refuse to describe an
 * amendment vote without the amendment's own text (amendment-vote-guard.ts).
 * Scrutin V9336 shipped a summary and a citizen impact describing an energy
 * aid for a digital-data tax amendment: its amendment was not linked, and the
 * generators wrote from the title and the bill's general subject.
 *
 * The inventory is discovered, not declared: a file under src/services that
 * calls a model and writes a scrutin row (or its analysis) is a writer. A new
 * writer that skips the guard fails here.
 */

const ROOT = join(process.cwd(), "src/services");
const CALLS_MODEL = /\b(callMistral|callAnthropic|generateCitizenImpact)\(/;
const WRITES_SCRUTIN_TEXT = /\bdb\.(scrutin|scrutinAnalysis)\.(update|updateMany|upsert|create)\(/;
const APPLIES_GUARD = /\bcanDescribeVotedMeasure\(/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function listSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : listSources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const writers = listSources(ROOT).filter((path) => {
  const code = stripComments(readFileSync(path, "utf8"));
  return CALLS_MODEL.test(code) && WRITES_SCRUTIN_TEXT.test(code);
});

describe("AI vote-text writers are grounded on the amendment text", () => {
  it("discovers the known writers", () => {
    const relative = writers.map((p) => p.slice(process.cwd().length + 1)).sort();
    expect(relative).toEqual(
      expect.arrayContaining([
        "src/services/sync/generate-scrutin-citizen-impacts.ts",
        "src/services/sync/generate-scrutin-summaries.ts",
        "src/services/sync/scrutin-analysis.ts",
      ])
    );
  });

  it.each(writers.map((p) => [p.slice(process.cwd().length + 1), p]))(
    "%s applies canDescribeVotedMeasure",
    (_label, path) => {
      expect(stripComments(readFileSync(path, "utf8"))).toMatch(APPLIES_GUARD);
    }
  );
});
