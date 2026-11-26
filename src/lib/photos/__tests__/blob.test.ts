import { describe, it, expect, vi, beforeEach } from "vitest";

const del = vi.fn();
const put = vi.fn();

vi.mock("@vercel/blob", () => ({
  del: (...args: unknown[]) => del(...args),
  put: (...args: unknown[]) => put(...args),
}));

const { uploadCroppedPortrait, deleteCroppedPortrait, uploadSourcePhotoCopy, writeThumbnail } =
  await import("../blob");
const sharp = (await import("sharp")).default;

/** A real 600x400 JPEG, so the thumbnail goes through sharp for real. */
async function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: "#336699" } })
    .jpeg()
    .toBuffer();
}

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
    // The avatar thumbnail goes with it.
    expect(del.mock.calls[0]![0]).toEqual([
      `${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg`,
      `${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg.thumb-192.webp`,
    ]);
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

describe("uploadSourcePhotoCopy", () => {
  it("uploads a raw copy to a fresh pathname, with its own content type", async () => {
    put.mockResolvedValue({ url: `${BLOB_HOST}/politicians/abc-Zq1` });

    const url = await uploadSourcePhotoCopy("abc", Buffer.from("png"), "image/png");

    expect(url).toBe(`${BLOB_HOST}/politicians/abc-Zq1`);
    const [pathname, , options] = put.mock.calls[0]! as [string, unknown, Record<string, unknown>];
    expect(pathname).toBe("politicians/abc");
    expect(options).toMatchObject({
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
    });
  });
});

describe("writeThumbnail", () => {
  it("écrit une miniature WebP carrée à côté de la photo", async () => {
    const photo = `${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg`;
    await expect(writeThumbnail(photo, await jpeg())).resolves.toBe(true);

    const [pathname, body, options] = put.mock.calls[0]! as [
      string,
      Buffer,
      Record<string, unknown>,
    ];
    expect(pathname).toBe("politicians/abc-portrait-Xy7.jpg.thumb-192.webp");
    expect(options).toMatchObject({
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    const meta = await sharp(body).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 192, height: 192 });
  });

  it("est écrite à chaque envoi de photo", async () => {
    put.mockResolvedValueOnce({ url: `${BLOB_HOST}/politicians/abc-Zq1` });
    await uploadSourcePhotoCopy("abc", await jpeg(), "image/jpeg");
    expect(put.mock.calls.map((call) => call[0])).toEqual([
      "politicians/abc",
      "politicians/abc-Zq1.thumb-192.webp",
    ]);
  });

  it("n'interrompt pas l'envoi quand l'image est illisible", async () => {
    await expect(uploadCroppedPortrait("abc", Buffer.from("pas une image"))).resolves.toBe(
      `${BLOB_HOST}/politicians/abc-portrait-Xy7.jpg`
    );
    expect(put).toHaveBeenCalledTimes(1);
  });

  it("ignore une photo qui n'est pas sur Blob", async () => {
    await expect(writeThumbnail("https://upload.wikimedia.org/x.jpg", await jpeg())).resolves.toBe(
      false
    );
    expect(put).not.toHaveBeenCalled();
  });
});
