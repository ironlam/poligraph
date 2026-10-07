import { describe, it, expect } from "vitest";
import { identifyPhoto, MIN_PHOTO_BYTES } from "../source-photo";

function withHeader(header: number[] | string, size = 5000): Buffer {
  const head = typeof header === "string" ? Buffer.from(header, "latin1") : Buffer.from(header);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("identifyPhoto", () => {
  it("recognises JPEG, PNG, GIF and WebP by their signature", () => {
    expect(identifyPhoto(withHeader([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      contentType: "image/jpeg",
    });
    expect(identifyPhoto(withHeader(PNG))).toEqual({ contentType: "image/png" });
    expect(identifyPhoto(withHeader("GIF89a"))).toEqual({ contentType: "image/gif" });
    expect(identifyPhoto(withHeader("RIFF\0\0\0\0WEBPVP8 "))).toEqual({
      contentType: "image/webp",
    });
  });

  // NosSénateurs answers a missing portrait with a 200 and a black 82x120 PNG of
  // 129 bytes. The smallest real portrait measured in the Blob store is 4676 bytes.
  it("rejects a placeholder image below the size floor", () => {
    expect(identifyPhoto(withHeader(PNG, 129))).toBeNull();
    expect(identifyPhoto(withHeader(PNG, MIN_PHOTO_BYTES - 1))).toBeNull();
    expect(identifyPhoto(withHeader(PNG, MIN_PHOTO_BYTES))).toEqual({ contentType: "image/png" });
  });

  it("rejects an HTML page served with a 200", () => {
    expect(identifyPhoto(withHeader("<!DOCTYPE html><html>"))).toBeNull();
  });
});
