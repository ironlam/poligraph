import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const THIS_FILE = "src/__tests__/no-data-api-consumers.test.ts";

const DATA_API_MARKERS = [
  { label: "Supabase data client", pattern: /@supabase\/(?:supabase-js|postgrest-js)/i },
  { label: "REST Data API path", pattern: /\/rest\/v1(?:\/|["'`])/i },
  { label: "GraphQL Data API path", pattern: /\/graphql\/v1(?:\/|["'`])/i },
  {
    label: "browser-side Supabase database configuration",
    pattern: /NEXT_PUBLIC_SUPABASE_(?:URL|ANON_KEY|PUBLISHABLE_KEY)/i,
  },
] as const;

function trackedArchitectureFiles(): string[] {
  return execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--",
      ".env.example",
      ".github",
      "package.json",
      "package-lock.json",
      "src",
      "scripts",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
    }
  )
    .split("\0")
    .filter((file) => file.length > 0 && file !== THIS_FILE && !file.startsWith("src/generated/"));
}

describe("SEC-02 Data API architecture contract", () => {
  it("keeps application and automation code free of Data API consumers", () => {
    const violations = trackedArchitectureFiles().flatMap((file) => {
      const content = readFileSync(resolve(ROOT, file), "utf8");
      return DATA_API_MARKERS.filter(({ pattern }) => pattern.test(content)).map(
        ({ label }) => `${file}: ${label}`
      );
    });

    expect(
      violations,
      "The hosted Data API is intentionally disabled. A new consumer requires a security architecture review before that decision changes. Auth, Storage and Realtime integrations must not be mistaken for database consumers."
    ).toEqual([]);
  });
});
