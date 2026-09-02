import { describe, expect, it } from "vitest";
import { getLegacyMeasureId, getPresidentialMeasurePath } from "../measure-route";

describe("presidential measure routes", () => {
  it("détecte une ancienne URL par CUID", () => {
    expect(
      getLegacyMeasureId("/elections/presidentielle-2027/mesures/cmsisv2wc000pi3v503tjvmjv")
    ).toBe("cmsisv2wc000pi3v503tjvmjv");
  });

  it("laisse passer un slug éditorial", () => {
    expect(
      getLegacyMeasureId("/elections/presidentielle-2027/mesures/gabriel-attal-creer-des-logements")
    ).toBeNull();
  });

  it("construit le chemin canonique", () => {
    expect(getPresidentialMeasurePath("gabriel-attal-creer-des-logements")).toBe(
      "/elections/presidentielle-2027/mesures/gabriel-attal-creer-des-logements"
    );
  });
});
