import { describe, it, expect, afterAll, beforeAll, beforeEach, vi } from "vitest";

// Mock the Mistral client BEFORE importing the orchestrator.
const mockCall = vi.fn();
vi.mock("@/lib/api/mistral", async (orig) => {
  const actual = await orig<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: (...a: unknown[]) => mockCall(...a) };
});

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let generateScrutinCitizenImpacts: typeof import("@/services/sync/generate-scrutin-citizen-impacts").generateScrutinCitizenImpacts;

const PFX = "TEST_CI_";
let scrutinId: string;

const COOP_CONTENT =
  "<p>Afin de renforcer la transparence de la r&#xE9;partition de la valeur, les soci&#xE9;t&#xE9;s coop&#xE9;ratives agricoles publient annuellement les r&#xE9;sultats de leurs filiales et la part redistribu&#xE9;e aux associ&#xE9;s coop&#xE9;rateurs.</p>";

// A faithful impact (talks about the cooperatives-transparency measure).
const COHERENT_IMPACT =
  "**Ce qui était proposé**\n\nUn amendement proposait d'obliger les coopératives agricoles à publier chaque année la répartition de leurs revenus : les résultats de leurs filiales et la part redistribuée aux associés coopérateurs.";

// The 2084 failure mode: an import-ban measure absent from the amendment.
const INCOHERENT_IMPACT =
  "**Ce qui était proposé**\n\nIl proposait d'interdire l'importation de produits agricoles à bas prix ne respectant pas les mêmes normes sociales et environnementales que celles imposées aux producteurs.";

function mistralImpact(citizen_impact: string, confidence = 85) {
  return {
    choices: [
      {
        message: { role: "assistant", content: JSON.stringify({ citizen_impact, confidence }) },
        finish_reason: "stop",
      },
    ],
  };
}

async function resetImpact() {
  await db.scrutin.update({ where: { id: scrutinId }, data: { citizenImpact: null } });
}

