import { describe, it, expect, vi, beforeEach } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

import { fetchPublicPhoto, isPublicAddress } from "../fetch-public-photo";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000)]);
const PLACEHOLDER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(121),
]);

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

const ok = (body: Buffer) => new Response(new Uint8Array(body), { status: 200 });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("rejects %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "2a00:1450:4007:80e::200e"])("accepts %s", (ip) =>
    expect(isPublicAddress(ip)).toBe(true)
  );
});

describe("fetchPublicPhoto", () => {
  it("downloads a real photo", async () => {
    fetchMock.mockResolvedValue(ok(JPEG));

    const result = await fetchPublicPhoto("https://www.colombes.fr/maire.jpg");

    expect(result).toMatchObject({ kind: "photo", contentType: "image/jpeg" });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses plain HTTP", async () => {
    expect(await fetchPublicPhoto("http://www.colombes.fr/maire.jpg")).toMatchObject({
      kind: "forbidden",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a host that resolves to an internal address", async () => {
    lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    expect(await fetchPublicPhoto("https://metadata.example/latest")).toMatchObject({
      kind: "forbidden",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks every redirect hop, as Commons FilePath links redirect", async () => {
    fetchMock
      .mockResolvedValueOnce(redirect("https://upload.wikimedia.org/a/b/Maire.jpg"))
      .mockResolvedValueOnce(ok(JPEG));

    const result = await fetchPublicPhoto(
      "https://commons.wikimedia.org/wiki/Special:FilePath/Maire.jpg"
    );

    expect(result.kind).toBe("photo");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect towards an internal address", async () => {
    fetchMock.mockResolvedValueOnce(redirect("https://internal.example/x"));
    lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);

    expect(await fetchPublicPhoto("https://www.colombes.fr/maire.jpg")).toMatchObject({
      kind: "forbidden",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags a placeholder as not a photo", async () => {
    fetchMock.mockResolvedValue(ok(PLACEHOLDER));

    expect(await fetchPublicPhoto("https://archive.nossenateurs.fr/x/120")).toEqual({
      kind: "not-a-photo",
    });
  });

  it("reports an error status or a network failure as unreachable", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await fetchPublicPhoto("https://www.nosdeputes.fr/x/120")).toEqual({
      kind: "unreachable",
    });

    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect(await fetchPublicPhoto("https://www.nosdeputes.fr/x/120")).toEqual({
      kind: "unreachable",
    });
  });
});
