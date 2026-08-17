import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  affairFindMany: vi.fn(),
  affairCount: vi.fn(),
  politicianFindFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    affair: { findMany: mocks.affairFindMany, count: mocks.affairCount },
    politician: { findFirst: mocks.politicianFindFirst },
  },
}));
vi.mock("@/lib/cache", () => ({
  withCache: (response: Response) => response,
}));
vi.mock("@/lib/api/with-public-route", () => ({
  withPublicRoute: <T extends (...args: never[]) => unknown>(handler: T) => handler,
}));

import { GET as getAffairs } from "./route";
import { GET as getAffairsExport } from "../export/affaires/route";
import { GET as getPoliticianAffairs } from "../politiques/[slug]/affaires/route";

const hiddenPartyAtTime = {
  id: "party-draft",
  publicId: "PT000999",
  slug: "parti-draft",
  shortName: "PD",
  name: "Parti DRAFT",
  color: "#654321",
  logoUrl: "https://example.test/draft.svg",
  _count: { politicians: 0 },
};

function publicAffair() {
  return {
    id: "affair-public",
    publicId: "AF000001",
    slug: "affaire-publique",
    title: "Affaire publique conservée",
    description: "Description sourcée",
    status: "MISE_EN_EXAMEN",
    category: "CORRUPTION",
    severity: "CRITIQUE",
    involvement: "DIRECT",
    factsDate: null,
    startDate: null,
    verdictDate: null,
    sentence: null,
    appeal: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    politician: {
      id: "politician-public",
      publicId: "PG000001",
      slug: "alice-publique",
      fullName: "Alice Publique",
      currentParty: { shortName: "PP", name: "Parti public", politicalPosition: null },
    },
    partyAtTime: hiddenPartyAtTime,
    sources: [{ id: "source-1", url: "https://example.test/source", title: "Source" }],
    _count: { sources: 1 },
    courtDecisions: [],
    isRelatedToMandate: true,
    fineAmount: null,
    prisonMonths: null,
    prisonFirmMonths: null,
    ineligibilityMonths: null,
    ineligibilityFirmMonths: null,
    communityService: null,
    otherSentence: null,
    court: null,
  };
}

async function callRoute(
  route: unknown,
  request: NextRequest,
  context?: { params: Promise<{ slug: string }> }
): Promise<Response> {
  return (route as (request: NextRequest, context?: unknown) => Promise<Response>)(
    request,
    context
  );
}

describe("API affaires, frontière partyAtTime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.affairCount.mockResolvedValue(1);
  });

  it("conserve l'affaire mais ne sérialise aucune identité du parti historique non public", async () => {
    mocks.affairFindMany.mockResolvedValue([publicAffair()]);

    const response = await callRoute(getAffairs, new NextRequest("http://localhost/api/affaires"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: "affair-public",
        title: "Affaire publique conservée",
        partyAtTime: null,
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("Parti DRAFT");
    expect(JSON.stringify(body)).not.toContain("PT000999");
    expect(JSON.stringify(body)).not.toContain("parti-draft");
    expect(JSON.stringify(body)).not.toContain("draft.svg");
    expect(JSON.stringify(body)).not.toContain('"shortName":"PD"');
  });

  it("la route d'une personnalité applique la même neutralisation", async () => {
    mocks.politicianFindFirst.mockResolvedValue({
      id: "politician-public",
      slug: "alice-publique",
      fullName: "Alice Publique",
      firstName: "Alice",
      lastName: "Publique",
      photoUrl: null,
      currentParty: { shortName: "PP", name: "Parti public", color: "#123456" },
      affairs: [publicAffair()],
    });

    const response = await callRoute(
      getPoliticianAffairs,
      new NextRequest("http://localhost/api/politiques/alice-publique/affaires"),
      { params: Promise.resolve({ slug: "alice-publique" }) }
    );
    const body = await response.json();

    expect(body.affairs).toEqual([
      expect.objectContaining({
        id: "affair-public",
        title: "Affaire publique conservée",
        partyAtTime: null,
      }),
    ]);
    expect(JSON.stringify(body)).not.toContain("Parti DRAFT");
    expect(JSON.stringify(body)).not.toContain("PT000999");
    expect(JSON.stringify(body)).not.toContain("parti-draft");
    expect(JSON.stringify(body)).not.toContain("draft.svg");
    expect(JSON.stringify(body)).not.toContain('"shortName":"PD"');
  });

  it("l'export CSV garde la ligne sans nom, slug, couleur ni identifiant du parti masqué", async () => {
    mocks.affairFindMany.mockResolvedValue([publicAffair()]);

    const response = await callRoute(
      getAffairsExport,
      new NextRequest("http://localhost/api/export/affaires")
    );
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(csv).toContain("Affaire publique conservée");
    expect(csv).toContain("Alice Publique");
    expect(csv).not.toContain("Parti DRAFT");
    expect(csv).not.toContain("PT000999");
    expect(csv).not.toContain(";PD;");
    expect(csv).not.toContain("party-draft");
    expect(csv).not.toContain("draft.svg");
    expect(csv).not.toContain("#654321");
  });
});
