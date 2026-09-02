import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("configuration des images distantes", () => {
  it("autorise la source de repli NosSénateurs réellement produite par le synchroniseur", () => {
    const patterns = nextConfig.images?.remotePatterns ?? [];

    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocol: "https", hostname: "archive.nossenateurs.fr" }),
      ])
    );
  });
});
