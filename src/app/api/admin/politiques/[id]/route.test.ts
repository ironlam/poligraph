import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  txUpdate: vi.fn(async (args: { data: Record<string, unknown> }) => ({
    id: "pol-1",
    slug: "jeanne-martin",
    fullName: "Jeanne Martin",
    ...args.data,
  })),
  fetchPublicPhoto: vi.fn(),
  uploadSourcePhotoCopy: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    politician: { findUnique: h.findUnique },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({ candidacy: { findMany: async () => [] }, politician: { update: h.txUpdate } }),
    externalId: { deleteMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/api/with-admin-auth", () => ({
  withAdminAuth: (fn: (req: unknown, ctx: unknown) => unknown) => fn,
}));
vi.mock("@/lib/security", () => ({
  withValidation:
    (_schema: unknown, fn: (req: unknown, ctx: unknown, body: unknown) => unknown) =>
    async (req: { json: () => Promise<unknown> }, ctx: unknown) =>
      fn(req, ctx, await req.json()),
  getRequestMeta: () => ({ ip: "127.0.0.1", userAgent: "test" }),
}));
vi.mock("@/lib/cache", () => ({ invalidateEntity: vi.fn() }));
vi.mock("@/lib/politicians/profile-snapshot/request", () => ({ requestProfileRefresh: vi.fn() }));
vi.mock("@/lib/presidentielle/candidacy-cache", () => ({
  invalidatePresidentialCandidacyTags: vi.fn(),
}));
vi.mock("@/lib/presidentielle/search-sync", () => ({
  syncPresidentialSearchDocumentsForCandidacy: vi.fn(),
}));
vi.mock("@/lib/measures/lock", () => ({ lockMeasureCandidacy: vi.fn() }));
vi.mock("@/lib/api/fetch-public-photo", () => ({ fetchPublicPhoto: h.fetchPublicPhoto }));
vi.mock("@/lib/photos/blob", () => ({ uploadSourcePhotoCopy: h.uploadSourcePhotoCopy }));

import { PUT } from "./route";

const OLD_PHOTO = "https://www.senat.fr/senimg/martin.jpg";
const NEW_PHOTO = "https://www.colombes.fr/maire.jpg";
const OLD_BLOB = "https://abc.public.blob.vercel-storage.com/politicians/pol-1";
const NEW_BLOB = "https://abc.public.blob.vercel-storage.com/politicians/pol-1-Xy7";

async function save(photoUrl: string | null) {
  const request = new NextRequest("https://poligraph.fr/api/admin/politiques/pol-1", {
    method: "PUT",
    body: JSON.stringify({
      slug: "jeanne-martin",
      firstName: "Jeanne",
      lastName: "Martin",
      photoUrl,
      photoSource: "manual",
      externalIds: [],
    }),
  });
  return PUT(request, { params: Promise.resolve({ id: "pol-1" }) });
}

const written = () => h.txUpdate.mock.calls[0]![0].data;

beforeEach(() => {
  vi.clearAllMocks();
  h.findUnique.mockResolvedValue({
    id: "pol-1",
    slug: "jeanne-martin",
    photoUrl: OLD_PHOTO,
    blobPhotoUrl: OLD_BLOB,
    publicationStatus: "PUBLISHED",
    externalIds: [],
  });
  h.uploadSourcePhotoCopy.mockResolvedValue(NEW_BLOB);
});

/**
 * The avatar prefers the Blob copy. Changing `photoUrl` alone left the copy of
 * the previous photo in place, so the new photo never showed.
 */
describe("PUT /api/admin/politiques/[id] : photo", () => {
  it("copies a new photo to Blob along with its URL", async () => {
    const buffer = Buffer.from("jpeg");
    h.fetchPublicPhoto.mockResolvedValue({ kind: "photo", buffer, contentType: "image/jpeg" });

    const response = await save(NEW_PHOTO);

    expect(response.status).toBe(200);
    expect(h.uploadSourcePhotoCopy).toHaveBeenCalledWith("pol-1", buffer, "image/jpeg");
    expect(written()).toMatchObject({ photoUrl: NEW_PHOTO, blobPhotoUrl: NEW_BLOB });
  });

  it.each([
    { fetched: { kind: "not-a-photo" }, cas: "une page web ou une image de remplacement" },
    { fetched: { kind: "forbidden", reason: "interne" }, cas: "une adresse interne" },
  ])("refuses $cas without writing anything", async ({ fetched }) => {
    h.fetchPublicPhoto.mockResolvedValue(fetched);

    const response = await save(NEW_PHOTO);

    expect(response.status).toBe(400);
    expect(h.txUpdate).not.toHaveBeenCalled();
    expect(h.uploadSourcePhotoCopy).not.toHaveBeenCalled();
  });

  it("records an unreachable photo without a copy, as the sync does", async () => {
    h.fetchPublicPhoto.mockResolvedValue({ kind: "unreachable" });

    const response = await save(NEW_PHOTO);

    expect(response.status).toBe(200);
    expect(written()).toMatchObject({ photoUrl: NEW_PHOTO, blobPhotoUrl: null });
  });

  it("leaves the copy alone when the photo is unchanged", async () => {
    await save(OLD_PHOTO);

    expect(h.fetchPublicPhoto).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ photoUrl: OLD_PHOTO, blobPhotoUrl: OLD_BLOB });
  });

  it("clears the copy when the photo is removed", async () => {
    await save(null);

    expect(h.fetchPublicPhoto).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ photoUrl: null, blobPhotoUrl: null });
  });
});
