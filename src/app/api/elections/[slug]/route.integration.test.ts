import { NextRequest } from "next/server";
import { writeFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";

let db: typeof import("@/lib/db").db;
let getElection: typeof import("./route").GET;

const PREFIX = "api-election-details-870";

describeIfDisposableDb("GET /api/elections/[slug], PostgreSQL", () => {
  const metricsReports: Array<{ slug: string; query: string; metrics: unknown }> = [];
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ GET: getElection } = await import("./route"));
  });

  afterEach(async () => {
    await db.candidacy.deleteMany({ where: { election: { slug: { startsWith: PREFIX } } } });
    await db.election.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  });

  afterAll(async () => {
    const output = process.env.PERFORMANCE_METRICS_OUTPUT;
    if (output) await writeFile(output, `${JSON.stringify(metricsReports, null, 2)}\n`, "utf8");
    await db.$disconnect();
  });

  async function seedElection(suffix: string, count: number) {
    const election = await db.election.create({
      data: {
        slug: `${PREFIX}-${suffix}`,
        type: "MUNICIPALES",
        scope: "MUNICIPAL",
        title: `Élection fixture ${suffix}`,
      },
    });

    await db.candidacy.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        electionId: election.id,
        candidateName: `Candidate ${String(index).padStart(4, "0")}`,
        isElected: false,
        round1Pct: "12.00",
      })),
    });
    return election;
  }

  async function read(slug: string, query = "") {
    const capture = await measurePostgresDriverOperation(async () => {
      const response = await getElection(
        new NextRequest(`https://poligraph.fr/api/elections/${slug}${query}`),
        { params: Promise.resolve({ slug }) }
      );
      return { response, body: await response.json() };
    });
    metricsReports.push({ slug, query, metrics: capture.metrics });
    return { ...capture.result, metrics: capture.metrics };
  }

  it("charge et renvoie seulement la page demandée, avec un total SQL exact", async () => {
    const election = await seedElection("many", 205);
    const { response, body } = await read(election.slug, "?page=2&limit=20");

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=120"
    );
    expect(body.candidacies.data).toHaveLength(20);
    expect(body.candidacies.pagination).toEqual({
      page: 2,
      limit: 20,
      total: 205,
      totalPages: 11,
    });
    expect(body.candidacies.data[0].candidateName).toBe("Candidate 0020");
    expect(body.candidacies.data.at(-1).candidateName).toBe("Candidate 0039");
  });

  it("separates the HTTP execution from its SQL loader without logging request data", async () => {
    const election = await seedElection("telemetry", 25);
    const events: Array<Record<string, unknown>> = [];
    vi.stubEnv("DB_READ_TELEMETRY", "true");
    vi.stubEnv("DB_READ_SAMPLE_RATE", "1");
    vi.stubEnv("DB_READ_CONTEXT", "");
    const log = vi
      .spyOn(console, "info")
      .mockImplementation((line: string) => events.push(JSON.parse(line)));
    try {
      const result = await read(election.slug, "?page=1&limit=20&secret=PRIVATE_QUERY");
      expect(result.response.status).toBe(200);
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        operation: "elections.details.load",
        parent: "elections.details.http",
        context: "web",
        driverCalls: result.metrics.queryCount,
        driverRows: result.metrics.returnedRowCount,
      });
      expect(events[1]).toMatchObject({
        operation: "elections.details.http",
        parent: null,
        driverCalls: 0,
        driverRows: 0,
      });
      expect(JSON.stringify(events)).not.toContain(election.slug);
      expect(JSON.stringify(events)).not.toContain("PRIVATE_QUERY");
      events.length = 0;
      const invalid = await read(election.slug, "?page=-1");
      expect(invalid.response.status).toBe(400);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ operation: "elections.details.http", driverCalls: 0 });
    } finally {
      log.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("retourne une page vide pour une élection sans candidature", async () => {
    const election = await seedElection("empty", 0);
    const { body } = await read(election.slug);

    expect(body.candidacies).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it("parcourt toutes les pages sans doublon ni omission malgré des clés de tri égales", async () => {
    const election = await seedElection("stable-sort", 53);
    const names: string[] = [];

    for (let page = 1; page <= 3; page += 1) {
      const { body } = await read(election.slug, `?page=${page}&limit=20`);
      names.push(
        ...body.candidacies.data.map((item: { candidateName: string }) => item.candidateName)
      );
    }

    expect(names).toHaveLength(53);
    expect(new Set(names).size).toBe(53);
    expect(names).toEqual(
      Array.from({ length: 53 }, (_, index) => `Candidate ${String(index).padStart(4, "0")}`)
    );
  });

  it("ne fait pas croître la page avec le volume total", async () => {
    const small = await seedElection("small", 5);
    const large = await seedElection("large", 500);
    const smallResult = await read(small.slug, "?limit=20");
    const largeResult = await read(large.slug, "?limit=20");

    expect(smallResult.body.candidacies.data).toHaveLength(5);
    expect(largeResult.body.candidacies.data).toHaveLength(20);
    expect(JSON.stringify(largeResult.body.candidacies.data).length).toBeLessThan(
      JSON.stringify(smallResult.body.candidacies.data).length * 5
    );
  });

  it("borne les candidatures retournées par le driver PostgreSQL", async () => {
    const small = await seedElection("driver-small", 5);
    const smallResult = await read(small.slug, "?page=2&limit=20");

    const large = await seedElection("driver-large", 500);
    const largeResult = await read(large.slug, "?page=2&limit=20");

    expect(smallResult.response.status).toBe(200);
    expect(largeResult.response.status).toBe(200);
    expect(smallResult.metrics.queryCount).toBeGreaterThan(0);
    expect(smallResult.metrics.returnedRowCount).toBeGreaterThan(0);
    expect(largeResult.metrics.returnedRowCount).toBeLessThanOrEqual(40);
    expect(largeResult.metrics.serializedDriverResultBytes).toBeLessThan(10_000);
  });

  it.each(["?page=0", "?page=1.5", "?limit=101"])(
    "rejette une pagination invalide: %s",
    async (query) => {
      const election = await seedElection("invalid", 1);
      const { response } = await read(election.slug, query);
      expect(response.status).toBe(400);
    }
  );
});