describeIfDb("generateScrutinCitizenImpacts — amendment substance contract", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ generateScrutinCitizenImpacts } =
      await import("@/services/sync/generate-scrutin-citizen-impacts"));

    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX}DLR` } });

    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX}DLR`,
        slug: `${PFX}dossier`,
        title: "Projet de loi d'urgence pour la protection et la souveraineté agricoles",
        summary:
          "Mesures temporaires pour soutenir les agriculteurs face aux importations à bas prix et aux aléas climatiques.",
        status: "EN_COURS",
      },
    });

    const amendment = await db.amendment.create({
      data: {
        externalId: `${PFX}2084`,
        number: "2084",
        dossierId: dossier.id,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
        article: "APRÈS L'ARTICLE 22",
        content: COOP_CONTENT,
      },
    });

    const scrutin = await db.scrutin.create({
      data: {
        externalId: `${PFX}S1`,
        slug: `${PFX}s1`,
        title: "l'amendement n° 2084 de Mme Lechon après l'article 22 ...",
        sourceUrl: "https://www.assemblee-nationale.fr/dyn/17/scrutins/test-ci-s1",
        votingDate: new Date("2026-05-30"),
        legislature: 17,
        chamber: "AN",
        votesFor: 37,
        votesAgainst: 38,
        votesAbstain: 2,
        result: "REJECTED",
        summary:
          "Les députés ont rejeté un amendement visant à protéger les agriculteurs face aux importations à bas prix.",
        dossierLegislatifId: dossier.id,
        amendmentLinks: {
          create: [{ amendmentId: amendment.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
        },
      },
    });
    scrutinId = scrutin.id;

    await db.scrutinPolicyTitle.create({
      data: {
        scrutinId: scrutin.id,
        officialTitleSnapshot: scrutin.title,
        inputHash: "test-hash",
        policyTitle: "Obliger les coopératives agricoles à publier la répartition de leurs revenus",
        policySubtitle:
          "Les coopératives devront rendre publics les résultats de leurs filiales et la part redistribuée aux agriculteurs.",
        proceduralLabel: "Amendement n°2084",
        confidence: "HIGH",
        qualitySignals: {},
        generationSource: "LLM",
        status: "APPROVED",
      },
    });
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX}DLR` } });
  });

  beforeEach(async () => {
    mockCall.mockReset();
    await resetImpact();
  });

  it("feeds the linked amendment substance to the model, not the dossier as the measure", async () => {
    mockCall.mockResolvedValue(mistralImpact(COHERENT_IMPACT));
    await generateScrutinCitizenImpacts({ scrutinIds: [scrutinId], force: true });

    expect(mockCall).toHaveBeenCalledTimes(1);
    const userMessage = (mockCall.mock.calls[0]![0] as { content: string }[])[0]!.content;
    expect(userMessage).toContain("<sources-officielles>");
    expect(userMessage).toContain("coopératives agricoles");
    expect(userMessage).not.toContain("RÉSUMÉ EXISTANT");
  });

  it("persists a coherent impact", async () => {
    mockCall.mockResolvedValue(mistralImpact(COHERENT_IMPACT));
    const stats = await generateScrutinCitizenImpacts({ scrutinIds: [scrutinId], force: true });

    expect(stats.generated).toBe(1);
    const row = await db.scrutin.findUnique({ where: { id: scrutinId } });
    expect(row?.citizenImpact).toContain("coopératives agricoles");
  });

  it("does NOT persist an impact incoherent with the amendment (import-ban vs cooperatives)", async () => {
    mockCall.mockResolvedValue(mistralImpact(INCOHERENT_IMPACT));
    const stats = await generateScrutinCitizenImpacts({ scrutinIds: [scrutinId], force: true });

    expect(stats.generated).toBe(0);
    expect(stats.skippedIncoherent).toBe(1);
    const row = await db.scrutin.findUnique({ where: { id: scrutinId } });
    expect(row?.citizenImpact).toBeNull();
  });

  it("dryRun never writes to the database", async () => {
    mockCall.mockResolvedValue(mistralImpact(COHERENT_IMPACT));
    await generateScrutinCitizenImpacts({ scrutinIds: [scrutinId], force: true, dryRun: true });

    const row = await db.scrutin.findUnique({ where: { id: scrutinId } });
    expect(row?.citizenImpact).toBeNull();
  });
});

// Regression: an amendment-linked scrutin whose substance did NOT resolve
// (empty blocks) must still be guarded. Historically the guard was gated on
// `substanceBlocks.length > 0`, so these slipped through and a dossier-drifted
// impact was persisted unchecked (the SC-012903 failure mode).
const PFX2 = "TEST_CIG_";

const NEONIC_TITLE = "Interdire les néonicotinoïdes pour protéger les abeilles";
const NEONIC_SUBTITLE =
  "Rétablir l'interdiction des pesticides néonicotinoïdes tueurs d'abeilles, sans dérogation possible.";
// Impact coherent with the néonicotinoïdes policy title.
const NEONIC_IMPACT =
  "**Ce qui était proposé**\n\nUn amendement proposait d'interdire les néonicotinoïdes, ces pesticides accusés de tuer les abeilles, sans aucune dérogation.";
// Dossier-drift impact (cooperatives) — shares no salient term with the title.
const DRIFT_IMPACT =
  "**Ce qui était proposé**\n\nIl proposait d'obliger les coopératives agricoles à publier la répartition de leurs revenus entre filiales et associés.";

describeIfDb("generateScrutinCitizenImpacts — guard without resolved substance", () => {
  let noRefScrutinId: string;
  let ptDriftScrutinId: string;
  let ptOkScrutinId: string;

  async function cleanup() {
    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutinPolicyTitle.deleteMany({
      where: { scrutin: { externalId: { startsWith: PFX2 } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: PFX2 } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: PFX2 } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: `${PFX2}DLR` } });
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ generateScrutinCitizenImpacts } =
      await import("@/services/sync/generate-scrutin-citizen-impacts"));
    await cleanup();

    // No exposeDesMotifs on the dossier -> an amendment with empty content/summary
    // resolves to ZERO substance blocks (see substance-resolver fallback).
    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: `${PFX2}DLR`,
        slug: `${PFX2}dossier`,
        title: "Projet de loi sur l'agriculture",
        summary: "Résumé générique du dossier agricole.",
        status: "EN_COURS",
      },
    });

    async function makeScrutin(suffix: string, withPolicyTitle: boolean): Promise<string> {
      const amd = await db.amendment.create({
        data: {
          externalId: `${PFX2}A${suffix}`,
          number: `A${suffix}`,
          dossierId: dossier.id,
          status: "DEPOSE",
          legislature: 17,
          chamber: "AN",
          article: "ARTICLE 1",
          content: null,
          summary: null,
        },
      });
      const scrutin = await db.scrutin.create({
        data: {
          externalId: `${PFX2}S${suffix}`,
          slug: `${PFX2}s${suffix}`,
          title: `l'amendement n° ${suffix} du projet de loi sur l'agriculture`,
          sourceUrl: `https://www.assemblee-nationale.fr/dyn/17/scrutins/test-cig-${suffix}`,
          votingDate: new Date("2026-06-01"),
          legislature: 17,
          chamber: "AN",
          votesFor: 30,
          votesAgainst: 40,
          votesAbstain: 1,
          result: "REJECTED",
          summary: "Résumé générique du scrutin.",
          dossierLegislatifId: dossier.id,
          amendmentLinks: {
            create: [{ amendmentId: amd.id, role: "PRINCIPAL", source: "TITLE_REGEX" }],
          },
        },
      });
      if (withPolicyTitle) {
        await db.scrutinPolicyTitle.create({
          data: {
            scrutinId: scrutin.id,
            officialTitleSnapshot: scrutin.title,
            inputHash: "test-hash",
            policyTitle: NEONIC_TITLE,
            policySubtitle: NEONIC_SUBTITLE,
            proceduralLabel: `Amendement n°${suffix}`,
            confidence: "HIGH",
            qualitySignals: {},
            generationSource: "LLM",
            status: "APPROVED",
          },
        });
      }
      return scrutin.id;
    }

    noRefScrutinId = await makeScrutin("NOREF", false);
    ptDriftScrutinId = await makeScrutin("DRIFT", true);
    ptOkScrutinId = await makeScrutin("OK", true);
  });

  afterAll(cleanup);

  beforeEach(() => {
    mockCall.mockReset();
  });

  it("does NOT persist when there is no reference (no substance AND no policy title)", async () => {
    mockCall.mockResolvedValue(mistralImpact(DRIFT_IMPACT));
    const stats = await generateScrutinCitizenImpacts({
      scrutinIds: [noRefScrutinId],
      force: true,
    });

    expect(stats.generated).toBe(0);
    expect(stats.skippedIncoherent).toBe(1);
    const row = await db.scrutin.findUnique({ where: { id: noRefScrutinId } });
    expect(row?.citizenImpact).toBeNull();
  });

  it("guards against the policy title even when substance did not resolve", async () => {
    mockCall.mockResolvedValue(mistralImpact(DRIFT_IMPACT));
    const stats = await generateScrutinCitizenImpacts({
      scrutinIds: [ptDriftScrutinId],
      force: true,
    });

    expect(stats.generated).toBe(0);
    expect(stats.skippedIncoherent).toBe(1);
    const row = await db.scrutin.findUnique({ where: { id: ptDriftScrutinId } });
    expect(row?.citizenImpact).toBeNull();
  });

  it("still persists an impact coherent with the policy title (no over-blocking)", async () => {
    mockCall.mockResolvedValue(mistralImpact(NEONIC_IMPACT));
    const stats = await generateScrutinCitizenImpacts({ scrutinIds: [ptOkScrutinId], force: true });

    expect(stats.generated).toBe(1);
    const row = await db.scrutin.findUnique({ where: { id: ptOkScrutinId } });
    expect(row?.citizenImpact).toContain("néonicotinoïdes");
  });
});
