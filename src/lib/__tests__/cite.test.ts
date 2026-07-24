import { describe, it, expect, beforeEach } from "vitest";
import { citeAnchorId, buildAnchorUrl, scrutinPermalink } from "@/lib/cite";
import { SITE_URL } from "@/config/site";

describe("citeAnchorId", () => {
  it("prefixe les ids par type", () => {
    expect(citeAnchorId.affair("abc")).toBe("affair-abc");
    expect(citeAnchorId.declaration("def")).toBe("declaration-def");
  });
});

describe("scrutinPermalink", () => {
  it("construit l'URL absolue du scrutin", () => {
    expect(scrutinPermalink("4521")).toBe(`${SITE_URL}/parlement/votes/4521`);
  });
});

describe("buildAnchorUrl", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/politiques/jean-dupont");
  });

  it("ne garde que le param tab et ajoute l'ancre", () => {
    window.history.replaceState({}, "", "/politiques/jean-dupont?tab=affaires&utm_source=z");
    expect(buildAnchorUrl("affair-1")).toBe(
      `${SITE_URL}/politiques/jean-dupont?tab=affaires#affair-1`
    );
  });

  it("omet la query quand il n'y a pas de tab", () => {
    window.history.replaceState({}, "", "/politiques/jean-dupont");
    expect(buildAnchorUrl("declaration-9")).toBe(
      `${SITE_URL}/politiques/jean-dupont#declaration-9`
    );
  });
});
