import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadOgPortrait } from "../og-utils";

function imageResponse(contentType: string, bytes: Uint8Array = new Uint8Array([1, 2, 3])) {
  return {
    ok: true,
    headers: new Headers({ "content-type": contentType }),
    arrayBuffer: async () => bytes.buffer.slice(0),
  } as unknown as Response;
}

describe("loadOgPortrait", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renvoie une data URI pour un format que Satori sait décoder", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse("image/jpeg"));

    await expect(loadOgPortrait("https://blob.test/portrait.jpg")).resolves.toBe(
      `data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`
    );
  });

  it("tolère un content-type paramétré", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse("image/PNG; charset=binary"));

    await expect(loadOgPortrait("https://blob.test/portrait.png")).resolves.toContain(
      "data:image/png;base64,"
    );
  });

  it("passe une source http en https plutôt que de la refuser", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse("image/jpeg"));

    await loadOgPortrait("http://source.test/portrait.jpg");

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://source.test/portrait.jpg");
  });

  it("refuse un format que le rendu ne sait pas décoder", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse("image/webp"));

    await expect(loadOgPortrait("https://blob.test/portrait.webp")).resolves.toBeNull();
  });

  it("refuse une réponse en erreur, vide ou hors gabarit", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response);
    await expect(loadOgPortrait("https://blob.test/404.jpg")).resolves.toBeNull();

    vi.mocked(fetch).mockResolvedValue(imageResponse("image/jpeg", new Uint8Array(0)));
    await expect(loadOgPortrait("https://blob.test/empty.jpg")).resolves.toBeNull();

    vi.mocked(fetch).mockResolvedValue(imageResponse("image/jpeg", new Uint8Array(5_000_001)));
    await expect(loadOgPortrait("https://blob.test/huge.jpg")).resolves.toBeNull();
  });

  it("avale l'échec réseau : une photo indisponible n'est pas une image cassée", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("timeout"));

    await expect(loadOgPortrait("https://source.test/portrait.jpg")).resolves.toBeNull();
  });

  it("ne tente rien sans URL exploitable", async () => {
    await expect(loadOgPortrait(null)).resolves.toBeNull();
    await expect(loadOgPortrait("")).resolves.toBeNull();
    await expect(loadOgPortrait("/photos/local.jpg")).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
