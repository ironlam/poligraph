// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { measurePostgresDriverOperation } from "@/test/postgres-driver-observer";
import type { PoliticianProfileDocument } from "@/lib/politicians/profile-snapshot/document";

const send = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());

// The read path must never reach the Inngest client nor invalidate a cache tag.
vi.mock("@/inngest/client", () => ({ inngest: { send } }));
vi.mock("next/cache", () => ({
  revalidateTag,
  updateTag: revalidateTag,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));

let db: typeof import("@/lib/db").db;
let readProfileSnapshot: typeof import("../politician-profile").readProfileSnapshot;
let writeProfileSnapshot: typeof import("@/lib/politicians/profile-snapshot/store").writeProfileSnapshot;
let buildPoliticianProfileDocument: typeof import("@/lib/politicians/profile-snapshot/build").buildPoliticianProfileDocument;
let CURRENT_VERSION: number;

const SLUG = "profile-read-test";
const SLUG_DEPUTE = `${SLUG}-depute`;

describeIfDisposableDb("lecture du document de fiche politicien", () => {
  let id: string;
  let doc: PoliticianProfileDocument;

  async function seedSnapshot(version = CURRENT_VERSION) {
    await writeProfileSnapshot({ politicianId: id, document: doc, startedAt: new Date() });
    await db.politicianProfileSnapshot.update({ where: { politicianId: id }, data: { version } });
  }
  const storedVersion = async () =>
    (await db.politicianProfileSnapshot.findUnique({ where: { politicianId: id } }))?.version;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ readProfileSnapshot } = await import("../politician-profile"));
    ({ writeProfileSnapshot } = await import("@/lib/politicians/profile-snapshot/store"));
    ({ buildPoliticianProfileDocument } = await import("@/lib/politicians/profile-snapshot/build"));
    ({ PROFILE_SNAPSHOT_VERSION: CURRENT_VERSION } =
      await import("@/lib/politicians/profile-snapshot/document"));

    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    const depute = await db.politician.create({
      data: {
        slug: SLUG_DEPUTE,
        firstName: "Camille",
        lastName: "Fictive",
        fullName: "Camille Fictive",
        publicationStatus: "PUBLISHED",
        mandates: {
          create: {
            type: "DEPUTE",
            title: "Député de la 1re circonscription de test",
            institution: "Assemblée nationale",
            startDate: new Date("2024-07-07T00:00:00.000Z"),
            isCurrent: true,
          },
        },
      },
    });
    id = depute.id;
    const built = await buildPoliticianProfileDocument({ id });
    if (!built) throw new Error("fixture: le document du député devrait se construire");
    doc = built;
  });

  beforeEach(async () => {
    await db.politician.update({
      where: { id },
      data: { slug: SLUG_DEPUTE, publicationStatus: "PUBLISHED" },
    });
    await db.politicianProfileSnapshot.deleteMany({ where: { politicianId: id } });
    send.mockClear();
    revalidateTag.mockClear();
  });

  afterAll(async () => {
    await db?.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
  });

  it("lit un document existant en une seule requête", async () => {
    await seedSnapshot();
    const m = await measurePostgresDriverOperation(() => readProfileSnapshot(SLUG_DEPUTE));
    expect(m.metrics.queryCount).toBe(1);
    expect(m.result?.identity.id).toBe(id);
  });

  it("répond null pour un politicien dépublié qui a encore un document", async () => {
    await seedSnapshot();
    await db.politician.update({ where: { id }, data: { publicationStatus: "DRAFT" } });
    expect(await readProfileSnapshot(SLUG_DEPUTE)).toBeNull();
    expect(await db.politicianProfileSnapshot.count({ where: { politicianId: id } })).toBe(1);
  });

  it("répond null pour un slug inconnu, sans rien écrire", async () => {
    expect(await readProfileSnapshot(`${SLUG}-inconnu`)).toBeNull();
    expect(await db.politicianProfileSnapshot.count({ where: { politicianId: id } })).toBe(0);
  });

  it("construit et écrit quand le document manque, sans event ni invalidation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect((await readProfileSnapshot(SLUG_DEPUTE))?.identity.id).toBe(id);
      expect(await storedVersion()).toBe(CURRENT_VERSION);
      expect(warn).toHaveBeenCalledWith("[profile-snapshot] fallback", {
        slug: SLUG_DEPUTE,
        cause: "missing",
      });
      expect(send).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("construit et écrit sans event ni invalidation quand la version est périmée", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seedSnapshot(CURRENT_VERSION - 1);
      expect(await readProfileSnapshot(SLUG_DEPUTE)).not.toBeNull();
      expect(await storedVersion()).toBe(CURRENT_VERSION);
      expect(warn).toHaveBeenCalledWith("[profile-snapshot] fallback", {
        slug: SLUG_DEPUTE,
        cause: "outdated-version",
      });
      expect(send).not.toHaveBeenCalled();
      expect(revalidateTag).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("ne reconstruit pas quand le document est à la version courante", async () => {
    await seedSnapshot();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await readProfileSnapshot(SLUG_DEPUTE);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("trouve le document par le nouveau slug après un renommage", async () => {
    await seedSnapshot();
    await db.politician.update({ where: { id }, data: { slug: `${SLUG}-nouveau` } });
    expect(await readProfileSnapshot(`${SLUG}-nouveau`)).not.toBeNull();
    expect(await readProfileSnapshot(SLUG_DEPUTE)).toBeNull();
  });
});
