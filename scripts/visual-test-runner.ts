#!/usr/bin/env tsx
/**
 * Visual Test Runner - Interactive CLI for visual regression tests
 *
 * Usage:
 *   npm run visual                    # Run all tests and show report
 *   npm run visual -- --update        # Update baselines
 *   npm run visual -- --grep "Mobile" # Run specific tests
 *   npm run visual -- --ui            # Open interactive UI
 *   npm run visual -- --compare       # Show comparison of changed screenshots
 */

import { execFileSync, execSync, spawn } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPORT_DIR = "tests/visual/playwright-report";
const SNAPSHOTS_DIR = "tests/visual/snapshots";
const RESULTS_DIR = "tests/visual/test-results";

// Colors for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message: string) {
  console.log();
  log(`${"=".repeat(60)}`, colors.cyan);
  log(`  ${message}`, colors.bright + colors.cyan);
  log(`${"=".repeat(60)}`, colors.cyan);
  console.log();
}

function logSection(message: string) {
  log(`\n>> ${message}`, colors.yellow);
}

function countSnapshots(): { total: number; byProject: Record<string, number> } {
  const snapshotsPath = join(process.cwd(), SNAPSHOTS_DIR);
  if (!existsSync(snapshotsPath)) {
    return { total: 0, byProject: {} };
  }

  const byProject: Record<string, number> = {};
  let total = 0;

  function walkDir(dir: string) {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        walkDir(filePath);
      } else if (file.endsWith(".png")) {
        total++;
        // Extract project from filename (e.g., "homepage-chromium-linux.png" -> "chromium")
        const match = file.match(/-(chromium|mobile-chrome)-/);
        const project = match ? match[1] : "unknown";
        byProject[project!] = (byProject[project!] || 0) + 1;
      }
    }
  }

  walkDir(snapshotsPath);
  return { total, byProject };
}

function showStats() {
  const { total, byProject } = countSnapshots();

  logSection("Baseline Snapshots");
  log(`  Total: ${total} screenshots`, colors.green);
  for (const [project, count] of Object.entries(byProject)) {
    log(`  - ${project}: ${count} screenshots`);
  }
}

function runTests(args: string[]): boolean {
  logSection("Running Visual Tests...");

  try {
    // Map --update shorthand to Playwright's --update-snapshots flag
    const playwrightArgs = args.map((a) => (a === "--update" ? "--update-snapshots" : a));
    const command = `npx playwright test ${playwrightArgs.join(" ")}`;
    log(`  $ ${command}`, colors.blue);
    console.log();

    execSync(command, {
      stdio: "inherit",
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    return true;
  } catch {
    return false;
  }
}

function openReport() {
  const reportPath = join(process.cwd(), REPORT_DIR, "index.html");

  if (!existsSync(reportPath)) {
    log("  No report found. Run tests first.", colors.yellow);
    return;
  }

  logSection("Opening HTML Report...");

  try {
    // The path travels as an argument rather than inside a command line: `process.cwd()` is
    // whatever directory the script was started from, and a space or a quote in it would split
    // the command or let the rest of the path be read as shell syntax.
    //
    // Windows needs `cmd /c start` because `start` is a cmd builtin, not an executable. The empty
    // string is the window title that `start` expects before a quoted path.
    const [opener, args] =
      process.platform === "darwin"
        ? ["open", [reportPath]]
        : process.platform === "win32"
          ? ["cmd", ["/c", "start", "", reportPath]]
          : ["xdg-open", [reportPath]];

    execFileSync(opener, args, { stdio: "ignore" });
    log(`  Report opened in browser`, colors.green);
  } catch {
    // Fallback to playwright show-report
    log(`  Opening report with Playwright...`, colors.blue);
    // An `error` listener, because a ChildProcess that fails to spawn emits one, and an unheard
    // `error` event takes the whole script down. `npx` is `npx.cmd` on Windows, which a native
    // spawn does not resolve, so that failure is reachable rather than theoretical.
    const viewer = spawn("npx", ["playwright", "show-report", REPORT_DIR], {
      stdio: "inherit",
      detached: true,
    });
    viewer.on("error", (err) => {
      log(`  Could not open the report: ${err.message}`, colors.yellow);
      log(`  Open ${join(REPORT_DIR, "index.html")} by hand.`, colors.yellow);
    });
    viewer.unref();
  }
}

function openUI() {
  logSection("Opening Playwright UI...");
  spawn("npx", ["playwright", "test", "--ui"], {
    stdio: "inherit",
  });
}

function showHelp() {
  logHeader("Visual Test Runner");

  log("Usage:", colors.bright);
  log("  npm run visual [options]");
  console.log();

  log("Options:", colors.bright);
  log("  (none)           Run all tests and open report on failure");
  log("  --update         Update baseline snapshots");
  log("  --ui             Open interactive Playwright UI");
  log("  --report         Open the HTML report");
  log("  --stats          Show snapshot statistics");
  log("  --grep <pattern> Run only tests matching pattern");
  log("  --headed         Run tests with visible browser");
  log("  --debug          Run tests in debug mode");
  console.log();

  log("Examples:", colors.bright);
  log('  npm run visual -- --grep "Mobile"     # Test mobile views only');
  log('  npm run visual -- --grep "Affairs"    # Test affair pages');
  log("  npm run visual -- --update            # Update all baselines");
  log("  npm run visual -- --ui                # Interactive mode");
  console.log();
}

async function main() {
  const args = process.argv.slice(2);

  // Handle special flags
  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    return;
  }

  if (args.includes("--stats")) {
    logHeader("Visual Test Statistics");
    showStats();
    return;
  }

  if (args.includes("--report")) {
    logHeader("Visual Test Report");
    openReport();
    return;
  }

  if (args.includes("--ui")) {
    logHeader("Playwright UI Mode");
    openUI();
    return;
  }

  // Run tests
  logHeader("Visual Regression Tests");
  showStats();

  const success = runTests(args);

  if (success) {
    log("\n  All tests passed!", colors.green);

    // Show report location
    logSection("Results");
    log(`  HTML Report: ${REPORT_DIR}/index.html`);
    log(`  Run 'npm run visual -- --report' to open`);
  } else {
    log("\n  Some tests failed!", colors.red);

    logSection("Opening report for review...");
    openReport();
  }

  console.log();
}

main().catch(console.error);
