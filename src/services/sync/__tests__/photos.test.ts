import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
  getBuffer: vi.fn(),
  get: vi.fn(),
  uploadSourcePhotoCopy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { politician: { findMany: h.findMany, update: h.update } },
}));
vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    getBuffer = h.getBuffer;
    get = h.get;
  },
}));
vi.mock("@/lib/photos/blob", () => ({ uploadSourcePhotoCopy: h.uploadSourcePhotoCopy }));

import { syncPhotos } from "../photos";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const photo = (size = 5000) => Buffer.concat([Buffer.from(PNG), Buffer.alloc(size - PNG.length)]);
const NOSSENATEURS_PLACEHOLDER = photo(129);

const CURRENT = "https://archive.nossenateurs.fr/senateur/photo/jeanne-martin/120";
const BLOB_URL = "https://abc.public.blob.vercel-storage.com/politicians/pol-1-Xy7";

function politician(overrides: Record<string, unknown> = {}) {
  return {
    id: "pol-1",
    slug: "jeanne-martin",
    firstName: "Jeanne",
    lastName: "Martin",
    fullName: "Jeanne Martin",
    photoUrl: CURRENT,
    photoSource: "nossenateurs",
    blobPhotoUrl: null,
    externalIds: [{ source: "WIKIDATA", externalId: "Q1" }],
    mandates: [],
    ...overrides,
  };
}

/** Wikidata offers one candidate; each URL answers what `responses` says. */
/** What the European Parliament firewall answers a non-browser client. */
const WAF_CHALLENGE = { status: 202, data: Buffer.alloc(0) };

function sources(responses: Record<string, Buffer | Error | typeof WAF_CHALLENGE>) {
  h.get.mockResolvedValue({
    ok: true,
    status: 200,
    data: { claims: { P18: [{ mainsnak: { datavalue: { value: "Jeanne Martin.jpg" } } }] } },
  });
  h.getBuffer.mockImplementation(async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    const answer = key ? responses[key]! : new Error(`404 ${url}`);
    if (answer instanceof Error) throw answer;
    if (!Buffer.isBuffer(answer)) return { ok: true, ...answer };
    return { ok: true, status: 200, data: answer };
  });
}

const lastUpdate = () => h.update.mock.calls.at(-1)![0];

beforeEach(() => {
  vi.clearAllMocks();
  h.uploadSourcePhotoCopy.mockResolvedValue(BLOB_URL);
});

describe("syncPhotos --validate", () => {
  it("copies the replacement photo to Blob instead of clearing the copy", async () => {
    h.findMany.mockResolvedValue([politician()]);
    sources({ nossenateurs: NOSSENATEURS_PLACEHOLDER, "Jeanne_Martin.jpg": photo() });

    await syncPhotos({ validateExisting: true });

    expect(lastUpdate().data).toMatchObject({
      photoSource: "wikidata",
      blobPhotoUrl: BLOB_URL,
    });
    expect(lastUpdate().data.photoUrl).toContain("Jeanne_Martin.jpg");
  });

  it("removes a placeholder photo when no other source has a real one", async () => {
    h.findMany.mockResolvedValue([politician()]);
    sources({ nossenateurs: NOSSENATEURS_PLACEHOLDER });

    await syncPhotos({ validateExisting: true });

    expect(lastUpdate().data).toMatchObject({
      photoUrl: null,
      photoSource: null,
      blobPhotoUrl: null,
    });
  });

  it("keeps the photo when its source is only unreachable", async () => {
    h.findMany.mockResolvedValue([politician()]);
    sources({ nossenateurs: new Error("timeout") });

    await syncPhotos({ validateExisting: true });

    expect(lastUpdate().data).not.toHaveProperty("photoUrl");
    expect(lastUpdate().data).toHaveProperty("photoCheckedAt");
  });

  it("creates the missing Blob copy of a valid photo", async () => {
    h.findMany.mockResolvedValue([politician()]);
    sources({ nossenateurs: photo() });

    await syncPhotos({ validateExisting: true });

    expect(h.uploadSourcePhotoCopy).toHaveBeenCalledWith("pol-1", expect.any(Buffer), "image/png");
    expect(lastUpdate().data).toMatchObject({ blobPhotoUrl: BLOB_URL });
    expect(lastUpdate().data).not.toHaveProperty("photoUrl");
  });

  it("still records the new photo when the Blob upload fails", async () => {
    h.findMany.mockResolvedValue([politician()]);
    sources({ nossenateurs: NOSSENATEURS_PLACEHOLDER, "Jeanne_Martin.jpg": photo() });
    h.uploadSourcePhotoCopy.mockRejectedValue(new Error("no token"));

    await syncPhotos({ validateExisting: true });

    expect(lastUpdate().data).toMatchObject({ photoSource: "wikidata", blobPhotoUrl: null });
  });

  it("replaces a placeholder even with a lower-priority source", async () => {
    h.findMany.mockResolvedValue([
      politician({ photoUrl: "https://www.senat.fr/senimg/martin.jpg", photoSource: "senat" }),
    ]);
    sources({ "senat.fr": NOSSENATEURS_PLACEHOLDER, "Jeanne_Martin.jpg": photo() });

    await syncPhotos({ validateExisting: true });

    expect(lastUpdate().data).toMatchObject({ photoSource: "wikidata", blobPhotoUrl: BLOB_URL });
  });

  // Measured on 2026-10-07: every European Parliament photo answered 202 with an
  // empty body, was taken for a placeholder, and 81 official portraits were
  // replaced by a Wikidata photo or removed.
  it("never treats a 202 with an empty body as a placeholder", async () => {
    h.findMany.mockResolvedValue([
      politician({
        photoUrl: "https://www.europarl.europa.eu/mepphoto/1.jpg",
        photoSource: "parlement-europeen",
        blobPhotoUrl: "https://abc.public.blob.vercel-storage.com/politicians/pol-1",
      }),
    ]);
    sources({ europarl: WAF_CHALLENGE, "Jeanne_Martin.jpg": photo() });

    await syncPhotos({ validateExisting: true });

    for (const [args] of h.update.mock.calls) {
      expect(args.data).not.toHaveProperty("photoUrl");
      expect(args.data).not.toHaveProperty("blobPhotoUrl");
    }
  });
});

describe("syncPhotos : sélection", () => {
  const where = () => h.findMany.mock.calls[0]![0].where;

  beforeEach(() => h.findMany.mockResolvedValue([]));

  // A validate run used to walk all 49 667 politicians, 47 600 of them without a
  // photo, and query Wikidata for each: 3 h 24 on 2026-10-07. Finding missing
  // photos is the job of the default mode.
  it("--validate only reads politicians who have a photo", async () => {
    await syncPhotos({ validateExisting: true });

    expect(where()).toEqual({ AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }] });
  });

  it("without --validate, keeps looking for missing photos", async () => {
    await syncPhotos();

    expect(where()).toEqual({ OR: [{ photoUrl: null }, { photoUrl: "" }] });
  });

  it("--slug targets the named politicians, with or without a photo", async () => {
    await syncPhotos({ validateExisting: true, slugs: ["jordan-bardella", "bally-bagayoko"] });

    expect(where()).toEqual({ slug: { in: ["jordan-bardella", "bally-bagayoko"] } });
  });
});
