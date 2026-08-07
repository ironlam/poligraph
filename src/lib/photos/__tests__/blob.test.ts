import { describe, it, expect, vi, beforeEach } from "vitest";

const del = vi.fn();
const put = vi.fn();

vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => del(...args),
  put: (...args: unknown[]) => put(...args),
}));

const { uploadCroppedPortrait, deleteCroppedPortrait } = await import("../blob");

const BLOB_HOST = "https://example.public.blob.vercel-storage.com";

beforeEach(() => {
  del.mockReset();
  put.mockReset();
  put.mockResolvedValue({ url: `${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg` });
});

describe("uploadCroppedPortrait", () => {
  it("uploads to a fresh pathname rather than overwriting", async () => {
    // Blob serves portraits with a thirty-day max-age and the URL is the only cache
    // key. Overwriting a fixed pathname shipped a corrected framing that nobody saw.
    await uploadCroppedPortrait("abc", Buffer.from("jpeg"));

    expect(put).toHaveBeenCalledTimes(1);
    const options = put.mock.calls[0]![2] as Record<string, unknown>;
    expect(options.addRandomSuffix).toBe(true);
    expect(options.allowOverwrite).toBeUndefined();
  });

  it("keeps the -portrait marker, which is what identifies a derived image", async () => {
    await uploadCroppedPortrait("abc", Buffer.from("jpeg"));
    expect(put.mock.calls[0]![0]).toBe("politicians/abc-portrait");
  });
});

describe("deleteCroppedPortrait", () => {
  it("deletes a portrait we uploaded", async () => {
    await expect(
      deleteCroppedPortrait(`${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg`)
    ).resolves.toBe(true);
    expect(del).toHaveBeenCalledTimes(1);
  });

  it.each([
    // The raw cached copy the image proxy writes, still served by other code.
    `${BLOB_HOST}/politicians/abc`,
    // An upstream URL that is not ours at all.
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/500px-Foo.jpg",
    "",
  ])("refuses to delete %s", async (url) => {
    await expect(deleteCroppedPortrait(url)).resolves.toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("refuses a null or undefined url", async () => {
    await expect(deleteCroppedPortrait(null)).resolves.toBe(false);
    await expect(deleteCroppedPortrait(undefined)).resolves.toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it("swallows a deletion failure: an orphan must not abort a run", async () => {
    del.mockRejectedValueOnce(new Error("blob store unreachable"));
    await expect(
      deleteCroppedPortrait(`${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg`)
    ).resolves.toBe(false);
  });
});
