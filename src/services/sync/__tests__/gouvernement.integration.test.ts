import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { parisMidnight } from "@/lib/governments/dates";

const { getTextMock } = vi.hoisted(() => ({ getTextMock: vi.fn() }));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getText = getTextMock;
  },
}));

let db: typeof import("@/lib/db").db;
let sync: typeof import("../gouvernement");

it("garde le test PostgreSQL derrière le garde de base jetable", () => {
  expect(describeIfDisposableDb).toBeDefined();
});

const HEADER =
  "id;gouvernement;code_fonction;prenom;nom;fonction;date_debut_fonction;date_fin_fonction";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n") + "\n";

describeIfDisposableDb("sync gouvernement (base jetable)", () => {
  const PREFIX = "test-gouv-sync-";
  const politicianIds: string[] = [];
  let inOfficeId = "";
  let bayrouId = "";
  let tmpDir = "";

  async function person(suffix: string, firstName = "Testsync", lastName = suffix) {
    const p = await db.politician.create({
      data: {
        slug: `${PREFIX}${suffix}`,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
      },
    });
    politicianIds.push(p.id);
    return p.id;
  }

  async function ourPoliticianIds() {
    const rows = await db.politician.findMany({
      where: { OR: [{ slug: { startsWith: PREFIX } }, { lastName: { startsWith: "Synctest" } }] },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async function tableCounts(): Promise<Record<string, number>> {
    const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
    );
    const out: Record<string, number> = {};
    for (const { table_name } of tables) {
      const [row] = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM "${table_name}"`
      );
      out[table_name] = Number(row!.n);
    }
    return out;
  }

  function writeCorrections(content: object): string {
    const file = path.join(tmpDir, `corrections-${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(file, JSON.stringify(content));
    return file;
  }

  async function runReal(correctionsPath: string) {
    const input = await sync.loadSyncInput({ currentOnly: true, correctionsPath });
    const plan = sync.planSync(input);
    const applied = await sync.applySync(plan, db);
    return { plan, applied };
  }

  async function setVerified(day: string | null) {
    await db.government.update({
      where: { id: inOfficeId },
      data: { compositionVerifiedAt: day ? new Date(`${day}T00:00:00Z`) : null },
    });
  }

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    sync = await import("../gouvernement");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gouv-sync-"));

    const pm = await person("pm");
    const inOffice = await db.government.create({
      data: {
        slug: `${PREFIX}en-exercice`,
        name: "Gouvernement Test Sync En Exercice",
        sequence: 9999,
        primeMinisterId: pm,
        primeMinisterAppointedAt: new Date("2025-10-10T00:00:00Z"),
        primeMinisterAppointedEvidence: "ACT",
      },
    });
    inOfficeId = inOffice.id;
    const bayrou = await db.government.create({
      data: {
        slug: "bayrou",
        name: "Gouvernement François Bayrou",
        sequence: 9998,
        primeMinisterId: pm,
        primeMinisterAppointedAt: new Date("2024-12-13T00:00:00Z"),
        primeMinisterAppointedEvidence: "ACT",
        endedAt: new Date("2025-10-12T00:00:00Z"),
      },
    });
    bayrouId = bayrou.id;
  });

  beforeEach(async () => {
    getTextMock.mockReset();
    const ids = await ourPoliticianIds();
    await db.mandate.deleteMany({ where: { politicianId: { in: ids } } });
    await db.externalId.deleteMany({ where: { politicianId: { in: ids } } });
    // Composition vérifiée avant la publication du CSV (2025-03-13) : source à jour.
    await setVerified("2025-01-01");
  });

  afterAll(async () => {
    const ids = await ourPoliticianIds();
    await db.mandate.deleteMany({ where: { politicianId: { in: ids } } });
    await db.government.deleteMany({ where: { id: { in: [inOfficeId, bayrouId] } } });
    await db.politician.deleteMany({ where: { id: { in: ids } } });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await db.$disconnect();
  });

  it("met une fonction en cours absente de la source dans toVerify sans la clore", async () => {
    const absent = await person("absent");
    const m = await db.mandate.create({
      data: {
        politicianId: absent,
        type: "MINISTRE",
        title: "Ministre absent",
        institution: "Gouvernement Test Sync En Exercice",
        startDate: parisMidnight("2025-10-12"),
        isCurrent: true,
        governmentData: { create: { governmentName: "Gouvernement Test Sync En Exercice" } },
      },
    });
    getTextMock.mockResolvedValue({
      data: csv(
        "900;Test Sync En Exercice;M;Anne;Synctest;Ministre présente;dimanche 12 octobre 2025;"
      ),
    });

    const { plan } = await runReal(writeCorrections({ _updated: "2026-10-11" }));

    expect(plan.toVerify.some((t) => t.includes("Testsync absent"))).toBe(true);
    const after = await db.mandate.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.endDate).toBeNull();
    expect(after.isCurrent).toBe(true);
  });

  it("n'écrit rien quand le CSV précède la composition vérifiée du gouvernement en exercice", async () => {
    await setVerified("2026-10-10");
    getTextMock.mockResolvedValue({
      data: csv("901;Test Sync En Exercice;M;Bruno;Synctest;Ministre;dimanche 12 octobre 2025;"),
    });
    const before = await tableCounts();

    // Chemin complet du service, garde levée explicitement ; fichier de corrections réel,
    // daté d'avant la composition vérifiée, donc ignoré lui aussi.
    const result = await sync.syncGouvernement({ allowDuringGovernmentMigration: true });

    expect(result.success).toBe(true);
    expect(result.plan.staleSources.length).toBeGreaterThanOrEqual(1);
    expect(result.plan.creates).toEqual([]);
    expect(result.plan.updates).toEqual([]);
    expect(result.plan.links).toEqual([]);
    expect(await tableCounts()).toEqual(before);
  });

  it("le dry-run pendant le gel n'écrit rien (comptages et fichier de corrections)", async () => {
    getTextMock.mockResolvedValue({
      data: csv(
        "902;François Bayrou;M;Chloé;Synctest;Ministre;lundi 23 décembre 2024;",
        "903;Test Inconnu;M;Denis;Synctest;Ministre;lundi 23 décembre 2024;"
      ),
    });
    const correctionsFile = path.join(process.cwd(), "data", "government-corrections.json");
    const statBefore = fs.statSync(correctionsFile);
    const contentBefore = fs.readFileSync(correctionsFile, "utf-8");
    const before = await tableCounts();

    const result = await sync.syncGouvernement({ dryRun: true });

    expect(result.skipped).toBeUndefined();
    expect(result.plan.toVerify.some((t) => t.includes("Chloé Synctest"))).toBe(true);
    expect(await tableCounts()).toEqual(before);
    expect(fs.statSync(correctionsFile).mtimeMs).toBe(statBefore.mtimeMs);
    expect(fs.readFileSync(correctionsFile, "utf-8")).toBe(contentBefore);
  });

  it("crée avec rattachement legacy ou nom actuel, dates à minuit Paris, sans lastConfirmedAt ; seconde passe vide", async () => {
    await person("emile", "Émile", "Synctest");
    await person("fanny", "Fanny", "Synctest");
    await person("gaston", "Gaston", "Synctest");
    getTextMock.mockResolvedValue({
      data: csv(
        "904;François Bayrou;M;Émile;Synctest;Ministre de test;lundi 23 décembre 2024;",
        "905;Test Sync En Exercice;MD;Fanny;Synctest;Ministre déléguée;dimanche 12 octobre 2025;",
        "906;Test Inconnu;SE;Gaston;Synctest;Secrétaire d'État;lundi 23 décembre 2024;"
      ),
    });
    const corrections = writeCorrections({ _updated: "2026-10-11" });

    const first = await runReal(corrections);
    expect(first.applied.errors).toEqual([]);
    expect(first.applied.mandatesCreated).toBe(3);
    expect(first.plan.unresolvedLabels).toEqual(["Gouvernement Test Inconnu"]);

    const created = await db.mandate.findMany({
      where: { politician: { lastName: "Synctest" } },
      include: { governmentData: true, politician: true },
    });
    const by = Object.fromEntries(created.map((m) => [m.politician.firstName, m]));
    expect(by["Émile"]!.governmentData!.governmentId).toBe(bayrouId);
    expect(by["Fanny"]!.governmentData!.governmentId).toBe(inOfficeId);
    expect(by["Gaston"]!.governmentData!.governmentId).toBeNull();
    expect(by["Émile"]!.startDate).toEqual(parisMidnight("2024-12-23"));
    expect(by["Émile"]!.governmentData!.startEvidence).toBe("DATASET");
    for (const m of created) expect(m.lastConfirmedAt).toBeNull();

    const second = await runReal(corrections);
    expect(second.plan.creates).toEqual([]);
    expect(second.plan.updates).toEqual([]);
    expect(second.plan.links).toEqual([]);
  });

  it("ne modifie jamais une fonction prouvée par un acte", async () => {
    const pid = await person("acte", "Hélène", "Synctest");
    const m = await db.mandate.create({
      data: {
        politicianId: pid,
        type: "MINISTRE",
        title: "Intitulé de l'acte",
        institution: "Gouvernement François Bayrou",
        startDate: parisMidnight("2024-12-23"),
        isCurrent: true,
        governmentData: {
          create: {
            governmentName: "Gouvernement François Bayrou",
            startEvidence: "ACT",
          },
        },
      },
      include: { governmentData: true },
    });
    getTextMock.mockResolvedValue({
      data: csv("907;François Bayrou;M;Hélène;Synctest;Autre intitulé;lundi 23 décembre 2024;"),
    });
    const corrections = writeCorrections({
      _updated: "2026-10-11",
      endMandates: [
        { politicianName: "Hélène Synctest", mandateType: "MINISTRE", endDate: "2025-10-12" },
      ],
    });

    const { plan, applied } = await runReal(corrections);

    expect(applied.errors).toEqual([]);
    expect(plan.skippedActVerified.length).toBe(2);
    const after = await db.mandate.findUniqueOrThrow({
      where: { id: m.id },
      include: { governmentData: true },
    });
    expect(after).toEqual(m);
  });

  it("les corrections locales ne rouvrent rien et ne posent pas lastConfirmedAt", async () => {
    const pid = await person("close", "Inès", "Synctest");
    const closed = await db.mandate.create({
      data: {
        politicianId: pid,
        type: "MINISTRE",
        title: "Ministre close",
        institution: "Gouvernement Test Sync En Exercice",
        startDate: parisMidnight("2025-10-12"),
        endDate: parisMidnight("2026-02-25"),
        isCurrent: false,
        governmentData: { create: { governmentName: "Gouvernement Test Sync En Exercice" } },
      },
    });
    const open = await db.mandate.create({
      data: {
        politicianId: pid,
        type: "MINISTRE_DELEGUE",
        title: "Ministre déléguée ouverte",
        institution: "Gouvernement Test Sync En Exercice",
        startDate: parisMidnight("2025-10-12"),
        isCurrent: true,
        governmentData: { create: { governmentName: "Gouvernement Test Sync En Exercice" } },
      },
    });
    getTextMock.mockResolvedValue({ data: csv() });
    const corrections = writeCorrections({
      _updated: "2026-10-11",
      endMandates: [
        { politicianName: "Inès Synctest", mandateType: "MINISTRE_DELEGUE", endDate: "2026-03-01" },
      ],
      newMembers: [
        {
          firstName: "Inès",
          lastName: "Synctest",
          fullName: "Inès Synctest",
          mandate: {
            type: "MINISTRE",
            title: "Ministre close",
            startDate: "2025-10-12",
            government: "Test Sync En Exercice",
          },
        },
      ],
      updateMembers: [{ politicianName: "Inès Synctest", updates: { slug: "pirate" } }],
    });

    const { plan, applied } = await runReal(corrections);

    expect(applied.errors).toEqual([]);
    expect(plan.errors.some((e) => e.includes("slug"))).toBe(true);
    const closedAfter = await db.mandate.findUniqueOrThrow({ where: { id: closed.id } });
    expect(closedAfter.isCurrent).toBe(false);
    expect(closedAfter.endDate).toEqual(parisMidnight("2026-02-25"));
    expect(closedAfter.lastConfirmedAt).toBeNull();
    const openAfter = await db.mandate.findUniqueOrThrow({ where: { id: open.id } });
    expect(openAfter.isCurrent).toBe(false);
    expect(openAfter.endDate).toEqual(parisMidnight("2026-03-01"));
    expect(openAfter.lastConfirmedAt).toBeNull();
    const politician = await db.politician.findUniqueOrThrow({ where: { id: pid } });
    expect(politician.slug).toBe(`${PREFIX}close`);
  });

  it("sans composition vérifiée du gouvernement en exercice, n'écrit rien", async () => {
    await setVerified(null);
    const pid = await person("ferme", "Jules", "Synctest");
    getTextMock.mockResolvedValue({
      data: csv("910;François Bayrou;M;Jules;Synctest;Ministre;lundi 23 décembre 2024;"),
    });
    const before = await tableCounts();

    const result = await sync.syncGouvernement({ allowDuringGovernmentMigration: true });

    expect(result.plan.staleSources.some((r) => r.includes("jamais vérifiée"))).toBe(true);
    expect(await tableCounts()).toEqual(before);
    expect(await db.mandate.count({ where: { politicianId: pid } })).toBe(0);
  });

  it("ne crée aucune personne inconnue, ni depuis le CSV ni depuis newMembers", async () => {
    getTextMock.mockResolvedValue({
      data: csv("911;François Bayrou;M;Karim;Synctest;Ministre;lundi 23 décembre 2024;"),
    });
    const corrections = writeCorrections({
      _updated: "2026-10-11",
      newMembers: [
        {
          firstName: "Léa",
          lastName: "Synctest",
          fullName: "Léa Synctest",
          mandate: {
            type: "MINISTRE",
            title: "Ministre",
            startDate: "2025-10-12",
            government: "Test Sync En Exercice",
          },
        },
      ],
    });
    const before = await db.politician.count();

    const { plan, applied } = await runReal(corrections);

    expect(applied.membersCreated).toBe(0);
    expect(await db.politician.count()).toBe(before);
    const unknown = plan.toVerify.filter((t) =>
      t.includes("personne inconnue, création manuelle requise")
    );
    expect(unknown.some((t) => t.includes("Karim Synctest"))).toBe(true);
    expect(unknown.some((t) => t.includes("Léa Synctest"))).toBe(true);
  });

  it("ne repasse pas en cours une fonction terminée sans date de fin", async () => {
    const pid = await person("stoppee", "Marc", "Synctest");
    const m = await db.mandate.create({
      data: {
        politicianId: pid,
        type: "MINISTRE",
        title: "Ministre",
        institution: "Gouvernement François Bayrou",
        startDate: parisMidnight("2024-12-23"),
        isCurrent: false,
        governmentData: { create: { governmentName: "Gouvernement François Bayrou" } },
      },
    });
    getTextMock.mockResolvedValue({
      data: csv("912;François Bayrou;M;Marc;Synctest;Ministre;lundi 23 décembre 2024;"),
    });

    const { plan } = await runReal(writeCorrections({ _updated: "2026-10-11" }));

    const after = await db.mandate.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.isCurrent).toBe(false);
    expect(after.endDate).toBeNull();
    expect(plan.toVerify.some((t) => t.includes("Marc Synctest"))).toBe(true);
  });

  it("ne réattribue jamais un identifiant source détenu par une autre personne", async () => {
    const owner = await person("proprio", "Nadia", "Synctest");
    const pid = await person("autre", "Olivier", "Synctest");
    await db.externalId.create({
      data: { politicianId: owner, source: "GOUVERNEMENT", externalId: "gouv-913-M-2024-12-23" },
    });
    getTextMock.mockResolvedValue({
      data: csv("913;François Bayrou;M;Olivier;Synctest;Ministre;lundi 23 décembre 2024;"),
    });

    const { plan, applied } = await runReal(writeCorrections({ _updated: "2026-10-11" }));

    expect(plan.conflicts).toHaveLength(1);
    expect(applied.mandatesCreated).toBe(1);
    const row = await db.externalId.findUniqueOrThrow({
      where: {
        source_externalId: { source: "GOUVERNEMENT", externalId: "gouv-913-M-2024-12-23" },
      },
    });
    expect(row.politicianId).toBe(owner);

    // Seconde ligne de défense : un plan qui force le rattachement est refusé à l'écriture.
    const forced = sync.emptyPlan();
    forced.links.push({
      kind: "externalId",
      label: "forcé",
      politicianId: pid,
      externalId: "gouv-913-M-2024-12-23",
    });
    const res = await sync.applySync(forced, db);
    expect(res.errors).toEqual([expect.stringContaining("conflit")]);
    const again = await db.externalId.findUniqueOrThrow({ where: { id: row.id } });
    expect(again.politicianId).toBe(owner);
  });
});
