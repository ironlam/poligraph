import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";

const mockCall = vi.fn();
vi.mock("@/lib/api/mistral", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: (...a: unknown[]) => mockCall(...a) };
});
vi.mock("@/config/rate-limits", () => ({ AI_RATE_LIMIT_MS: 0, AI_429_BACKOFF_MS: 0 }));

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let generateScrutinSummaries: typeof import("@/services/sync/generate-scrutin-summaries").generateScrutinSummaries;

const PFX = "TEST_SUMM_";

function mistralText(content: string) {
  return { choices: [{ message: { role: "assistant", content }, finish_reason: "stop" }] };
}

// Regression: candidates refused for lack of amendment text keep their
// eligibility. With the budget applied to rows read, the newest refused rows
// filled every batch and older summarisable scrutins were never reached.
describeIfDb("generateScrutinSummaries — model-call budget", () => {
  let refusedIds: string[] = [];
  let summarisableId: string;

  async function cleanup() {
    await db.vote.deleteMany({ where: { scrutin: { externalId: { startsWith: PFX } } } });
    await db.scrutinAmendment.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.politician.deleteMany({ where: { slug: { startsWith: "test-summ-" } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX}DLR` } });
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ generateScrutinSummaries } = await import("@/services/sync/generate-scrutin-summaries"));
    await cleanup();

    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX}DLR`,
        slug: `${PFX}dossier`,
        title: "Projet de loi de test",
        status: "EN_COURS",
      },
    });
    const politician = await db.politician.create({
      data: {
        slug: "test-summ-depute",
        firstName: "Camille",
        lastName: "Fictive",
        fullName: "Camille Fictive",
        civility: "Mme",
      },
    });

    async function makeScrutin(suffix: string, day: number, content: string | null) {
      const amendment = await db.amendment.create({
        data: {
          externalId: `${PFX}A${suffix}`,
          number: suffix,
          dossierId: dossier.id,
          status: "REJETE",
          legislature: 17,
          chamber: "AN",
          content,
        },
      });
      // Far in the future so these rows are the newest candidates in the table.
      const votingDate = new Date(Date.UTC(2099, 0, day));
      const scrutin = await db.scrutin.create({
        data: {
          externalId: `${PFX}S${suffix}`,
          title: `l'amendement n° ${suffix} de Mme Fictive à l'article 1 du projet de loi de test`,
          votingDate,
          legislature: 17,
          chamber: "AN",
          type: "AMENDEMENT",
          votesFor: 10,
          votesAgainst: 20,
          votesAbstain: 0,
          result: "REJECTED",
          dossierLegislatifId: dossier.id,
          amendmentLinks: {
            create: [{ amendmentId: amendment.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
          },
          votes: {
            create: [
              {
                politicianId: politician.id,
                position: "CONTRE",
                votingDate,
                chamber: "AN",
                scrutinType: "AMENDEMENT",
              },
            ],
          },
        },
      });
      return scrutin.id;
    }

    // Three newest candidates: linked, but their amendment carries no text.
    refusedIds = [
      await makeScrutin("9001", 30, null),
      await makeScrutin("9002", 29, null),
      await makeScrutin("9003", 28, null),
    ];
    summarisableId = await makeScrutin(
      "9004",
      27,
      "<p>Les communes publient chaque année le montant de leurs subventions.</p>"
    );
  });

  afterAll(cleanup);

  beforeEach(async () => {
    mockCall.mockReset();
    await db.scrutin.updateMany({
      where: { externalId: { startsWith: PFX } },
      data: { summary: null },
    });
  });

  it("pages past refused candidates until the budget of model calls is spent", async () => {
    mockCall.mockResolvedValue(
      mistralText("Les députés ont rejeté une obligation de publication.")
    );

    const stats = await generateScrutinSummaries({ limit: 1 });

    expect(mockCall).toHaveBeenCalledTimes(1);
    expect(stats.generated).toBe(1);
    expect(stats.skippedNoSubstance).toBeGreaterThanOrEqual(refusedIds.length);
    const prompt = (mockCall.mock.calls[0]![0] as { content: string }[])[0]!.content;
    expect(prompt).toContain("subventions");

    const row = await db.scrutin.findUnique({ where: { id: summarisableId } });
    expect(row?.summary).toContain("publication");
    const refused = await db.scrutin.findMany({ where: { id: { in: refusedIds } } });
    expect(refused.every((r) => r.summary === null)).toBe(true);
  });
});
