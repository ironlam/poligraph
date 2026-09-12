import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let getElection: typeof import("./route").GET;

const PREFIX = "api-election-details-870";

describeIfDisposableDb("GET /api/elections/[slug], PostgreSQL", () => {
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
    const response = await getElection(
      new NextRequest(`https://poligraph.fr/api/elections/${slug}${query}`),
      { params: Promise.resolve({ slug }) }
    );
    return { response, body: await response.json() };
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

  it.each(["?page=0", "?page=1.5", "?limit=101"])(
    "rejette une pagination invalide: %s",
    async (query) => {
      const election = await seedElection("invalid", 1);
      const { response } = await read(election.slug, query);
      expect(response.status).toBe(400);
    }
  );
});
