import { describe, expect, it } from "vitest";
import { MAX_MEMBERS_PAGE, parseCompositionDate, parseMembersQuery } from "../params";

const coverage = { from: "2017-05-17", to: "2026-09-30" };
const slugs = new Set(["philippe-1", "lecornu-2"]);

describe("parseCompositionDate", () => {
  it("accepte un jour calendaire valide", () => {
    expect(parseCompositionDate("2024-02-29")).toBe("2024-02-29");
  });

  it("refuse un jour qui n'existe pas", () => {
    expect(parseCompositionDate("2026-02-30")).toBeNull();
    expect(parseCompositionDate("2023-02-29")).toBeNull();
    expect(parseCompositionDate("2026-13-01")).toBeNull();
  });

  it("refuse tout autre format", () => {
    for (const raw of [
      undefined,
      "",
      "2026-2-3",
      "03/02/2026",
      "2026-02-03T00:00",
      " 2026-02-03",
    ]) {
      expect(parseCompositionDate(raw)).toBeNull();
    }
  });
});

describe("parseMembersQuery", () => {
  it("donne les défauts sans paramètre", () => {
    expect(parseMembersQuery({}, coverage, slugs)).toEqual({
      query: {
        mode: "periode",
        du: "2017-05-17",
        au: "2026-09-30",
        gouvernement: null,
        fonction: null,
        q: "",
        personne: null,
        page: 1,
      },
      invalid: false,
    });
  });

  it("garde l'URL du partenaire ?du=2017-05-15", () => {
    const { query, invalid } = parseMembersQuery({ du: "2017-05-15" }, coverage, slugs);
    expect(invalid).toBe(false);
    expect(query.du).toBe("2017-05-15");
    expect(query.au).toBe(coverage.to);
  });

  it("une date impossible est ignorée et signalée", () => {
    const { query, invalid } = parseMembersQuery({ du: "2026-02-30" }, coverage, slugs);
    expect(invalid).toBe(true);
    expect(query.du).toBe(coverage.from);
  });

  it("refuse des bornes inversées et revient aux deux défauts", () => {
    const { query, invalid } = parseMembersQuery(
      { du: "2024-01-01", au: "2020-01-01" },
      coverage,
      slugs
    );
    expect(invalid).toBe(true);
    expect(query.du).toBe(coverage.from);
    expect(query.au).toBe(coverage.to);
  });

  it("en mode « Présents au », du n'intervient pas : pas de contrôle du > au", () => {
    const { query, invalid } = parseMembersQuery(
      { mode: "present", du: "2024-01-01", au: "2020-01-01" },
      coverage,
      slugs
    );
    expect(invalid).toBe(false);
    expect(query.au).toBe("2020-01-01");
  });

  it("borne la page à 100", () => {
    const { query } = parseMembersQuery({ page: "999999" }, coverage, slugs);
    expect(query.page).toBe(MAX_MEMBERS_PAGE);
    expect(MAX_MEMBERS_PAGE).toBe(100);
  });

  it("une page non entière ou nulle revient à 1 et est signalée", () => {
    for (const page of ["0", "-3", "2.5", "abc", "1e3"]) {
      const { query, invalid } = parseMembersQuery({ page }, coverage, slugs);
      expect(query.page).toBe(1);
      expect(invalid).toBe(true);
    }
  });

  it("refuse un gouvernement hors des slugs publiés", () => {
    for (const gouvernement of ["../x", "inconnu", "PHILIPPE-1"]) {
      const { query, invalid } = parseMembersQuery({ gouvernement }, coverage, slugs);
      expect(query.gouvernement).toBeNull();
      expect(invalid).toBe(true);
    }
    expect(
      parseMembersQuery({ gouvernement: "lecornu-2" }, coverage, slugs).query.gouvernement
    ).toBe("lecornu-2");
  });

  it("tronque q à 100 caractères", () => {
    const { query } = parseMembersQuery({ q: "a".repeat(10_000) }, coverage, slugs);
    expect(query.q).toHaveLength(100);
  });

  it("lit le mode et la fonction, refuse les valeurs inconnues", () => {
    expect(
      parseMembersQuery({ mode: "present", fonction: "delegue" }, coverage, slugs).query
    ).toMatchObject({ mode: "present", fonction: "delegue" });
    const bad = parseMembersQuery({ mode: "x", fonction: "roi" }, coverage, slugs);
    expect(bad.query).toMatchObject({ mode: "periode", fonction: null });
    expect(bad.invalid).toBe(true);
  });

  it("un paramètre vide vaut absent", () => {
    const { query, invalid } = parseMembersQuery(
      { du: "", au: "", gouvernement: "", fonction: "", mode: "", page: "" },
      coverage,
      slugs
    );
    expect(invalid).toBe(false);
    expect(query).toMatchObject({ du: coverage.from, au: coverage.to, page: 1 });
  });
});

describe("parseMembersQuery, personne", () => {
  it("garde un slug valide", () => {
    const { query, invalid } = parseMembersQuery({ personne: "jean-martin" }, coverage, slugs);
    expect(query.personne).toBe("jean-martin");
    expect(invalid).toBe(false);
  });

  it.each(["Jean-Martin", "jean martin", "jean_martin", "../x", "a".repeat(121)])(
    "refuse %s",
    (personne) => {
      const { query, invalid } = parseMembersQuery({ personne }, coverage, slugs);
      expect(query.personne).toBeNull();
      expect(invalid).toBe(true);
    }
  );

  it("accepte 120 caractères", () => {
    const personne = "a".repeat(120);
    expect(parseMembersQuery({ personne }, coverage, slugs).query.personne).toBe(personne);
  });
});
