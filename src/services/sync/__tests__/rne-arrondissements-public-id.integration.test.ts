import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

const network = vi.hoisted(() => ({ getText: vi.fn() }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = network.getText;
  },
}));
vi.mock("../rne-resource", () => ({
  resolveRneResourceUrl: async () => "https://example.test/arrondissements.csv",
  RNE_ARRONDISSEMENTS_FRAGMENTS: ["arrondissement"],
}));

let db: typeof import("@/lib/db").db;
let sync: typeof import("../rne-arrondissements").syncArrondissementMayors;
const prefix = "test-rne-public-id-";
const sector = "Paris 5Eme Secteur";
const csv = [
  "Code du département;Libellé du département;Code de la commune;Libellé de la commune;Libellé du secteur;Nom de l'élu;Prénom de l'élu;Code sexe;Date de naissance;Code de la catégorie socio-professionnelle;Libellé de la catégorie socio-professionnelle;Date de début du mandat;Libellé de la fonction;Date de début de la fonction",
  "75;Paris;75056;Paris;Paris 5Eme Secteur;MARTIN;Alice;F;1970-04-02;33;Cadre;2026-03-22;Maire d'arrondissement;2026-04-05",
].join("\n");

// Vraie extension Prisma + adaptateur pg. Seul le téléchargement est simulé.
// Ce fichier doit être lancé seul via le harness Docker : il désaligne les séquences.
describeIfDisposableDb("arrondissements : collision publicId et rollback PostgreSQL", () => {
  let oldMandateId: string;
  async function person(slug: string, publicId: string, firstName = "Benoît", lastName = "DUPONT") {
    return db.politician.create({
      data: {
        slug,
        publicId,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        birthDate: new Date("1970-04-02T12:00:00Z"),
        publicationStatus: "DRAFT",
      },
    });
  }
  async function clean() {
    await db.politician.deleteMany({
      where: {
        OR: [
          { slug: { startsWith: prefix } },
          { slug: "alice-martin" },
          { slug: "alice-martin-75056" },
        ],
      },
    });
  }
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ syncArrondissementMayors: sync } = await import("../rne-arrondissements"));
    await db.commune.upsert({
      where: { id: "75056" },
      update: {},
      create: {
        id: "75056",
        name: "Paris",
        departmentCode: "75",
        departmentName: "Paris",
        postalCodes: [],
      },
    });
  });
  beforeEach(async () => {
    await clean();
    network.getText.mockResolvedValue({ data: csv });
    const old = await person(`${prefix}old`, "PG-900000");
    const mandate = await db.mandate.create({
      data: {
        publicId: "MA-900000",
        politicianId: old.id,
        type: "MAIRE_ARRONDISSEMENT",
        title: "Prédécesseur",
        institution: "Mairie",
        startDate: new Date("2020-01-01"),
        isCurrent: true,
        localData: { create: { communeId: "75056", sectorLabel: sector } },
      },
    });
    oldMandateId = mandate.id;
    await db.$queryRaw`SELECT setval('poligraph_politician_seq', 900000, false)`;
    await db.$queryRaw`SELECT setval('poligraph_mandate_seq', 900000, false)`;
  });
  afterAll(async () => {
    if (!db) return;
    await clean();
    await db.$disconnect();
  });

  it.each([
    { known: true, collision: "mandate" },
    { known: false, collision: "politician" },
    { known: false, collision: "mandate" },
  ])("reprend toute la succession ($known, collision $collision)", async ({ known, collision }) => {
    if (known) await person(`${prefix}alice`, "PG-800000", "Alice", "MARTIN");
    if (!known && collision === "mandate") {
      await db.$queryRaw`SELECT setval('poligraph_politician_seq', 910000, false)`;
    }
    const result = await sync();
    expect(result.errors).toEqual([]);
    expect(result.succeeded).toBe(1);
    expect(result.linkedToExisting).toBe(known ? 1 : 0);
    expect(result.createdAsDraft).toBe(known ? 0 : 1);
    const old = await db.mandate.findUniqueOrThrow({ where: { id: oldMandateId } });
    expect(old.isCurrent).toBe(false);
    const current = await db.mandate.findMany({
      where: {
        type: "MAIRE_ARRONDISSEMENT",
        isCurrent: true,
        localData: { sectorLabel: sector },
      },
      include: { politician: true },
    });
    expect(current).toHaveLength(1);
    expect(current[0]!.startDate).toEqual(old.endDate);
    expect(current[0]!.politician.firstName).toBe("Alice");
    expect(current[0]!.politician.publicationStatus).toBe("DRAFT");
    expect(current[0]!.publicId).not.toBe("MA-900000");
    expect(await db.politician.count({ where: { firstName: "Alice", lastName: "MARTIN" } })).toBe(
      1
    );
  });

  it("préserve le prédécesseur après épuisement des six tentatives", async () => {
    const alice = await person(`${prefix}alice`, "PG-800000", "Alice", "MARTIN");
    for (let n = 1; n <= 5; n++) {
      await db.mandate.create({
        data: {
          publicId: `MA-${900000 + n}`,
          politicianId: alice.id,
          type: "MAIRE_ARRONDISSEMENT",
          title: "Collision",
          institution: "Mairie",
          startDate: new Date("2020-01-01"),
          isCurrent: false,
        },
      });
    }
    const result = await sync();
    expect(result.errors).toHaveLength(1);
    expect(result.succeeded).toBe(0);
    expect(result.linkedToExisting).toBe(0);
    expect(await db.mandate.findUniqueOrThrow({ where: { id: oldMandateId } })).toMatchObject({
      isCurrent: true,
      endDate: null,
    });
    const seq = await db.$queryRaw<
      { last_value: bigint }[]
    >`SELECT last_value FROM poligraph_mandate_seq`;
    expect(Number(seq[0]!.last_value)).toBe(900005);
  });

  it("ne relance pas une collision slug et annule la clôture", async () => {
    await person("alice-martin", "PG-700000");
    await person("alice-martin-75056", "PG-700001");
    await db.$queryRaw`SELECT setval('poligraph_politician_seq', 910000, false)`;
    await db.$queryRaw`SELECT setval('poligraph_mandate_seq', 910000, false)`;
    const result = await sync();
    expect(result.errors).toHaveLength(1);
    expect(result.succeeded).toBe(0);
    expect(result.createdAsDraft).toBe(0);
    expect(await db.mandate.findUniqueOrThrow({ where: { id: oldMandateId } })).toMatchObject({
      isCurrent: true,
      endDate: null,
    });
    const seq = await db.$queryRaw<
      { last_value: bigint }[]
    >`SELECT last_value FROM poligraph_politician_seq`;
    expect(Number(seq[0]!.last_value)).toBe(910000);
  });
});
