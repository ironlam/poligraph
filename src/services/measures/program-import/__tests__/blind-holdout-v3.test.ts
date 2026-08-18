import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ProgramImportReport } from "../pipeline";

import {
  blindCitationFingerprint,
  matchBlindHoldout,
  normalizeBlindCitation,
} from "./blind-holdout-harness";
import {
  PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS,
  RUFFIN_EXTRACTOR_V5_EXAMPLES,
} from "./fixtures/ruffin-blind-holdout-independence";
import { RUFFIN_BLIND_HOLDOUT } from "./fixtures/ruffin-blind-holdout";
import { RUFFIN_BLIND_HOLDOUT_V2 } from "./fixtures/ruffin-blind-holdout-v2";
import {
  RUFFIN_BLIND_HOLDOUT_V3,
  RUFFIN_BLIND_HOLDOUT_V3_FREEZE,
  RUFFIN_BLIND_HOLDOUT_V3_VERSION,
} from "./fixtures/ruffin-blind-holdout-v3";
import { RUFFIN_GOLD_SET } from "./fixtures/ruffin-gold-set";
import { RUFFIN_PRECISION_SET } from "./fixtures/ruffin-precision-set";

const REPORT_PATH = ".tmp/program-import/reports/presidentielle-2027-program-import.json";
const ANNOTATION_SHA256 = "6f9475cbf6368ccd569d1d754b387dcb69c54a28418157b9c2727e962db66763";

function fileHash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function listTestFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listTestFiles(entryPath) : [entryPath];
  });
}

describe("holdout aveugle François Ruffin v3 avant révélation", () => {
  it("fige 60 annotations humaines réparties entre les trois cahiers", () => {
    expect(RUFFIN_BLIND_HOLDOUT_V3_VERSION).toBe("ruffin-blind-holdout-v3-pre-reveal-2026-08-16");
    expect(RUFFIN_BLIND_HOLDOUT_V3).toHaveLength(60);
    expect(new Set(RUFFIN_BLIND_HOLDOUT_V3.map((entry) => entry.id)).size).toBe(60);
    const perDocument = Map.groupBy(RUFFIN_BLIND_HOLDOUT_V3, (entry) => entry.documentUrl);
    expect([...perDocument.values()].map((entries) => entries.length).sort()).toEqual([20, 20, 20]);
    expect(
      Object.fromEntries(
        [...Map.groupBy(RUFFIN_BLIND_HOLDOUT_V3, (entry) => entry.humanDecision)].map(
          ([decision, entries]) => [decision, entries.length]
        )
      )
    ).toEqual({ ACCEPT_MEASURE: 30, REJECT: 23, ACCEPT_OBJECTIVE: 7 });
  });

  it("ne contient aucun résultat pipeline révélé", () => {
    for (const entry of RUFFIN_BLIND_HOLDOUT_V3) {
      expect(entry).not.toHaveProperty("accepted");
      expect(entry).not.toHaveProperty("classification");
      expect(entry).not.toHaveProperty("modelClassification");
      expect(entry).not.toHaveProperty("acceptanceGuard");
      expect(entry).not.toHaveProperty("extractionGuard");
    }
  });

  it("est distinct de tous les corpus antérieurs, du prompt v5 et des tests spécifiques", () => {
    const holdoutFingerprints = new Set(
      RUFFIN_BLIND_HOLDOUT_V3.map((entry) => blindCitationFingerprint(entry.sourceText))
    );
    const priorFingerprints = new Set([
      ...RUFFIN_GOLD_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_PRECISION_SET.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_BLIND_HOLDOUT.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...RUFFIN_BLIND_HOLDOUT_V2.map((entry) => blindCitationFingerprint(entry.sourceText)),
      ...PREVIOUS_RUFFIN_HOLDOUT_FINGERPRINTS,
    ]);
    expect(holdoutFingerprints.size).toBe(60);
    expect([...holdoutFingerprints].filter((value) => priorFingerprints.has(value))).toEqual([]);

    const promptExamples = RUFFIN_EXTRACTOR_V5_EXAMPLES.map(normalizeBlindCitation);
    expect(
      RUFFIN_BLIND_HOLDOUT_V3.filter((entry) => {
        const citation = normalizeBlindCitation(entry.sourceText);
        return promptExamples.some(
          (example) =>
            citation === example || citation.includes(example) || example.includes(citation)
        );
      })
    ).toEqual([]);

    const priorTestSources = listTestFiles("src/services/measures/program-import/__tests__")
      .filter((filePath) => /\.(?:test|spec)\.(?:ts|tsx)$/.test(filePath))
      .filter((path) => !path.endsWith("blind-holdout-v3.test.ts"))
      .map((path) => readFileSync(path, "utf8"));
    expect(
      RUFFIN_BLIND_HOLDOUT_V3.filter((entry) =>
        priorTestSources.some((source) => source.includes(entry.sourceText))
      )
    ).toEqual([]);
  });

  it("fige le rapport source et la fixture après consommation du holdout", () => {
    expect(fileHash(REPORT_PATH)).toBe(RUFFIN_BLIND_HOLDOUT_V3_FREEZE.report);
    expect(
      fileHash("src/services/measures/program-import/__tests__/fixtures/ruffin-blind-holdout-v3.ts")
    ).toBe(ANNOTATION_SHA256);
  });

  it("documente les 225 collisions antérieures exclues et retrouve chaque citation une fois", () => {
    expect(RUFFIN_BLIND_HOLDOUT_V3_FREEZE).toMatchObject({
      seed: "ruffin-blind-holdout-v3",
      selectedTechnicallyAccepted: 37,
      selectedRejectedAtRisk: 23,
      excludedPriorUniqueFingerprints: 225,
    });
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as ProgramImportReport;
    const proposals = report.candidates.flatMap((candidate) => candidate.proposals);
    expect(matchBlindHoldout(RUFFIN_BLIND_HOLDOUT_V3, proposals)).toHaveLength(60);
  });

  it("n’utilise aucune page dont la provenance PDF a été bloquée", () => {
    expect(
      RUFFIN_BLIND_HOLDOUT_V3.filter(
        (entry) =>
          (entry.documentUrl.includes("Campagne_Web") && entry.page === 13) ||
          (entry.documentUrl.includes("Probite") && [15, 18].includes(entry.page))
      )
    ).toEqual([]);
  });
});
