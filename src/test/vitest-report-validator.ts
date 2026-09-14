import { readFile } from "node:fs/promises";
import path from "node:path";

type VitestFileResult = {
  testFilePath?: string;
  name?: string;
  numTotalTests?: number;
  numPassedTests?: number;
  assertionResults?: Array<{ status?: string }>;
};

export type VitestReport = {
  testResults?: VitestFileResult[];
  numFailedTests?: number;
};

function matchesExpectedFile(testFilePath: string, expectedFile: string) {
  const normalizedPath = path.posix.normalize(testFilePath.replaceAll(path.sep, "/"));
  const normalizedExpected = path.posix.normalize(expectedFile.replaceAll(path.sep, "/"));
  return normalizedPath === normalizedExpected || normalizedPath.endsWith(`/${normalizedExpected}`);
}

export function validateVitestReport(report: VitestReport, expectedFiles: string[]) {
  const results = report.testResults ?? [];
  const errors: string[] = [];

  for (const expectedFile of expectedFiles) {
    const result = results.find(
      (candidate) =>
        typeof (candidate.testFilePath ?? candidate.name) === "string" &&
        matchesExpectedFile((candidate.testFilePath ?? candidate.name)!, expectedFile)
    );
    if (!result) {
      errors.push(`missing test result for ${expectedFile}`);
      continue;
    }
    const assertionResults = result.assertionResults ?? [];
    const totalTests = result.numTotalTests ?? assertionResults.length;
    const passedTests =
      result.numPassedTests ??
      assertionResults.filter((assertion) => assertion.status === "passed").length;
    if (!totalTests || totalTests === 0) {
      errors.push(`test file executed no tests: ${expectedFile}`);
    } else if (!passedTests || passedTests === 0) {
      errors.push(`test file executed no passing tests: ${expectedFile}`);
    }
  }

  if ((report.numFailedTests ?? 0) > 0) errors.push("Vitest reported failed tests");
  return errors;
}

async function main() {
  const [, , reportPath, ...expectedFiles] = process.argv;
  if (!reportPath || expectedFiles.length === 0) {
    throw new Error("Usage: tsx vitest-report-validator.ts <report.json> <test-file>...");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8")) as VitestReport;
  const errors = validateVitestReport(report, expectedFiles);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

if (process.argv[1]?.endsWith("vitest-report-validator.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
