import { describe, it, expect, vi, afterEach } from "vitest";
import { shareOrCopy } from "@/lib/share";

const PAGE = {
  title: "Gouvernement Lecornu II",
  url: "https://poligraph.fr/politiques/gouvernements/x",
};

function stubNavigator(overrides: { share?: unknown; writeText?: unknown }) {
  vi.stubGlobal("navigator", {
    share: overrides.share,
    clipboard: overrides.writeText ? { writeText: overrides.writeText } : undefined,
  });
}

describe("shareOrCopy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("utilise le partage natif quand il existe", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn();
    stubNavigator({ share, writeText });

    await expect(shareOrCopy(PAGE)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(PAGE);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("ne copie pas le lien quand l'utilisateur annule la feuille de partage", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError"));
    const writeText = vi.fn();
    stubNavigator({ share, writeText });

    await expect(shareOrCopy(PAGE)).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copie le lien quand le partage natif échoue pour une autre raison", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share, writeText });

    await expect(shareOrCopy(PAGE)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(PAGE.url);
  });

  it("copie le lien quand le partage natif n'existe pas", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ writeText });

    await expect(shareOrCopy(PAGE)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(PAGE.url);
  });

  it("signale l'échec quand ni partage ni presse-papier ne sont disponibles", async () => {
    stubNavigator({});

    await expect(shareOrCopy(PAGE)).resolves.toBe("failed");
  });

  it("signale l'échec quand la copie est refusée", async () => {
    stubNavigator({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    await expect(shareOrCopy(PAGE)).resolves.toBe("failed");
  });
});
