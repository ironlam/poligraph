import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getMistralTokensUsed } from "../src/lib/api/mistral";
import { parseReaderGuideDetectionOptions } from "../src/lib/measures/reader-guide-options";
import {
  detectReaderGuidesForRevision,
  listReaderGuideDetectionCandidates,
  proposeReaderGuidesForRevision,
} from "../src/lib/measures/reader-guides";

async function main(): Promise<void> {
  const options = parseReaderGuideDetectionOptions(process.argv.slice(2));
  const runId = randomUUID();
  const rows = await listReaderGuideDetectionCandidates(options);
  const results: Array<Record<string, unknown>> = [];
  let lastCompletedId = options.after ?? null;
  let failed = false;
  for (const row of rows) {
    if (!row.publishedRevisionId) continue;
    try {
      const result = options.apply
        ? await proposeReaderGuidesForRevision(row.publishedRevisionId, `cli:${runId}`)
        : await detectReaderGuidesForRevision(row.publishedRevisionId);
      results.push({
        measureId: row.id,
        revisionId: row.publishedRevisionId,
        candidateName: row.candidacy?.candidateName ?? null,
        theme: row.theme,
        ...result,
      });
      console.log(`${row.id}: ${result.proposals.length} proposition(s)`);
      lastCompletedId = row.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ measureId: row.id, revisionId: row.publishedRevisionId, error: message });
      console.error(`${row.id}: ${message}`);
      failed = true;
      break;
    }
  }
  const reportDir = join(process.cwd(), "scripts", ".local");
  await mkdir(reportDir, { recursive: true });
  const reportPath = join(reportDir, `reader-guides-${runId}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        runId,
        createdAt: new Date().toISOString(),
        mode: options.apply ? "apply" : "dry-run",
        parameters: options,
        processed: results.length,
        nextAfter: lastCompletedId,
        mistralTokens: getMistralTokensUsed(),
        results,
      },
      null,
      2
    )
  );
  console.log(`Rapport : ${reportPath}`);
  if (failed) {
    console.log(
      lastCompletedId
        ? `Reprendre après correction : --after ${lastCompletedId}`
        : "Reprendre après correction sans modifier le curseur"
    );
  } else if (rows.length === options.limit && lastCompletedId) {
    console.log(`Lot suivant : --after ${lastCompletedId}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
