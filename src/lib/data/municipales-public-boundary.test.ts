import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  electionFindUnique: vi.fn(),
  candidacyFindMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/services/sync/compute-municipales-snapshots", () => ({
  computeDepartmentPartyDataLive: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: mocks.electionFindUnique },
    candidacy: { findMany: mocks.candidacyFindMany },
  },
}));

import { getCumulCandidates } from "./municipales";

describe("getCumulCandidates, frontière publique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.electionFindUnique.mockResolvedValue({ id: "municipales-2026" });
  });

  it("combine le statut public et le mandat national dans une seule relation politician", async () => {
    mocks.candidacyFindMany.mockImplementation(
      async (args: { where?: Record<string, unknown> }) => {
        const politicianWhere = args.where?.politician;
        const publicAndNational =
          typeof politicianWhere === "object" &&
          politicianWhere !== null &&
          "publicationStatus" in politicianWhere &&
          politicianWhere.publicationStatus === "PUBLISHED" &&
          "mandates" in politicianWhere;

        const publicCandidate = {
          id: "candidacy-public",
          candidateName: "Alice Publique",
          listName: "Liste publique",
          listPosition: 1,
          communeId: "75056",
          commune: { name: "Paris", departmentCode: "75" },
          politician: {
            id: "politician-public",
            slug: "alice-publique",
            fullName: "Alice Publique",
            photoUrl: null,
            currentParty: { shortName: "PP", color: "#123456" },
            mandates: [{ type: "DEPUTE" }],
          },
        };
        const draftCandidate = {
          ...publicCandidate,
          id: "candidacy-draft",
          candidateName: "Bastien Brouillon",
          politician: {
            ...publicCandidate.politician,
            id: "politician-draft",
            slug: "bastien-brouillon",
            fullName: "Bastien Brouillon",
          },
        };

        return (publicAndNational ? [publicCandidate] : [publicCandidate, draftCandidate]) as never;
      }
    );

    const candidates = await getCumulCandidates();

    expect(candidates).toEqual([
      expect.objectContaining({
        id: "candidacy-public",
        politician: expect.objectContaining({
          id: "politician-public",
          fullName: "Alice Publique",
        }),
      }),
    ]);
    expect(JSON.stringify(candidates)).not.toContain("Bastien Brouillon");
    expect(JSON.stringify(candidates)).not.toContain("politician-draft");
  });
});
