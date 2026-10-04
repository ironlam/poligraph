// @vitest-environment node
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";

vi.mock("server-only", () => ({}));
// The page reads go through Next cache wrappers; outside a Next request they must be inert.
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

type PageData = typeof import("../page-data");
type Reads = typeof import("@/lib/data/politician-profile-reads");

let db: typeof import("@/lib/db").db;
let pageData: PageData;
let reads: Reads;
let buildPoliticianProfileDocument: typeof import("@/lib/politicians/profile-snapshot/build").buildPoliticianProfileDocument;
let resolveProfileMandateType: typeof import("@/lib/politicians/profile-snapshot/build").resolveProfileMandateType;
let writeProfileSnapshot: typeof import("@/lib/politicians/profile-snapshot/store").writeProfileSnapshot;

const SLUG = "page-data-test";
const DEPUTE = `${SLUG}-depute`;
const MAIRE = `${SLUG}-maire`;
const EURODEPUTE = `${SLUG}-eurodepute`;
const SANS_MANDAT = `${SLUG}-sans-mandat`;
const COMMUNE_ID = "99901";
const GROUP_CODE = "PDT";
const EURO_GROUP_CODE = "PDT-EU";
const PARTY_NAME = "Parti de test page-data";
const FACTCHECK_URL = "https://example.test/page-data/factcheck";
const SCRUTIN_PREFIX = "PDT-SCRUTIN";
const DOSSIER_EXTERNAL_ID = "PDT-DOSSIER-1";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** `Prisma.Decimal` → number, as the document stores it (controller Ruling 6). */
function decimalsAsNumbers(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decimalsAsNumbers);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decimalsAsNumbers(v)]));
}

async function cleanup() {
  await db.factCheckMention.deleteMany({ where: { politician: { slug: { startsWith: SLUG } } } });
  await db.affair.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await db.factCheck.deleteMany({ where: { sourceUrl: FACTCHECK_URL } });
  await db.scrutin.deleteMany({ where: { externalId: { startsWith: SCRUTIN_PREFIX } } });
  await db.legislativeDossier.deleteMany({ where: { externalId: DOSSIER_EXTERNAL_ID } });
  await db.parliamentaryGroup.deleteMany({ where: { code: GROUP_CODE } });
  await db.europeanGroup.deleteMany({ where: { code: EURO_GROUP_CODE } });
  await db.commune.deleteMany({ where: { id: COMMUNE_ID } });
  await db.party.deleteMany({ where: { name: PARTY_NAME } });
}

/** What the page derives from the live reads it used before the switch. */
async function deriveFromLiveReads(slug: string) {
  const identity = await reads.readPoliticianIdentity({ slug });
  const dossier = await reads.readPoliticianDossier({ slug });
  if (!identity || !dossier) throw new Error(`fixture: ${slug} devrait être lisible`);
  const mandateType = resolveProfileMandateType(identity);
  const voteStats = mandateType ? await reads.readProfileVoteStats(identity.id, mandateType) : null;
  return {
    model: pageData.derivePoliticianPageModel(identity, dossier, voteStats),
    metadata: pageData.buildPoliticianMetadata(identity, slug),
  };
}

/** What the page derives once it reads the stored document. */
async function deriveFromDocument(slug: string) {
  const loaded = await pageData.loadPoliticianPageUncached(slug);
  if (!loaded) throw new Error(`fixture: le document de ${slug} devrait se lire`);
  const { identity, dossier, voteStats } = loaded.profile;
  return {
    mandateType: loaded.profile.mandateType,
    model: pageData.derivePoliticianPageModel(identity, dossier, voteStats),
    metadata: pageData.buildPoliticianMetadata(identity, slug),
  };
}

async function storeDocument(slug: string) {
  const politician = await db.politician.findUniqueOrThrow({ where: { slug } });
  const document = await buildPoliticianProfileDocument({ id: politician.id });
  if (!document) throw new Error(`fixture: le document de ${slug} devrait se construire`);
  await writeProfileSnapshot({ politicianId: politician.id, document, startedAt: new Date() });
}

