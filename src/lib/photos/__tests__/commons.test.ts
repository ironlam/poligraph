import { describe, it, expect } from "vitest";
import {
  COMMONS_THUMBNAIL_WIDTHS,
  commonsThumbnailUrl,
  isCommonsThumbnailUrl,
  parseCommonsThumbnailWidth,
  rewriteCommonsThumbnailWidth,
  roundUpToAllowedWidth,
} from "../commons";

describe("roundUpToAllowedWidth", () => {
  it("keeps a width that is already allowed", () => {
    expect(roundUpToAllowedWidth(500)).toBe(500);
    expect(roundUpToAllowedWidth(960)).toBe(960);
  });

  it("rounds up to the next allowed bucket", () => {
    // 400 is the width that broke every stored URL.
    expect(roundUpToAllowedWidth(400)).toBe(500);
    expect(roundUpToAllowedWidth(121)).toBe(250);
    expect(roundUpToAllowedWidth(1)).toBe(20);
  });

  it("caps at the largest allowed bucket", () => {
    expect(roundUpToAllowedWidth(99999)).toBe(3840);
  });

  it("never returns a width outside the official list", () => {
    for (let width = 1; width <= 4000; width += 7) {
      expect(COMMONS_THUMBNAIL_WIDTHS).toContain(roundUpToAllowedWidth(width));
    }
  });
});

describe("commonsThumbnailUrl", () => {
  it("builds the MD5-sharded thumbnail path", () => {
    // Hash checked against the live file served by upload.wikimedia.org.
    expect(commonsThumbnailUrl("François ASSELINEAU.jpg", 500)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/" +
        "Fran%C3%A7ois_ASSELINEAU.jpg/500px-Fran%C3%A7ois_ASSELINEAU.jpg"
    );
  });

  it("accepts a File: prefix and spaces", () => {
    const url = commonsThumbnailUrl("File:Roussel Fabien 1.jpg", 500);
    expect(url).toContain("/Roussel_Fabien_1.jpg/500px-Roussel_Fabien_1.jpg");
    expect(url).not.toContain("File%3A");
  });

  it("coerces a forbidden width to an allowed one", () => {
    expect(commonsThumbnailUrl("Roussel Fabien 1.jpg", 400)).toContain("/500px-");
  });

  it("appends .png for SVG sources, as Commons does", () => {
    const url = commonsThumbnailUrl("Blason ville fr.svg", 250);
    expect(url).toContain("/250px-Blason_ville_fr.svg.png");
  });
});

describe("parseCommonsThumbnailWidth", () => {
  it("reads the width out of a thumbnail URL", () => {
    expect(
      parseCommonsThumbnailWidth(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/David-amiel.jpg/400px-David-amiel.jpg"
      )
    ).toBe(400);
  });

  it("returns null for an original-file URL", () => {
    expect(
      parseCommonsThumbnailWidth(
        "https://upload.wikimedia.org/wikipedia/commons/9/9e/David-amiel.jpg"
      )
    ).toBeNull();
  });
});

describe("isCommonsThumbnailUrl", () => {
  it("recognises upload.wikimedia.org thumbnails", () => {
    expect(
      isCommonsThumbnailUrl(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/David-amiel.jpg/400px-David-amiel.jpg"
      )
    ).toBe(true);
  });

  it("rejects other hosts and non-thumbnails", () => {
    expect(isCommonsThumbnailUrl("https://www.senat.fr/senimg/12345.jpg")).toBe(false);
    expect(
      isCommonsThumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/9/9e/David-amiel.jpg")
    ).toBe(false);
    expect(isCommonsThumbnailUrl(null)).toBe(false);
  });
});

describe("rewriteCommonsThumbnailWidth", () => {
  const broken =
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/" +
    "%C3%89douard_Philippe_2019_(cropped).jpg/400px-%C3%89douard_Philippe_2019_(cropped).jpg";

  it("moves a forbidden width to the next allowed one", () => {
    expect(rewriteCommonsThumbnailWidth(broken, 400)).toBe(broken.replace("400px-", "500px-"));
  });

  it("rewrites only the width segment, not the filename", () => {
    const url =
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/" +
      "20241008-P1120704_Jeanbrun_Vincent_Wikipedia.jpg/" +
      "400px-20241008-P1120704_Jeanbrun_Vincent_Wikipedia.jpg";
    const fixed = rewriteCommonsThumbnailWidth(url, 500);
    expect(fixed).toContain("/500px-20241008-P1120704_Jeanbrun_Vincent_Wikipedia.jpg");
    // The "400px-" token must not have eaten into the numeric filename prefix.
    expect(fixed).toContain("/20241008-P1120704_Jeanbrun_Vincent_Wikipedia.jpg/");
  });

  it("leaves a non-Commons URL untouched", () => {
    const senat = "https://www.senat.fr/senimg/12345.jpg";
    expect(rewriteCommonsThumbnailWidth(senat, 500)).toBe(senat);
  });

  it("is idempotent", () => {
    const once = rewriteCommonsThumbnailWidth(broken, 500);
    expect(rewriteCommonsThumbnailWidth(once, 500)).toBe(once);
  });
});
