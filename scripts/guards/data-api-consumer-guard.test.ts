import { describe, expect, it } from "vitest";
import {
  detectDataApiSignalsInFiles,
  selectTrackedArchitectureFiles,
} from "./data-api-consumer-guard";

type Fixture = {
  name: string;
  source: string;
  expected: "allowed" | "detected";
  signal?: string;
};

const databaseFixtures: Fixture[] = [
  {
    name: "direct REST URL",
    source: 'fetch("https://project.example/rest/v1/records")',
    expected: "detected",
    signal: "direct REST Data API consumer",
  },
  {
    name: "REST URL assembled from simple constants",
    source: `
      const base = process.env.SUPABASE_URL;
      const prefix = "/rest";
      const version = "/v1";
      fetch(base + prefix + version + "/records");
    `,
    expected: "detected",
    signal: "direct REST Data API consumer",
  },
  {
    name: "direct GraphQL URL",
    source: "fetch(`${process.env.SUPABASE_URL}/graphql/v1`)",
    expected: "detected",
    signal: "direct GraphQL Data API consumer",
  },
  {
    name: "GraphQL URL assembled from simple constants",
    source: `
      const path = "/graphql" + "/v1";
      fetch(process.env.SUPABASE_URL + path);
    `,
    expected: "detected",
    signal: "direct GraphQL Data API consumer",
  },
  {
    name: "PostgREST ESM client",
    source: 'import { PostgrestClient } from "@supabase/postgrest-js";',
    expected: "detected",
    signal: "PostgREST client",
  },
  {
    name: "PostgREST CommonJS client",
    source: 'const { PostgrestClient } = require("@supabase/postgrest-js");',
    expected: "detected",
    signal: "PostgREST client",
  },
  {
    name: "PostgREST package dependency",
    source: '{"dependencies":{"@supabase/postgrest-js":"1.0.0"}}',
    expected: "detected",
    signal: "PostgREST client",
  },
  {
    name: "explicit database Data API configuration",
    source: 'const DATA_API_ENDPOINT = "https://database.example";',
    expected: "detected",
    signal: "explicit Data API configuration",
  },
  {
    name: "renamed client with from",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const recordsGateway = createClient(url, key);
      recordsGateway.from("records").select();
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "aliased factory with optional rpc",
    source: `
      import { createClient as makeGateway } from "@supabase/supabase-js";
      const gateway = makeGateway(url, key);
      gateway?.rpc("read_records");
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "schema from chain split across lines",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const gateway = createClient(url, key);
      gateway
        .schema("published")
        .from("records")
        .select();
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "schema rpc chain",
    source: `
      import { createClient } from "@supabase/supabase-js";
      createClient(url, key).schema("published").rpc("read_records");
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "CommonJS factory and client alias",
    source: `
      const { createClient: makeGateway } = require("@supabase/supabase-js");
      const initialClient = makeGateway(url, key);
      const databaseClient = initialClient;
      databaseClient.from("records").select();
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "CommonJS namespace with later client assignment",
    source: `
      const supabase = require("@supabase/supabase-js");
      let gateway;
      gateway = supabase.createClient(url, key);
      gateway.rpc("read_records");
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
  {
    name: "ESM namespace factory",
    source: `
      import * as supabase from "@supabase/supabase-js";
      const gateway = supabase.createClient(url, key);
      gateway.from("records").select();
    `,
    expected: "detected",
    signal: "Supabase database operation",
  },
];

const allowedFixtures: Fixture[] = [
  {
    name: "Auth",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const client = createClient(url, key);
      client.auth.getUser();
    `,
    expected: "allowed",
  },
  {
    name: "Storage from",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const client = createClient(url, key);
      client.storage.from("avatars").download("photo.jpg");
    `,
    expected: "allowed",
  },
  {
    name: "Realtime",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const client = createClient(url, key);
      client.channel("updates").subscribe();
    `,
    expected: "allowed",
  },
  {
    name: "unrelated from method",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const client = createClient(url, key);
      client.auth.getSession();
      const queue = createQueue();
      queue.from("start");
    `,
    expected: "allowed",
  },
  {
    name: "unrelated rpc method",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const client = createClient(url, key);
      client.channel("updates").subscribe();
      const transport = createTransport();
      transport.rpc("ping");
    `,
    expected: "allowed",
  },
  {
    name: "SDK and public configuration without database access",
    source: `
      import { createClient } from "@supabase/supabase-js";
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      createClient(url, key).auth.getSession();
    `,
    expected: "allowed",
  },
];

describe("SEC-02 Data API consumer scanner", () => {
  it.each(databaseFixtures)("classifies $name as $expected", ({ source, signal }) => {
    expect(detectDataApiSignalsInFiles({ "consumer.ts": source })).toContainEqual({
      file: "consumer.ts",
      signal,
    });
  });

  it.each(allowedFixtures)("classifies $name as $expected", ({ source }) => {
    expect(detectDataApiSignalsInFiles({ "allowed.ts": source })).toEqual([]);
  });

  it("excludes documentation and the guard fixtures while retaining tracked code", () => {
    const candidates = [
      "src/app/example.ts",
      "scripts/example.ts",
      ".github/actions/example/index.js",
      "tooling/example.ts",
      "config/example.toml",
      "packages/client/src/index.ts",
      "docs/architecture.md",
      "scripts/guards/data-api-consumer-guard.test.ts",
      "src/__tests__/no-data-api-consumers.test.ts",
      "src/generated/client.ts",
      "test/fixtures/example.txt",
      "src/example.test.ts.snap",
    ];

    expect(selectTrackedArchitectureFiles(candidates)).toEqual(candidates.slice(0, 6));
  });

  it("allows Data API paths in tracked documentation", () => {
    const documentation = ["docs/data-api.md", "README.md"];
    const content = "Examples may mention /rest/v1 or /graphql/v1.";

    expect(content).toContain("/rest/v1");
    expect(selectTrackedArchitectureFiles(documentation)).toEqual([]);
  });
});

describe("SEC-02 shared Supabase client scanner", () => {
  const clientModule = `
    import { createClient } from "@supabase/supabase-js";
    export const sharedClient = createClient(url, key);
  `;

  const sharedClientFixtures: Array<{ name: string; files: Record<string, string> }> = [
    {
      name: "named export",
      files: {
        "client.ts": clientModule,
        "consumer.ts": `
          import { sharedClient } from "./client";
          sharedClient.from("records").select();
        `,
      },
    },
    {
      name: "default export",
      files: {
        "client.ts": `${clientModule}\nexport default sharedClient;`,
        "consumer.ts": `
          import databaseClient from "./client";
          databaseClient.rpc("read_records");
        `,
      },
    },
    {
      name: "aliased named import",
      files: {
        "client.ts": clientModule,
        "consumer.ts": `
          import { sharedClient as gateway } from "./client";
          gateway.schema("published").from("records").select();
        `,
      },
    },
    {
      name: "simple barrel re-export",
      files: {
        "client.ts": clientModule,
        "index.ts": 'export { sharedClient } from "./client";',
        "consumer.ts": `
          import { sharedClient } from "./index";
          sharedClient.schema("published").rpc("read_records");
        `,
      },
    },
  ];

  it.each(sharedClientFixtures)("detects a shared client through $name", ({ files }) => {
    expect(detectDataApiSignalsInFiles(files)).toContainEqual({
      file: "consumer.ts",
      signal: "Supabase database operation",
    });
  });

  it.each([
    ["Auth", "sharedClient.auth.getUser()"],
    ["Storage", 'sharedClient.storage.from("avatars").download("photo.jpg")'],
    ["Realtime", 'sharedClient.channel("updates").subscribe()'],
  ])("allows a shared %s-only client", (_service, operation) => {
    const files = {
      "client.ts": clientModule,
      "consumer.ts": `
        import { sharedClient } from "./client";
        ${operation};
      `,
    };

    expect(detectDataApiSignalsInFiles(files)).toEqual([]);
  });

  it("does not trust a Supabase-looking type without a createClient origin", () => {
    const files = {
      "client.ts": `
        export type SupabaseClient = { from(name: string): unknown };
        export declare const typedClient: SupabaseClient;
      `,
      "consumer.ts": `
        import { typedClient } from "./client";
        typedClient.from("records");
      `,
    };

    expect(detectDataApiSignalsInFiles(files)).toEqual([]);
  });
});