describeIfDisposableDb("fiche politicien lue depuis son document", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    pageData = await import("../page-data");
    reads = await import("@/lib/data/politician-profile-reads");
    ({ buildPoliticianProfileDocument, resolveProfileMandateType } =
      await import("@/lib/politicians/profile-snapshot/build"));
    ({ writeProfileSnapshot } = await import("@/lib/politicians/profile-snapshot/store"));

    await cleanup();

    const party = await db.party.create({
      data: { name: PARTY_NAME, shortName: "PDT", slug: `${SLUG}-parti`, color: "#123456" },
    });
    const group = await db.parliamentaryGroup.create({
      data: { code: GROUP_CODE, name: "Groupe de test page-data", chamber: "AN", color: "#654321" },
    });
    const euroGroup = await db.europeanGroup.create({
      data: { code: EURO_GROUP_CODE, name: "Groupe européen de test page-data" },
    });
    await db.commune.create({
      data: { id: COMMUNE_ID, name: "Commune fictive", departmentCode: "99", population: 4200 },
    });

    // A mayor, the other side of the deputy's linked affair.
    const maire = await db.politician.create({
      data: {
        slug: MAIRE,
        firstName: "Dominique",
        lastName: "Imaginaire",
        fullName: "Dominique Imaginaire",
        civility: "Mme",
        publicationStatus: "PUBLISHED",
        biography: "Biographie fictive d'une maire de test.",
        mandates: {
          create: {
            type: "MAIRE",
            title: "Maire de Commune fictive",
            institution: "Mairie de Commune fictive",
            startDate: d("2020-07-01"),
            isCurrent: true,
            localData: { create: { communeId: COMMUNE_ID } },
          },
        },
      },
    });
    const maireAffair = await db.affair.create({
      data: {
        politicianId: maire.id,
        title: "Dossier fictif côté maire",
        slug: `${SLUG}-affaire-maire`,
        description: "Description fictive.",
        status: "MISE_EN_EXAMEN",
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus: "PUBLISHED",
      },
    });

    // A sitting deputy who also became a local councillor later, so the headline mandate and the
    // parliamentary one differ, with votes, affairs, fact-checks, declarations and a dossier.
    const depute = await db.politician.create({
      data: {
        slug: DEPUTE,
        firstName: "Camille",
        lastName: "Fictive",
        fullName: "Camille Fictive",
        civility: "M.",
        birthDate: d("1970-05-04"),
        birthPlace: "Ville fictive",
        photoUrl: "https://example.test/photo.jpg",
        publicationStatus: "PUBLISHED",
        biography: "Biographie fictive d'un député de test.",
        biographyGeneratedAt: d("2026-01-02"),
        currentPartyId: party.id,
        mandates: {
          create: [
            {
              type: "DEPUTE",
              title: "Député de la 1re circonscription de test",
              institution: "Assemblée nationale",
              constituency: "Test (1re)",
              role: "Président de l'Assemblée nationale",
              startDate: d("2024-07-07"),
              isCurrent: true,
              parliamentaryData: { create: { parliamentaryGroupId: group.id } },
            },
            {
              type: "CONSEILLER_MUNICIPAL",
              title: "Conseiller municipal de Commune fictive",
              institution: "Conseil municipal",
              startDate: d("2025-03-01"),
              isCurrent: true,
              localData: { create: { communeId: COMMUNE_ID } },
            },
            {
              type: "DEPUTE",
              title: "Député de la 1re circonscription de test (ancien)",
              institution: "Assemblée nationale",
              startDate: d("2017-06-21"),
              endDate: d("2022-06-21"),
              isCurrent: false,
            },
          ],
        },
        declarations: {
          create: [
            {
              type: "INTERETS",
              year: 2025,
              hatvpUrl: "https://example.test/hatvp/interets",
              details: {
                totalPortfolioValue: 1_250_000,
                totalCompanies: 2,
                financialParticipations: [
                  { company: "Société fictive A", isBoardMember: true },
                  { company: "Société fictive B", isBoardMember: false },
                ],
              },
            },
            {
              type: "PATRIMOINE_DEBUT_MANDAT",
              year: 2024,
              hatvpUrl: "https://example.test/hatvp/patrimoine",
              realEstate: new Prisma.Decimal("350000.50"),
              totalNet: new Prisma.Decimal("410000.25"),
            },
          ],
        },
        externalIds: {
          create: [
            {
              source: "ASSEMBLEE_NATIONALE",
              externalId: "PA-PDT-1",
              url: "https://example.test/an/PA-PDT-1",
            },
            {
              source: "OPENSANCTIONS",
              externalId: "os-pdt-1",
              metadata: { datasets: ["fr_assemblee", "wd_peps"] },
            },
          ],
        },
        partyHistory: {
          create: [
            { partyId: party.id, role: "MEMBRE", startDate: d("2015-01-01") },
            { partyId: party.id, role: "PORTE_PAROLE", startDate: d("2023-01-01") },
          ],
        },
      },
    });
    await db.affair.create({
      data: {
        politicianId: depute.id,
        title: "Dossier fictif côté député",
        slug: `${SLUG}-affaire-depute`,
        description: "Description fictive.",
        status: "CONDAMNATION_PREMIERE_INSTANCE",
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus: "PUBLISHED",
        verdictDate: d("2025-06-01"),
        fineAmount: new Prisma.Decimal("15000.00"),
        partyAtTimeId: party.id,
        linkedAffairId: maireAffair.id,
        sources: {
          create: {
            url: "https://example.test/presse/1",
            title: "Article fictif",
            publisher: "Journal fictif",
            publishedAt: d("2025-06-02"),
          },
        },
        events: {
          create: [
            { date: d("2024-01-10"), type: "PLAINTE", title: "Plainte fictive" },
            { date: d("2025-06-01"), type: "CONDAMNATION", title: "Jugement fictif" },
          ],
        },
      },
    });
    await db.affair.create({
      data: {
        politicianId: depute.id,
        title: "Mention fictive",
        slug: `${SLUG}-affaire-mention`,
        description: "Description fictive.",
        status: "ENQUETE_PRELIMINAIRE",
        category: "FAVORITISME",
        involvement: "MENTIONED_ONLY",
        publicationStatus: "PUBLISHED",
      },
    });
    // Never shown: a draft affair must not reach either side.
    await db.affair.create({
      data: {
        politicianId: depute.id,
        title: "Brouillon fictif",
        slug: `${SLUG}-affaire-brouillon`,
        description: "Description fictive.",
        status: "INSTRUCTION",
        category: "FAVORITISME",
        involvement: "DIRECT",
        publicationStatus: "DRAFT",
      },
    });

    const factCheck = await db.factCheck.create({
      data: {
        claimText: "Affirmation fictive.",
        title: "Vérification fictive",
        verdict: "Faux",
        verdictRating: "FALSE",
        source: "AFP Factuel",
        sourceUrl: FACTCHECK_URL,
        publishedAt: d("2025-09-01"),
        publicationStatus: "PUBLISHED",
      },
    });
    await db.factCheckMention.create({
      data: { factCheckId: factCheck.id, politicianId: depute.id },
    });

    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: DOSSIER_EXTERNAL_ID,
        slug: `${SLUG}-dossier`,
        title: "Proposition de loi fictive",
        shortTitle: "PPL fictive",
        number: "PPL 0001",
        status: "DEPOSE",
        filingDate: d("2025-02-01"),
      },
    });
    await db.dossierAuthor.create({ data: { dossierId: dossier.id, politicianId: depute.id } });

    for (const [i, position] of (["POUR", "CONTRE", "ABSTENTION"] as const).entries()) {
      const scrutin = await db.scrutin.create({
        data: {
          externalId: `${SCRUTIN_PREFIX}-${i}`,
          slug: `${SLUG}-scrutin-${i}`,
          title: `Scrutin fictif ${i}`,
          votingDate: d(`2025-0${i + 1}-15`),
          legislature: 17,
          chamber: "AN",
          votesFor: 10,
          votesAgainst: 5,
          votesAbstain: 1,
          result: "ADOPTED",
        },
      });
      await db.vote.create({
        data: {
          scrutinId: scrutin.id,
          politicianId: depute.id,
          position,
          votingDate: scrutin.votingDate,
          chamber: "AN",
        },
      });
    }

    await db.politician.create({
      data: {
        slug: EURODEPUTE,
        firstName: "Alix",
        lastName: "Inventée",
        fullName: "Alix Inventée",
        publicationStatus: "PUBLISHED",
        mandates: {
          create: {
            type: "DEPUTE_EUROPEEN",
            title: "Député européen",
            institution: "Parlement européen",
            startDate: d("2024-07-16"),
            isCurrent: true,
            europeanData: { create: { europeanGroupId: euroGroup.id } },
          },
        },
      },
    });

    await db.politician.create({
      data: {
        slug: SANS_MANDAT,
        firstName: "Sacha",
        lastName: "Supposé",
        fullName: "Sacha Supposé",
        publicationStatus: "PUBLISHED",
      },
    });

    for (const slug of [DEPUTE, MAIRE, EURODEPUTE, SANS_MANDAT]) await storeDocument(slug);
  });

  afterAll(async () => {
    if (db) await cleanup();
  });

  it.each([
    ["un député avec votes et affaires", DEPUTE],
    ["une maire", MAIRE],
    ["un eurodéputé", EURODEPUTE],
    ["une personne sans mandat", SANS_MANDAT],
  ])(
    "dérive du document exactement ce que la page dérivait des lectures directes : %s",
    async (_, slug) => {
      const before = await deriveFromLiveReads(slug);
      const after = await deriveFromDocument(slug);

      expect(after.model.mandateType).toBe(after.mandateType);
      expect(after.model).toStrictEqual(decimalsAsNumbers(before.model));
      expect(after.metadata).toStrictEqual(before.metadata);
    }
  );

  it("garde le député, son groupe et ses votes quand un mandat local est plus récent", async () => {
    const { model } = await deriveFromDocument(DEPUTE);

    expect(model.currentMandate?.type).toBe("CONSEILLER_MUNICIPAL");
    expect(model.mandateType).toBe("DEPUTE");
    expect(model.currentGroup?.code).toBe(GROUP_CODE);
    expect(model.body.currentParliamentaryMandate?.constituency).toBe("Test (1re)");
    expect(model.body.isChamberPresident).toBe(true);
    expect(model.body.voteStats?.voteData.stats.total).toBe(3);
    expect(model.body.dossier.affairs.map((a) => a.slug).sort()).toEqual([
      `${SLUG}-affaire-depute`,
      `${SLUG}-affaire-mention`,
    ]);
    expect(model.body.dossier.affairs.find((a) => a.linkedAffair)?.linkedAffair?.slug).toBe(
      `${SLUG}-affaire-maire`
    );
    expect(model.body.dossier.factCheckMentions).toHaveLength(1);
    expect(model.body.dossier.dossierAuthors).toHaveLength(1);
    expect(model.personJsonLd.memberOf).toEqual([{ name: "Société fictive A" }]);
  });

  it("un rendu de fiche émet au plus 2 requêtes", async () => {
    // POLIGRAPH-2X guard: the stored document plus the presidential candidacy read.
    const m = await measurePostgresDriverOperation(() =>
      pageData.loadPoliticianPageUncached(DEPUTE)
    );
    expect(m.result?.profile.identity.slug).toBe(DEPUTE);
    expect(m.metrics.queryCount).toBeLessThanOrEqual(2);
  });

  it("ne rend rien pour une fiche inconnue", async () => {
    expect(await pageData.loadPoliticianPageUncached(`${SLUG}-inconnu`)).toBeNull();
  });
});
