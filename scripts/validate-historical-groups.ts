/**
 * Read-only validation of the official archives for the historical groups (lot 5, phase 5A-2).
 *
 *   npm run validate:historical-groups -- --amo30 <AMO30.zip> --scrutins <scrutins.zip> [...]
 *
 * Reads the archives given on the command line, checks them, parses them with the pure parsers of
 * `src/lib/parlement/historical-groups/`, and prints a JSON report. No network, no database, no
 * secret, no file written. The archives stay outside the repository.
 *
 * Options:
 *   --baseline <file>   baseline to compare with (default: the one committed in docs/audits)
 *   --emit-baseline     print the baseline of the given archives instead of the report
 *   --examples          add a few record identifiers per anomaly category to the report
 *
 * Exit code: 0 when nothing failed, 1 on a failure, 2 on a usage error. A changed archive is
 * reported, it is not a failure by itself.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ArchiveIntegrityError,
  openArchiveFile,
  type OpenedArchive,
} from "./lib/historical-groups-archive";
import {
  analyzeArchives,
  compareToBaseline,
  failures,
  isAmo30Archive,
  type Baseline,
} from "./lib/historical-groups-validation";

const DEFAULT_BASELINE = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../docs/audits/parlement-historique-lot5-baseline-5a2.json"
);

interface Options {
  amo30: string | null;
  scrutins: string[];
  baseline: string;
  emitBaseline: boolean;
  examples: boolean;
}

export function parseArgs(argv: readonly string[]): Options | string {
  const options: Options = {
    amo30: null,
    scrutins: [],
    baseline: DEFAULT_BASELINE,
    emitBaseline: false,
    examples: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (): string | null => argv[++i] ?? null;
    if (arg === "--amo30") options.amo30 = value();
    else if (arg === "--scrutins") {
      const next = value();
      if (next === null) return "--scrutins needs a path";
      options.scrutins.push(next);
    } else if (arg === "--baseline") {
      const next = value();
      if (next === null) return "--baseline needs a path";
      options.baseline = next;
    } else if (arg === "--emit-baseline") options.emitBaseline = true;
    else if (arg === "--examples") options.examples = true;
    else return `unknown argument ${JSON.stringify(arg)}`;
  }
  if (options.amo30 === null) return "--amo30 <archive> is required";
  if (options.scrutins.length === 0) return "at least one --scrutins <archive> is required";
  return options;
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    console.error(`usage error: ${parsed}`);
    return 2;
  }
  let amo30: OpenedArchive;
  let scrutins: OpenedArchive[];
  try {
    amo30 = openArchiveFile(parsed.amo30 as string);
    scrutins = parsed.scrutins.map((file) => openArchiveFile(file));
    if (!isAmo30Archive(amo30)) throw new Error("the --amo30 archive has no json/organe folder");
    if (scrutins.some(isAmo30Archive))
      throw new Error("a --scrutins archive looks like an AMO30 archive");
    const analysis = analyzeArchives(amo30, scrutins);
    if (parsed.emitBaseline) {
      process.stdout.write(`${JSON.stringify(analysis.baseline, null, 2)}\n`);
      return analysis.invariantViolations.length === 0 ? 0 : 1;
    }
    const reference = JSON.parse(fs.readFileSync(parsed.baseline, "utf8")) as Baseline;
    const comparison = compareToBaseline(analysis.baseline, reference);
    const failed = failures(analysis, comparison);
    const report = {
      parserVersion: analysis.baseline.parserVersion,
      archives: [
        analysis.baseline.amo30.archive,
        ...analysis.baseline.scrutins.map((s) => s.archive),
      ],
      aggregates: {
        amo30: analysis.baseline.amo30.aggregate,
        scrutins: analysis.baseline.scrutins.map((s) => s.aggregate),
      },
      blocking: analysis.blocking,
      informative: analysis.informative,
      comparison,
      failures: failed,
      ...(parsed.examples ? { examples: analysis.examples } : {}),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return failed.length === 0 ? 0 : 1;
  } catch (error) {
    // An integrity error already starts with its code.
    const prefix = error instanceof ArchiveIntegrityError ? "" : "ERROR: ";
    console.error(`${prefix}${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
