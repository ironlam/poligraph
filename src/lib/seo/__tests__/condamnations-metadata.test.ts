import { describe, it, expect } from "vitest";
import { buildListTitle, buildDescription, buildCanonical } from "../condamnations-metadata";

describe("buildListTitle", () => {
  it("default (no filter)", () => {
    expect(buildListTitle({ certainty: "tous" })).toBe(
      "Responsables politiques français condamnés"
    );
  });

  it("with mandat=depute", () => {
    expect(buildListTitle({ mandat: "depute", certainty: "tous" })).toBe(
      "Députés français condamnés"
    );
  });

  it("with mandat=depute and certainty=etabli", () => {
    expect(buildListTitle({ mandat: "depute", certainty: "etabli" })).toBe(
      "Députés français condamnés définitivement"
    );
  });

  it("with party name", () => {
    expect(
      buildListTitle({
        certainty: "etabli",
        partyName: "Rassemblement National (RN)",
      })
    ).toBe(
      "Responsables politiques français condamnés définitivement — Rassemblement National (RN)"
    );
  });
});

describe("buildCanonical", () => {
  it("default returns /affaires/condamnations", () => {
    expect(buildCanonical({ certainty: "tous", view: "list" })).toBe("/affaires/condamnations");
  });

  it("includes mandat", () => {
    expect(buildCanonical({ mandat: "depute", certainty: "tous", view: "list" })).toBe(
      "/affaires/condamnations?mandat=depute"
    );
  });

  it("omits certainty=tous from canonical", () => {
    expect(buildCanonical({ mandat: "depute", certainty: "tous", view: "list" })).not.toContain(
      "certainty"
    );
  });

  it("includes view=stats", () => {
    expect(buildCanonical({ certainty: "tous", view: "stats" })).toBe(
      "/affaires/condamnations?view=stats"
    );
  });

  it("redirects parti-only canonical to /affaires/parti/[slug]", () => {
    expect(buildCanonical({ certainty: "tous", view: "list", partiSlug: "rn" })).toBe(
      "/affaires/parti/rn"
    );
  });

  it("keeps parti combined with mandat self-canonical", () => {
    expect(
      buildCanonical({
        mandat: "depute",
        certainty: "tous",
        view: "list",
        partiSlug: "rn",
      })
    ).toBe("/affaires/condamnations?mandat=depute&parti=rn");
  });

  it("excludes page from canonical", () => {
    expect(
      buildCanonical({
        certainty: "etabli",
        view: "list",
        page: 3,
      })
    ).toBe("/affaires/condamnations?certainty=etabli");
  });
});

describe("buildDescription", () => {
  it("default includes totals", () => {
    const d = buildDescription({
      certainty: "tous",
      view: "list",
      totalDefinitif: 64,
      totalPrononce: 32,
    });
    expect(d).toContain("64");
    expect(d).toContain("32");
    expect(d.length).toBeLessThanOrEqual(165);
  });

  it("stats view mentions taux", () => {
    const d = buildDescription({
      certainty: "tous",
      view: "stats",
      totalDefinitif: 64,
      totalPrononce: 32,
    });
    expect(d.toLowerCase()).toContain("taux");
  });
});
