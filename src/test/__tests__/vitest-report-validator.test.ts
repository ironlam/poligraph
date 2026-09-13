import { describe, expect, it } from "vitest";
import { validateVitestReport } from "../vitest-report-validator";

const expectedFiles = ["src/example/first.test.ts", "src/example/second.test.ts"];

describe("validateVitestReport", () => {
  it("exige un résultat passant pour chaque fichier attendu", () => {
    expect(
      validateVitestReport(
        {
          testResults: [
            {
              testFilePath: "/runner/src/example/first.test.ts",
              numTotalTests: 1,
              numPassedTests: 1,
            },
            {
              testFilePath: "/runner/src/example/second.test.ts",
              numTotalTests: 2,
              numPassedTests: 2,
            },
          ],
        },
        expectedFiles
      )
    ).toEqual([]);
  });

  it("signale un fichier absent, vide ou entièrement ignoré", () => {
    expect(
      validateVitestReport(
        {
          testResults: [
            {
              testFilePath: "/runner/src/example/first.test.ts",
              numTotalTests: 0,
              numPassedTests: 0,
            },
            {
              testFilePath: "/runner/src/example/second.test.ts",
              numTotalTests: 3,
              numPassedTests: 0,
            },
          ],
        },
        expectedFiles
      )
    ).toEqual([
      "test file executed no tests: src/example/first.test.ts",
      "test file executed no passing tests: src/example/second.test.ts",
    ]);

    expect(
      validateVitestReport(
        {
          testResults: [
            {
              testFilePath: "/runner/src/example/first.test.ts",
              numTotalTests: 1,
              numPassedTests: 1,
            },
          ],
        },
        expectedFiles
      )
    ).toEqual(["missing test result for src/example/second.test.ts"]);
  });
});
