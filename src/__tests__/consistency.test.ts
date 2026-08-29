import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf-8");
const exists = (rel: string) => existsSync(resolve(ROOT, rel));

describe("Script consistency", () => {
  const pkg = JSON.parse(read("package.json"));
  const scripts: Record<string, string> = pkg.scripts;

  it("package.json scripts reference existing files", () => {
    const missing: string[] = [];

    for (const [name, cmd] of Object.entries(scripts)) {
      const match = cmd.match(/tsx\s+scripts\/([\w-]+\.ts)/);
      if (!match) continue;
      const file = `scripts/${match[1]}`;
      if (!exists(file)) {
        missing.push(`"${name}" -> ${file}`);
      }
    }

    expect(missing, `Missing script files:\n${missing.join("\n")}`).toEqual([]);
  });

  it("sync-full.ts steps reference existing files", () => {
    const content = read("scripts/sync-full.ts");
    const missing: string[] = [];

    for (const match of content.matchAll(/npx tsx scripts\/([\w-]+\.ts)/g)) {
      const file = `scripts/${match[1]}`;
      if (!exists(file)) {
        missing.push(file);
      }
    }

    expect(missing, `Missing script files in sync-full.ts:\n${missing.join("\n")}`).toEqual([]);
  });

  it("docs reference existing npm scripts", () => {
    const docFiles = readdirSync(resolve(ROOT, "docs")).filter((f) => f.endsWith(".md"));
    const missing: string[] = [];

    for (const file of docFiles) {
      const content = read(`docs/${file}`);
      for (const match of content.matchAll(/npm run ([\w:.-]+)/g)) {
        const scriptName = match[1]!;
        // Skip glob patterns like "npm run sync:*"
        const afterIdx = match.index! + match[0].length;
        if (content[afterIdx] === "*") continue;
        // Skip partial names ending with : or .
        if (/[:.]$/.test(scriptName)) continue;
        if (!(scriptName in scripts)) {
          missing.push(`docs/${file}: "npm run ${scriptName}"`);
        }
      }
    }

    expect(missing, `Docs reference missing npm scripts:\n${missing.join("\n")}`).toEqual([]);
  });
});

describe("Daily sync orchestration", () => {
  // syncPressAnalysis self-throttles at 6h (MIN_SYNC_INTERVAL_MS). The daily
  // cron already fixes the cadence and its tightest gap is exactly 6h, so
  // without --force any cron drift makes the step return having analyzed
  // nothing, while still reporting success. The backlog then only grows.
  it("press analysis runs on every scheduled daily sync", () => {
    const content = read("scripts/sync-daily.ts");
    const command = content.match(/npx tsx scripts\/sync-press-analysis\.ts[^`]*/)?.[0];

    expect(command, "press analysis step not found in sync-daily.ts").toBeDefined();
    expect(command).toContain("--force");
  });

  // scripts/sync-daily.ts forces every press analysis run (no throttle left to
  // gate it). If the Inngest scheduler also ran press analysis on the same
  // cron, both processes could list the same unanalyzed articles before
  // either marks them, paying for duplicate AI analyses (#765).
  it("press analysis is not scheduled by both the workflow and Inngest", () => {
    const inngestSteps = read("src/inngest/functions/sync-daily.ts");

    expect(inngestSteps).not.toContain('name: "press-analysis"');
  });
});
