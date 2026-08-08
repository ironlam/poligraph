import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_API_GUARD_MESSAGE,
  detectDataApiSignals,
  findDataApiConsumers,
  selectTrackedArchitectureFiles,
} from "../../scripts/guards/data-api-consumer-guard";

const ROOT = resolve(import.meta.dirname, "../..");

describe("SEC-02 Data API architecture contract", () => {
  it.each([
    ["direct REST Data API consumer", "fetch(`${url}/rest/v1/records`)"],
    ["direct GraphQL Data API consumer", "fetch(`${url}/graphql/v1`)"],
    ["PostgREST client", 'import { PostgrestClient } from "@supabase/postgrest-js";'],
    [
      "Supabase database operation",
      'import { createClient } from "@supabase/supabase-js";\nconst client = createClient(url, key);\nclient.from("records").select();',
    ],
    ["explicit Data API configuration", 'const DATA_API_ENDPOINT = "https://example.test";'],
  ])("detects a %s", (signal, source) => {
    expect(detectDataApiSignals("packages/example/consumer.ts", source)).toContain(signal);
  });

  it.each([
    ["Auth", "client.auth.getUser()"],
    ["Storage", 'client.storage.from("avatars").download("photo.jpg")'],
    ["Realtime", 'client.channel("updates").subscribe()'],
  ])("allows a Supabase %s-only integration", (_service, operation) => {
    const source = `
      import { createClient } from "@supabase/supabase-js";
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const client = createClient(url, key);
      ${operation};
    `;

    expect(detectDataApiSignals("src/lib/supabase.ts", source)).toEqual([]);
  });

  it("allows the SDK, project URL and public keys without a database operation", () => {
    const source = `
      import { createClient } from "@supabase/supabase-js";
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      const legacyAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      createClient(url, publishableKey ?? legacyAnonKey).auth.getSession();
    `;

    expect(detectDataApiSignals("src/lib/supabase.ts", source)).toEqual([]);
  });

  it("covers tracked application, automation, tooling, configuration and package code", () => {
    const candidates = [
      "src/app/example.ts",
      "scripts/example.ts",
      ".github/actions/example/index.js",
      "tooling/example.ts",
      "config/example.toml",
      "packages/client/src/index.ts",
      "docs/architecture.md",
      "src/generated/client.ts",
      "test/fixtures/example.txt",
      "src/example.test.ts.snap",
    ];

    expect(selectTrackedArchitectureFiles(candidates)).toEqual(candidates.slice(0, 6));
  });

  it("keeps tracked executable and configuration files free of Data API consumers", () => {
    const violations = findDataApiConsumers(ROOT);

    expect(violations, DATA_API_GUARD_MESSAGE).toEqual([]);
  });
});
