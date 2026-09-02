/**
 * L-02 environment documentation contract
 *
 * - Guarantee: every environment variable read by shipped code is declared in `.env.example`.
 *   A contributor who clones the repository can see what to set without reading the source.
 * - Canonical syntax: `process.env.NAME`, with `NAME=""` or a commented `# NAME="default"` line
 *   in `.env.example`, under the section that matches the feature.
 * - Forbidden: a variable that only exists in code. Before this guard the code read 88 names and
 *   `.env.example` declared 35, so a missing key surfaced as a runtime failure in a nightly job.
 * - Limit: only statically written `process.env.NAME` is seen; a name built at runtime is not
 *   guessed. Test files are excluded on purpose. Several guards feed themselves secret-shaped
 *   names as fixtures (`NEXT_PUBLIC_PRIVATE_KEY`, `SUPABASE_URL`) precisely to prove those names
 *   are rejected; documenting them would advertise what the guards exist to forbid.
 *
 * PLATFORM_INJECTED is the one allowlist: names the runtime supplies. Nobody sets them by hand,
 * and writing them into `.env.example` would suggest otherwise.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

/** Supplied by Node, Next.js, Vercel or GitHub Actions. Never set by a contributor. */
const PLATFORM_INJECTED = new Set([
  "NODE_ENV",
  "NEXT_RUNTIME",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "GITHUB_OUTPUT",
  "GITHUB_STEP_SUMMARY",
]);

const SCANNED_ROOTS = ["src", "scripts"];

function isTestPath(relative: string): boolean {
  return (
    relative.includes("/__tests__/") ||
    relative.includes("/__e2e__/") ||
    /\.(test|spec|stories)\.(ts|tsx)$/.test(relative)
  );
}

interface Reference {
  name: string;
  file: string;
  line: number;
}

function collectReferences(): Reference[] {
  const references: Reference[] = [];
  const pattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;

  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(ROOT, absolute).split(path.sep).join("/");

      if (entry.isDirectory()) {
        if (entry.name === "generated" || entry.name === "node_modules") continue;
        walk(absolute);
        continue;
      }

      if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
      if (isTestPath(relative)) continue;

      fs.readFileSync(absolute, "utf8")
        .split(/\r?\n/)
        .forEach((text, index) => {
          for (const match of text.matchAll(pattern)) {
            references.push({ name: match[1]!, file: relative, line: index + 1 });
          }
        });
    }
  };

  for (const root of SCANNED_ROOTS) {
    const absolute = path.join(ROOT, root);
    if (fs.existsSync(absolute)) walk(absolute);
  }

  return references;
}

/** Names declared in `.env.example`, including the commented-out optional ones. */
function declaredNames(): Set<string> {
  const names = new Set<string>();

  for (const raw of fs.readFileSync(ENV_EXAMPLE, "utf8").split(/\r?\n/)) {
    const match = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(raw.trim());
    if (match) names.add(match[1]!);
  }

  return names;
}

const REFERENCES = collectReferences();
const DECLARED = declaredNames();

describe("L-02 environment documentation contract", () => {
  it("scans a meaningful number of references", () => {
    // A regex that stops matching would make this suite pass while checking nothing.
    expect(REFERENCES.length).toBeGreaterThan(100);
    expect(DECLARED.size).toBeGreaterThan(50);
  });

  it("declares every environment variable that shipped code reads", () => {
    const undocumented = new Map<string, Reference>();

    for (const reference of REFERENCES) {
      if (PLATFORM_INJECTED.has(reference.name)) continue;
      if (DECLARED.has(reference.name)) continue;
      if (!undocumented.has(reference.name)) undocumented.set(reference.name, reference);
    }

    const report = [...undocumented.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => `  ${r.name}  (first read at ${r.file}:${r.line})`);

    expect(
      report,
      "These variables are read by shipped code but absent from .env.example.\n" +
        report.join("\n") +
        "\nAdd each one under the section that matches its feature, with a one-line comment " +
        "saying what it does and whether it is required."
    ).toEqual([]);
  });

  it("keeps the platform allowlist honest", () => {
    // An allowlisted name that nothing reads any more is noise. Drop it.
    const read = new Set(REFERENCES.map((r) => r.name));
    const unused = [...PLATFORM_INJECTED].filter((name) => !read.has(name)).sort();

    expect(
      unused,
      `Nothing reads these any more. Remove them from PLATFORM_INJECTED:\n${unused.join("\n")}`
    ).toEqual([]);
  });

  it("carries no value next to a secret-shaped name", () => {
    // .env.example is committed. A key that ships with a filled-in value is a leak,
    // whatever the intent. Three placeholder shapes stay legible as placeholders and are
    // accepted: `<...>`, `[...]`, and the `your-...` convention the file already uses.
    const leaks: string[] = [];

    fs.readFileSync(ENV_EXAMPLE, "utf8")
      .split(/\r?\n/)
      .forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return;

        const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
        if (!match) return;

        const [, name, rawValue] = match;
        if (!/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|DSN)$/.test(name!)) return;

        const value = rawValue!.trim().replace(/^["']|["']$/g, "");
        if (!value) return;
        if (/^[<[]/.test(value) || value.startsWith("your-")) return;

        leaks.push(`  .env.example:${index + 1} — ${name} ships a value`);
      });

    expect(leaks, `Secret-shaped keys must ship empty.\n${leaks.join("\n")}`).toEqual([]);
  });
});
