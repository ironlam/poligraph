/**
 * L-02 environment documentation contract
 *
 * - Guarantee: every environment variable read by shipped code is declared in `.env.example`.
 *   A contributor who clones the repository can see what to set without reading the source.
 * - Canonical syntax: `process.env.NAME`, with `NAME=""` or a commented `# NAME="default"` line
 *   in `.env.example`, under the section that matches the feature.
 * - Forbidden: a variable that only exists in code. Before this guard the code read 88 names and
 *   `.env.example` declared 35, so a missing key surfaced as a runtime failure in a nightly job.
 * - Seen: `process.env.NAME`, and the env-bag form `env.NAME` used by a function that takes the
 *   environment as a parameter so it stays testable (`resolvePoolMax` in src/config/database.ts).
 *   Before that second shape was matched, a variable read through a parameter was invisible here
 *   and could drift out of `.env.example` without any test failing.
 * - Limit: a name built at runtime is not guessed, and neither is `process.env` destructuring,
 *   which the codebase does not currently use. Test files are excluded on purpose. Several guards feed themselves secret-shaped
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
  "NEXT_PHASE",
  "VERCEL_ENV",
  // Injected by Vercel as the deployment's own hostname, used as a fallback base URL. Surfaced
  // when this guard started seeing the `env.NAME` shape; nobody sets it by hand.
  "VERCEL_URL",
  "VERCEL_GIT_COMMIT_SHA",
  "NEXT_PUBLIC_VERCEL_ENV",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "GITHUB_OUTPUT",
  "GITHUB_SHA",
  "GITHUB_EVENT_NAME",
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

/**
 * Matches `process.env.NAME` and `env.NAME` alike: the leading `\b` sits between the dot and the
 * `env` of `process.env`, so one pattern covers both the direct read and the bag passed as an
 * argument.
 *
 * The trailing lookahead is what keeps `env.Foo` from reporting a variable called `F`: the
 * uppercase class would otherwise stop at the first lowercase letter and hand back the prefix.
 */
const ENV_READ = /\benv\.([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_])/g;

export function envNamesIn(text: string): string[] {
  return [...text.matchAll(ENV_READ)].map((match) => match[1]!);
}

function collectReferences(): Reference[] {
  const references: Reference[] = [];

  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(ROOT, absolute).split(path.sep).join("/");

      if (entry.isDirectory()) {
        // `.local` holds gitignored throwaway scripts: never shipped, never in
        // CI's checkout, so scanning it only fails this guard locally.
        if (entry.name === "generated" || entry.name === "node_modules" || entry.name === ".local")
          continue;
        walk(absolute);
        continue;
      }

      if (!/\.(ts|tsx|mts)$/.test(entry.name)) continue;
      if (isTestPath(relative)) continue;

      fs.readFileSync(absolute, "utf8")
        .split(/\r?\n/)
        .forEach((text, index) => {
          for (const name of envNamesIn(text)) {
            references.push({ name, file: relative, line: index + 1 });
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
  describe("envNamesIn", () => {
    it("sees the direct read", () => {
      expect(envNamesIn("const a = process.env.DATABASE_URL;")).toEqual(["DATABASE_URL"]);
    });

    it("sees a variable read through an env bag passed as an argument", () => {
      // The gap this guard had: `resolvePoolMax(env)` reads `env.DATABASE_POOL_MAX`, which the
      // old `process.env.NAME` pattern could not see, so the name could drift out of
      // .env.example with nothing failing.
      expect(envNamesIn("return env.DATABASE_POOL_MAX?.trim();")).toEqual(["DATABASE_POOL_MAX"]);
    });

    it("counts a direct read once, not twice", () => {
      expect(envNamesIn("process.env.CRON_SECRET")).toHaveLength(1);
    });

    it("finds every name on a line", () => {
      expect(envNamesIn("env.A_ONE ?? process.env.B_TWO")).toEqual(["A_ONE", "B_TWO"]);
    });

    it("ignores a lowercase or mixed-case property, which is not an env name", () => {
      expect(envNamesIn("env.databaseUrl + env.Foo")).toEqual([]);
    });

    it("does not treat an unrelated identifier ending in env as an environment read", () => {
      expect(envNamesIn("testenv.DATABASE_URL")).toEqual([]);
    });
  });

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
