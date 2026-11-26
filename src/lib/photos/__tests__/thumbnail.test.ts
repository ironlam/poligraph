import { describe, it, expect } from "vitest";
import { thumbnailPathnameFor, thumbnailUrlFor } from "../thumbnail";

const BLOB = "https://abc.public.blob.vercel-storage.com/politicians/x-portrait-Ab1.jpg";

describe("thumbnailUrlFor", () => {
  it("dérive la miniature d'une photo Blob", () => {
    expect(thumbnailUrlFor(BLOB)).toBe(`${BLOB}.thumb-192.webp`);
    expect(thumbnailPathnameFor(BLOB)).toBe("politicians/x-portrait-Ab1.jpg.thumb-192.webp");
  });

  it.each([
    null,
    undefined,
    "",
    "pas une url",
    "https://upload.wikimedia.org/wikipedia/commons/a/b/Foo.jpg",
    // Un hôte qui imite Blob sans en être un sous-domaine.
    "https://public.blob.vercel-storage.com.evil.example/x.jpg",
    "http://abc.public.blob.vercel-storage.com/politicians/x.jpg",
  ])("ignore %s", (url) => {
    expect(thumbnailUrlFor(url)).toBeNull();
    expect(thumbnailPathnameFor(url)).toBeNull();
  });

  it("ne dérive pas la miniature d'une miniature", () => {
    expect(thumbnailUrlFor(`${BLOB}.thumb-192.webp`)).toBeNull();
  });
});
