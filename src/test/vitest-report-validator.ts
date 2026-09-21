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

export function validateVitestReport(
  report: VitestReport,
  expectedFiles: string[],
  exactTests?: number
) {
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
    } else if (passedTests !== totalTests) {
      errors.push(
        `test file did not pass every test: ${expectedFile} (${passedTests}/${totalTests})`
      );
    } else if (exactTests !== undefined && totalTests !== exactTests) {
      errors.push(
        `test file executed ${totalTests} tests instead of ${exactTests}: ${expectedFile}`
      );
    }
  }

  if ((report.numFailedTests ?? 0) > 0) errors.push("Vitest reported failed tests");
  return errors;
}

async function main() {
  const [, , reportPath, ...args] = process.argv;
  const exactTestsArg = args.find((arg) => arg.startsWith("--exact-tests="));
  const expectedFiles = args.filter((arg) => !arg.startsWith("--exact-tests="));
  const exactTests = exactTestsArg ? Number(exactTestsArg.split("=")[1]) : undefined;
  if (!reportPath || expectedFiles.length === 0) {
    throw new Error(
      "Usage: tsx vitest-report-validator.ts <report.json> [--exact-tests=N] <test-file>..."
    );
  }
  if (exactTestsArg && (!Number.isInteger(exactTests) || exactTests! < 1)) {
    throw new Error("--exact-tests must be a positive integer");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8")) as VitestReport;
  const errors = validateVitestReport(report, expectedFiles, exactTests);
  if (errors.length > 0) throw new Error(errors.join("\n"));
}

if (process.argv[1]?.endsWith("vitest-report-validator.ts")) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
