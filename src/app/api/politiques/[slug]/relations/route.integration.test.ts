import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { MandateType } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";

let db: typeof import("@/lib/db").db;
let getRelations: typeof import("./route").GET;

const PREFIX = "relations-route-test";
const CENTER = `${PREFIX}-centre`;

function details(companies: { participations?: string[]; directorships?: string[] }) {
  return {
    financialParticipations: (companies.participations ?? []).map((company) => ({
      company,
      evaluation: null,
      shares: null,
      capitalPercent: null,
      dividends: null,
      isBoardMember: false,
    })),
    professionalActivities: [],
    electoralMandates: [],
    directorships: (companies.directorships ?? []).map((company) => ({
      company,
      role: "Administrateur",
      startDate: null,
      endDate: null,
      annualRevenues: [],
    })),
    spouseActivity: null,
    collaborators: [],
    totalPortfolioValue: null,
    totalCompanies: 0,
    latestAnnualIncome: null,
    totalDirectorships: 0,
  };
}

async function seedPolitician(
  suffix: string,
  opts: {
    published?: boolean;
    declarations?: { year: number; details: ReturnType<typeof details> }[];
    government?: { name: string; type: MandateType }[];
  } = {}
) {
  return db.politician.create({
    data: {
      slug: `${PREFIX}-${suffix}`,
      firstName: "Test",
      lastName: suffix,
      fullName: `Test ${suffix}`,
      publicationStatus: opts.published === false ? "DRAFT" : "PUBLISHED",
      declarations: {
        create: (opts.declarations ?? []).map((d) => ({
          type: "INTERETS" as const,
          year: d.year,
          hatvpUrl: `https://example.test/${suffix}/${d.year}`,
          details: d.details,
        })),
      },
      mandates: {
        create: (opts.government ?? []).map((g) => ({
          type: g.type,
          title: "Ministre de test",
          institution: "Gouvernement",
          startDate: new Date("2022-05-20"),
          endDate: new Date("2023-07-20"),
          isCurrent: false,
          governmentData: { create: { governmentName: g.name } },
        })),
      },
    },
  });
}

async function read(types: string, limit = 10) {
  return measurePostgresDriverOperation(async () => {
    const response = await getRelations(
      new NextRequest(
        `https://poligraph.fr/api/politiques/${CENTER}/relations?types=${types}&limit=${limit}`
      ),
      { params: Promise.resolve({ slug: CENTER }) }
    );
    return { status: response.status, body: await response.json() };
  });
}

describeIfDisposableDb("GET /api/politiques/[slug]/relations, PostgreSQL", () => {
  const GOV_A = `${PREFIX} Gouvernement A`;
  const GOV_B = `${PREFIX} Gouvernement B`;
  const GOV_C = `${PREFIX} Gouvernement C`;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ GET: getRelations } = await import("./route"));

    // 210 published politicians whose declarations share nothing, created before the matches:
    // the former `take: 200` without orderBy read them first and never reached the matches.
    for (let i = 0; i < 210; i++) {
      await seedPolitician(`filler-${String(i).padStart(3, "0")}`, {
        declarations: [{ year: 2024, details: details({ participations: [`Filler ${i} SA`] }) }],
      });
    }

    await seedPolitician("centre", {
      declarations: [
        { year: 2018, details: details({ participations: ["Ancienne SA"] }) },
        {
          year: 2024,
          details: details({
            participations: ["Acme SA", "SCI [Données non publiées]"],
            directorships: ["Beta SAS"],
          }),
        },
      ],
      government: [
        { name: GOV_A, type: "MINISTRE" },
        { name: GOV_B, type: "SECRETAIRE_ETAT" },
        { name: GOV_C, type: "MINISTRE" },
      ],
    });

    await seedPolitician("match-deux", {
      declarations: [
        {
          year: 2023,
          details: details({ participations: ["  acme sa "], directorships: ["BETA SAS"] }),
        },
      ],
    });
    await seedPolitician("match-un", {
      declarations: [{ year: 2024, details: details({ directorships: ["Beta SAS"] }) }],
    });
    // Held Acme in an older declaration only: the latest one no longer lists it.
    await seedPolitician("ancien-actionnaire", {
      declarations: [
        { year: 2019, details: details({ participations: ["Acme SA"] }) },
        { year: 2024, details: details({ participations: ["Autre SA"] }) },
      ],
    });
    await seedPolitician("brouillon", {
      published: false,
      declarations: [{ year: 2024, details: details({ participations: ["Acme SA"] }) }],
      government: [{ name: GOV_A, type: "MINISTRE" }],
    });
    await seedPolitician("non-publiees", {
      declarations: [
        { year: 2024, details: details({ participations: ["SCI [Données non publiées]"] }) },
      ],
    });

    for (const suffix of ["gov-a-1", "gov-a-2", "gov-a-3"]) {
      await seedPolitician(suffix, { government: [{ name: GOV_A, type: "MINISTRE" }] });
    }
    await seedPolitician("gov-b-1", { government: [{ name: GOV_B, type: "MINISTRE_DELEGUE" }] });
    await seedPolitician("gov-c-1", { government: [{ name: GOV_C, type: "PREMIER_MINISTRE" }] });
    // A non-government mandate type carrying the same government name must not count.
    await seedPolitician("gov-a-depute", { government: [{ name: GOV_A, type: "DEPUTE" }] });
  }, 120_000);

  afterAll(async () => {
    await db.politician.deleteMany({ where: { slug: { startsWith: PREFIX } } });
    await db.$disconnect();
  });

  it("SHARED_COMPANY lit toute la table et compare la dernière déclaration de chacun", async () => {
    const { result } = await read("SHARED_COMPANY");

    expect(result.status).toBe(200);
    const cluster = result.body.clusters.find((c: { type: string }) => c.type === "SHARED_COMPANY");
    expect(cluster.nodes.map((n: { slug: string }) => n.slug)).toEqual([
      `${PREFIX}-match-deux`,
      `${PREFIX}-match-un`,
    ]);
    const labels = Object.fromEntries(
      cluster.links.map((l: { target: string; label: string }) => [l.target, l.label])
    );
    const deux = cluster.nodes.find((n: { slug: string }) => n.slug === `${PREFIX}-match-deux`);
    expect(labels[deux.id].split(", ").sort()).toEqual(["BETA SAS", "acme sa"]);
  });

  it("SAME_GOVERNMENT : une requête pour tous les gouvernements, limit par gouvernement", async () => {
    // The center has no department mandate: this read costs only the center lookup.
    const baseline = await read("SAME_DEPARTMENT", 2);
    const { result, metrics } = await read("SAME_GOVERNMENT", 2);

    expect(result.status).toBe(200);
    const bySlugs = Object.fromEntries(
      result.body.clusters.map((c: { label: string; nodes: { slug: string }[] }) => [
        c.label.split(" (")[0],
        c.nodes.map((n) => n.slug),
      ])
    );
    expect(bySlugs).toEqual({
      [GOV_A]: [`${PREFIX}-gov-a-1`, `${PREFIX}-gov-a-2`],
      [GOV_B]: [`${PREFIX}-gov-b-1`],
      [GOV_C]: [`${PREFIX}-gov-c-1`],
    });
    // Colleagues, then their nodes: two queries for three governments, not one per government.
    expect(metrics.queryCount - baseline.metrics.queryCount).toBe(2);
  });
});
