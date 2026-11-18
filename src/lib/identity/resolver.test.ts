import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataSource, Judgement, MatchMethod } from "@/generated/prisma";

// Mock the db module before importing resolver
vi.mock("@/lib/db", () => ({
  db: {
    politician: {
      findMany: vi.fn(),
    },
    mandate: {
      findMany: vi.fn(),
    },
    externalId: {
      findFirst: vi.fn(),
    },
    identityDecision: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { resolve, resolveBatch } from "./resolver";
import { db } from "@/lib/db";
import type { Mock } from "vitest";

// Prisma's complex generics don't play well with vi.mocked() — cast to vi.Mock
// The mock functions are vi.fn() at runtime (defined in vi.mock above)
const mockPoliticianFindMany = db.politician.findMany as Mock;
const mockMandateFindMany = db.mandate.findMany as Mock;
const mockExternalIdFindFirst = db.externalId.findFirst as Mock;
const mockDecisionFindMany = db.identityDecision.findMany as Mock;
const mockDecisionCreate = db.identityDecision.create as Mock;
const mockDecisionCreateMany = db.identityDecision.createMany as Mock;
const mockQueryRaw = db.$queryRaw as Mock;

describe("IdentityResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no prior decisions
    mockDecisionFindMany.mockResolvedValue([]);
    mockMandateFindMany.mockResolvedValue([]);
    // Default: no ExternalId match
    mockExternalIdFindFirst.mockResolvedValue(null);
    // Default: no name candidates
    mockPoliticianFindMany.mockResolvedValue([]);
    // Default: log decision succeeds
    mockDecisionCreate.mockResolvedValue({} as never);
    mockDecisionCreateMany.mockResolvedValue({ count: 0 } as never);
    // Default: empty frequency cache (NameFrequencyCache.loadFromDb uses $queryRaw)
    mockQueryRaw.mockResolvedValue([]);
  });

  describe("Step 1: Check prior decisions", () => {
    it("returns NOT_SAME when all candidates are blocked", async () => {
      mockDecisionFindMany.mockResolvedValue([
        {
          id: "dec-1",
          sourceType: DataSource.RNE,
          sourceId: "70069",
          politicianId: "pol-1",
          judgement: Judgement.NOT_SAME,
          confidence: 1.0,
          method: MatchMethod.MANUAL,
          evidence: {},
          decidedBy: "admin:ldiaby",
          decidedAt: new Date(),
          supersededBy: null,
        },
      ]);
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [],
        },
      ]);

      const result = await resolve({
        firstName: "Thierry",
        lastName: "Cousin",
        source: DataSource.RNE,
        sourceId: "70069",
      });

      expect(result.blocked).toBe(true);
      expect(result.politicianId).toBeNull();
    });

    it("returns SAME immediately when a high-confidence SAME decision exists", async () => {
      mockDecisionFindMany.mockResolvedValue([
        {
          id: "dec-1",
          sourceType: DataSource.RNE,
          sourceId: "70069",
          politicianId: "pol-1",
          judgement: Judgement.SAME,
          confidence: 0.98,
          method: MatchMethod.MANUAL,
          evidence: {},
          decidedBy: "admin:ldiaby",
          decidedAt: new Date(),
          supersededBy: null,
        },
      ]);

      const result = await resolve({
        firstName: "Thierry",
        lastName: "Cousin",
        source: DataSource.RNE,
        sourceId: "70069",
      });

      expect(result.politicianId).toBe("pol-1");
      expect(result.decision).toBe(Judgement.SAME);
      expect(result.confidence).toBe(0.98);
    });

    it("does not short-circuit on low-confidence SAME decision", async () => {
      mockDecisionFindMany.mockResolvedValue([
        {
          id: "dec-1",
          sourceType: DataSource.RNE,
          sourceId: "70069",
          politicianId: "pol-1",
          judgement: Judgement.SAME,
          confidence: 0.7, // Below AUTO_MATCH threshold
          method: MatchMethod.NAME_ONLY,
          evidence: {},
          decidedBy: "system:sync-rne",
          decidedAt: new Date(),
          supersededBy: null,
        },
      ]);
      // Should still proceed to candidate matching
      mockPoliticianFindMany.mockResolvedValue([]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        source: DataSource.RNE,
        sourceId: "70069",
      });

      // Should not have used the prior decision as auto-match
      expect(result.decision).toBe("NEW");
    });
  });

  describe("Step 2: Deterministic match via ExternalId", () => {
    it("matches by shared ExternalId with confidence 1.0", async () => {
      mockExternalIdFindFirst.mockResolvedValue({
        politicianId: "pol-1",
      } as never);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Dupont",
        source: DataSource.ASSEMBLEE_NATIONALE,
        sourceId: "PA789456",
      });

      expect(result.politicianId).toBe("pol-1");
      expect(result.confidence).toBe(1.0);
      expect(result.method).toBe(MatchMethod.EXTERNAL_ID);
      expect(result.decision).toBe(Judgement.SAME);
    });

    it("does not match ExternalId that is blocked by NOT_SAME decision", async () => {
      mockDecisionFindMany.mockResolvedValue([
        {
          id: "dec-1",
          sourceType: DataSource.ASSEMBLEE_NATIONALE,
          sourceId: "PA789456",
          politicianId: "pol-1",
          judgement: Judgement.NOT_SAME,
          confidence: 1.0,
          method: MatchMethod.MANUAL,
          evidence: {},
          decidedBy: "admin:ldiaby",
          decidedAt: new Date(),
          supersededBy: null,
        },
      ]);
      mockExternalIdFindFirst.mockResolvedValue({
        politicianId: "pol-1",
      } as never);
      mockPoliticianFindMany.mockResolvedValue([]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Dupont",
        source: DataSource.ASSEMBLEE_NATIONALE,
        sourceId: "PA789456",
      });

      // Should NOT match pol-1 because it's blocked
      expect(result.politicianId).not.toBe("pol-1");
    });
  });

  describe("Step 3: Birthdate match", () => {
    it("matches single candidate with matching birthdate at 0.9 confidence", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [{ departmentCode: "45" }],
        },
      ]);

      const result = await resolve({
        firstName: "Thierry",
        lastName: "Cousin",
        birthDate: new Date("1960-05-16"),
        source: DataSource.RNE,
        sourceId: "45321",
      });

      expect(result.politicianId).toBe("pol-1");
      expect(result.confidence).toBe(0.98); // 0.9 birthdate + 0.15 first name bonus (capped)
      expect(result.method).toBe(MatchMethod.BIRTHDATE);
    });

    it("rejects single candidate with mismatched birthdate", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [],
        },
      ]);

      const result = await resolve({
        firstName: "Thierry",
        lastName: "Cousin",
        birthDate: new Date("1975-03-22"),
        source: DataSource.RNE,
        sourceId: "70069",
      });

      expect(result.politicianId).toBeNull();
      expect(result.decision).toBe("NEW");
    });

    it("disambiguates homonyms by birthdate", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [{ departmentCode: "45" }],
        },
        {
          id: "pol-2",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1975-03-22"),
          mandates: [{ departmentCode: "70" }],
        },
      ]);

      const result = await resolve({
        firstName: "Thierry",
        lastName: "Cousin",
        birthDate: new Date("1975-03-22"),
        source: DataSource.RNE,
        sourceId: "70069",
      });

      expect(result.politicianId).toBe("pol-2");
      expect(result.method).toBe(MatchMethod.BIRTHDATE);
    });
  });

  describe("Step 4: Department match", () => {
    it("matches candidate with matching department mandate at 0.7 confidence", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [{ departmentCode: "75" }],
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        department: "75",
        source: DataSource.RNE,
        sourceId: "75056",
      });

      expect(result.politicianId).toBe("pol-1");
      expect(result.method).toBe(MatchMethod.DEPARTMENT);
      expect(result.confidence).toBe(0.85); // 0.7 department + 0.15 first name bonus
    });

    it("does not override birthdate match with department match", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: new Date("1970-01-01"),
          mandates: [{ departmentCode: "75" }],
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        birthDate: new Date("1970-01-01"),
        department: "75",
        source: DataSource.RNE,
        sourceId: "75056",
      });

      // Birthdate match (0.9) should take priority over department (0.7)
      expect(result.confidence).toBe(0.98); // 0.9 birthdate + 0.15 first name bonus (capped)
      expect(result.method).toBe(MatchMethod.BIRTHDATE);
    });
  });

  describe("Prominence boost", () => {
    it("pushes prominent NAME_ONLY match into REVIEW zone", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Rachida",
          lastName: "Dati",
          birthDate: null,
          mandates: [],
          prominenceScore: 470,
        },
      ]);

      const result = await resolve({
        firstName: "Rachida",
        lastName: "Dati",
        source: DataSource.MUNICIPALES,
        sourceId: "75056-DATI",
      });

      // 0.5 (base) + 0.15 (firstName exact) + 0.06 (prominence) + 0.05 (sole candidate) = 0.76
      expect(result.politicianId).toBe("pol-1");
      expect(result.decision).toBe(Judgement.UNDECIDED);
      expect(result.confidence).toBeCloseTo(0.76, 2);
    });

    it("does not apply to low-prominence politicians", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 50,
        },
        {
          id: "pol-2",
          firstName: "Pierre",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        source: DataSource.MUNICIPALES,
        sourceId: "99001-MARTIN",
      });

      // 0.5 + 0.15 = 0.65, no prominence boost (50 < 400), no sole-candidate (2 candidates)
      expect(result.politicianId).toBeNull();
      expect(result.decision).toBe("NEW");
    });

    it("does not apply when method is not NAME_ONLY", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [{ departmentCode: "75" }],
          prominenceScore: 800,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        department: "75",
        source: DataSource.MUNICIPALES,
        sourceId: "75056-MARTIN",
      });

      // Department match → method is DEPARTMENT, prominence boost skipped
      // 0.7 (dept) + 0.15 (firstName) = 0.85
      expect(result.confidence).toBeCloseTo(0.85, 2);
      expect(result.decision).toBe(Judgement.UNDECIDED);
    });
  });

  describe("Sole-candidate boost", () => {
    it("boosts single NAME_ONLY candidate into REVIEW zone", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        source: DataSource.RNE,
        sourceId: "99001",
      });

      // 0.5 + 0.15 (firstName) + 0.05 (sole candidate) = 0.70 → UNDECIDED
      expect(result.politicianId).toBe("pol-1");
      expect(result.decision).toBe(Judgement.UNDECIDED);
      expect(result.confidence).toBeCloseTo(0.7, 2);
    });

    it("does not apply with multiple candidates", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
        {
          id: "pol-2",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        source: DataSource.RNE,
        sourceId: "99001",
      });

      // Two candidates with same score → no sole-candidate boost → 0.65 → NEW
      expect(result.politicianId).toBeNull();
      expect(result.decision).toBe("NEW");
    });

    it("does not apply to non-NAME_ONLY matches", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: new Date("1970-01-01"),
          mandates: [],
          prominenceScore: 0,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        birthDate: new Date("1970-01-01"),
        source: DataSource.RNE,
        sourceId: "12345",
      });

      // Birthdate match → method BIRTHDATE → sole-candidate boost skipped
      // 0.9 + 0.15 = 0.98 (capped)
      expect(result.confidence).toBeCloseTo(0.98, 2);
      expect(result.decision).toBe(Judgement.SAME);
    });

    it("caps score below AUTO_MATCH threshold", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Rachida",
          lastName: "Dati",
          birthDate: null,
          mandates: [],
          prominenceScore: 800,
        },
      ]);

      const result = await resolve({
        firstName: "Rachida",
        lastName: "Dati",
        source: DataSource.MUNICIPALES,
        sourceId: "75056-DATI",
      });

      // 0.5 + 0.15 + 0.06 (prominence) + 0.05 (sole) = 0.76
      // Even with both boosts, stays well below AUTO_MATCH (0.95)
      expect(result.confidence).toBeLessThan(0.95);
      expect(result.decision).toBe(Judgement.UNDECIDED);
    });
  });

  describe("Step 6: Threshold decisions", () => {
    it("returns UNDECIDED for candidate in review zone (0.70-0.94)", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [{ departmentCode: "75" }],
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        department: "75",
        source: DataSource.RNE,
        sourceId: "75056",
      });

      // Department match gives 0.7 — in the review zone
      expect(result.decision).toBe(Judgement.UNDECIDED);
      expect(result.politicianId).toBe("pol-1");
    });

    it("returns NEW for candidate below REVIEW threshold (multiple candidates)", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Jean",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
        {
          id: "pol-2",
          firstName: "Pierre",
          lastName: "Martin",
          birthDate: null,
          mandates: [],
          prominenceScore: 0,
        },
      ]);

      const result = await resolve({
        firstName: "Jean",
        lastName: "Martin",
        source: DataSource.RNE,
        sourceId: "99001",
      });

      // Two candidates → no sole-candidate boost → 0.65 (NAME_ONLY + firstName) → below REVIEW
      expect(result.politicianId).toBeNull();
      expect(result.decision).toBe("NEW");
    });

    it("returns NEW when no candidates found", async () => {
      mockPoliticianFindMany.mockResolvedValue([]);

      const result = await resolve({
        firstName: "Inconnu",
        lastName: "Personne",
        source: DataSource.RNE,
        sourceId: "00000",
      });

      expect(result.politicianId).toBeNull();
      expect(result.decision).toBe("NEW");
      expect(result.candidates).toEqual([]);
    });

    it("auto-matches at 0.9 birthdate with confidence >= REVIEW (UNDECIDED)", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);

      const result = await resolve({
        firstName: "Marie",
        lastName: "Durand",
        birthDate: new Date("1970-01-01"),
        source: DataSource.RNE,
        sourceId: "12345",
      });

      // 0.98 (0.9 birthdate + 0.15 first name) reaches AUTO_MATCH
      expect(result.politicianId).toBe("pol-1");
      expect(result.decision).toBe(Judgement.SAME);
      expect(result.confidence).toBe(0.98);
    });
  });

  describe("Step 7: Logging", () => {
    it("creates an IdentityDecision after resolving a match", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);

      await resolve({
        firstName: "Marie",
        lastName: "Durand",
        birthDate: new Date("1970-01-01"),
        source: DataSource.RNE,
        sourceId: "12345",
      });

      expect(mockDecisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceType: DataSource.RNE,
          sourceId: "12345",
          politicianId: "pol-1",
          judgement: Judgement.SAME, // 0.98 with first name bonus
          method: MatchMethod.BIRTHDATE,
        }),
      });
    });

    it("does not log for NEW decisions with no candidates", async () => {
      mockPoliticianFindMany.mockResolvedValue([]);

      await resolve({
        firstName: "Inconnu",
        lastName: "Personne",
        source: DataSource.RNE,
        sourceId: "00000",
      });

      expect(mockDecisionCreate).not.toHaveBeenCalled();
    });

    it("does not break the resolver if logging fails", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);
      mockDecisionCreate.mockRejectedValue(new Error("DB connection lost"));

      // Should not throw
      const result = await resolve({
        firstName: "Marie",
        lastName: "Durand",
        birthDate: new Date("1970-01-01"),
        source: DataSource.RNE,
        sourceId: "12345",
      });

      expect(result.politicianId).toBe("pol-1");
    });

    it("stores fellegiSunter result in evidence JSON when frequency data available", async () => {
      // Provide frequency data so F-S combiner activates
      mockQueryRaw.mockResolvedValue([
        { name: "durand", count: BigInt(50) },
        { name: "martin", count: BigInt(200) },
      ]);

      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);

      await resolve({
        firstName: "Marie",
        lastName: "Durand",
        birthDate: new Date("1970-01-01"),
        source: DataSource.RNE,
        sourceId: "12345",
      });

      const createCall = mockDecisionCreate.mock.calls[0]![0] as {
        data: { evidence: Record<string, unknown> };
      };
      const evidence = createCall.data.evidence;
      expect(evidence).toHaveProperty("fellegiSunter");
      const fs = evidence.fellegiSunter as { compositeLogRatio: number; signals: unknown[] };
      expect(fs.compositeLogRatio).toBeTypeOf("number");
      expect(fs.signals).toBeInstanceOf(Array);
      expect(fs.signals.length).toBeGreaterThanOrEqual(4); // At least 4 legacy signals + name-frequency
    });
  });

  describe("resolveBatch", () => {
    it("reads departments from a flat mandate query, not a nested select (P2029)", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        { id: "pol-1", firstName: "Thierry", lastName: "Cousin", birthDate: null },
      ]);
      mockMandateFindMany.mockResolvedValue([{ politicianId: "pol-1", departmentCode: "45" }]);

      const { results } = await resolveBatch({
        sourceType: DataSource.RNE,
        persist: false,
        inputs: [
          {
            firstName: "Thierry",
            lastName: "Cousin",
            department: "45",
            source: DataSource.RNE,
            sourceId: "45321",
          },
        ],
      });

      const select = (mockPoliticianFindMany.mock.calls[0]![0] as { select: object }).select;
      expect(select).not.toHaveProperty("mandates");
      expect(results[0]!.confidence).toBe(0.85); // 0.7 department + 0.15 first name bonus
    });

    it("returns empty results for inputs with no matching politicians", async () => {
      mockPoliticianFindMany.mockResolvedValue([]);
      mockDecisionFindMany.mockResolvedValue([]);

      const result = await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Inconnu",
            lastName: "Personne",
            source: DataSource.RNE,
            sourceId: "00001",
          },
          {
            firstName: "Autre",
            lastName: "Inconnu",
            source: DataSource.RNE,
            sourceId: "00002",
          },
        ],
      });

      expect(result.stats.total).toBe(2);
      expect(result.stats.notFound).toBe(2);
      expect(result.stats.matched).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it("matches by birthdate using in-memory scoring", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [{ departmentCode: "45" }],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([]);

      const result = await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Thierry",
            lastName: "Cousin",
            birthDate: new Date("1960-05-16"),
            source: DataSource.RNE,
            sourceId: "45321",
          },
        ],
      });

      expect(result.stats.matched).toBe(1); // 0.98 with first name bonus = SAME
      expect(result.stats.review).toBe(0);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.politicianId).toBe("pol-1");
      expect(result.results[0]!.confidence).toBe(0.98);
    });

    it("respects NOT_SAME prior decisions from preloaded cache", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([
        {
          id: "dec-1",
          sourceType: DataSource.RNE,
          sourceId: "70069",
          politicianId: "pol-1",
          judgement: Judgement.NOT_SAME,
          confidence: 1.0,
          method: MatchMethod.MANUAL,
          evidence: {},
          decidedBy: "admin:ldiaby",
          decidedAt: new Date(),
          supersededBy: null,
        },
      ]);

      const result = await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Thierry",
            lastName: "Cousin",
            birthDate: new Date("1960-05-16"),
            source: DataSource.RNE,
            sourceId: "70069",
          },
        ],
      });

      expect(result.stats.blocked).toBe(1);
      expect(result.results).toHaveLength(0);
    });

    it("batch-creates decisions only for SAME and UNDECIDED", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([]);

      await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Marie",
            lastName: "Durand",
            birthDate: new Date("1970-01-01"),
            source: DataSource.RNE,
            sourceId: "12345",
          },
          {
            firstName: "Inconnu",
            lastName: "Personne",
            source: DataSource.RNE,
            sourceId: "99999",
          },
        ],
      });

      // Only SAME (Marie, 0.98 with first name bonus) persisted, not NEW (Inconnu)
      expect(mockDecisionCreateMany).toHaveBeenCalledTimes(1);
      expect(mockDecisionCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            sourceType: DataSource.RNE,
            sourceId: "12345",
            politicianId: "pol-1",
            judgement: Judgement.SAME,
          }),
        ],
      });
      // Individual create NOT called (createMany succeeded)
      expect(mockDecisionCreate).not.toHaveBeenCalled();
    });

    it("writes no decision when persist is false, and still returns the verdict", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([]);

      const { results } = await resolveBatch({
        sourceType: DataSource.RNE,
        persist: false,
        inputs: [
          {
            firstName: "Marie",
            lastName: "Durand",
            birthDate: new Date("1970-01-01"),
            source: DataSource.RNE,
            sourceId: "12345",
          },
        ],
      });

      expect(results[0]).toMatchObject({ politicianId: "pol-1", decision: Judgement.SAME });
      expect(mockDecisionCreateMany).not.toHaveBeenCalled();
      expect(mockDecisionCreate).not.toHaveBeenCalled();
    });

    it("falls back to individual creates when createMany fails", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Marie",
          lastName: "Durand",
          birthDate: new Date("1970-01-01"),
          mandates: [],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([]);
      mockDecisionCreateMany.mockRejectedValue(new Error("batch insert failed"));

      await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Marie",
            lastName: "Durand",
            birthDate: new Date("1970-01-01"),
            source: DataSource.RNE,
            sourceId: "12345",
          },
        ],
      });

      // createMany failed, so individual create should be called
      expect(mockDecisionCreate).toHaveBeenCalledTimes(1);
      expect(mockDecisionCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sourceType: DataSource.RNE,
          sourceId: "12345",
          politicianId: "pol-1",
        }),
      });
    });

    it("handles 0 inputs gracefully", async () => {
      const result = await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [],
      });
      expect(result.stats.total).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it("disambiguates homonyms by birthdate in batch mode", async () => {
      mockPoliticianFindMany.mockResolvedValue([
        {
          id: "pol-1",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1960-05-16"),
          mandates: [{ departmentCode: "45" }],
        },
        {
          id: "pol-2",
          firstName: "Thierry",
          lastName: "Cousin",
          birthDate: new Date("1975-03-22"),
          mandates: [{ departmentCode: "70" }],
        },
      ]);
      mockDecisionFindMany.mockResolvedValue([]);

      const result = await resolveBatch({
        sourceType: DataSource.RNE,
        inputs: [
          {
            firstName: "Thierry",
            lastName: "Cousin",
            birthDate: new Date("1975-03-22"),
            source: DataSource.RNE,
            sourceId: "70069",
          },
        ],
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.politicianId).toBe("pol-2");
    });
  });
});
