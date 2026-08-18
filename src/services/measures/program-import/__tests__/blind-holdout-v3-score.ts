import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import type { ProgramImportReport } from "../pipeline";
import { evaluateBlindHoldout, matchBlindHoldout } from "./blind-holdout-harness";
import { RUFFIN_BLIND_HOLDOUT_V3 } from "./fixtures/ruffin-blind-holdout-v3";

const report = JSON.parse(
  readFileSync(".tmp/program-import/reports/presidentielle-2027-program-import.json", "utf8")
) as ProgramImportReport;
const proposals = report.candidates.flatMap((candidate) => candidate.proposals);
const metrics = evaluateBlindHoldout(matchBlindHoldout(RUFFIN_BLIND_HOLDOUT_V3, proposals));
const autonomyReasons = new Set([
  "MISSING_REFERENT",
  "DEPENDENT_FRAGMENT",
  "TITLE_ONLY",
  "PARSER_CORRUPTION",
]);
const autonomyFalsePositives = metrics.errors.falsePositives.filter((error) => {
  const entry = RUFFIN_BLIND_HOLDOUT_V3.find((candidate) => candidate.id === error.id)!;
  return autonomyReasons.has(entry.editorialReason);
});

console.log(
  JSON.stringify(
    {
      annotationSha256: createHash("sha256")
        .update(
          readFileSync(
            "src/services/measures/program-import/__tests__/fixtures/ruffin-blind-holdout-v3.ts"
          )
        )
        .digest("hex"),
      ...metrics,
      autonomyFalsePositives,
    },
    null,
    2
  )
);
