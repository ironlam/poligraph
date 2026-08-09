import { describe, it, expect } from "vitest";
import { ELECTIONS } from "../lib/elections-seed";

/**
 * The seed is idempotent and its `update` rewrites `round1Date` and
 * `dateConfirmed` unconditionally. A wrong value here is therefore not a
 * first-run display glitch: it is a regression that re-arms on every run,
 * including after a manual correction in the database.
 */
describe("seed élections : sénatoriales 2026", () => {
  const senatoriales = ELECTIONS.find((e) => e.slug === "senatoriales-2026");

  it("existe dans le seed", () => {
    expect(senatoriales).toBeDefined();
  });

  it("porte la date du décret n° 2026-301, le 27 septembre et non le 28", () => {
    expect(senatoriales?.round1Date?.toISOString().slice(0, 10)).toBe("2026-09-27");
  });

  it("ne présente pas la date comme provisoire alors que le décret est publié", () => {
    expect(senatoriales?.dateConfirmed).toBe(true);
  });

  it("porte un tour unique", () => {
    expect(senatoriales?.round2Date).toBeNull();
  });

  it("ouvre le dépôt des candidatures du 7 au 11 septembre", () => {
    expect(senatoriales?.candidacyOpenDate?.toISOString().slice(0, 10)).toBe("2026-09-07");
    expect(senatoriales?.candidacyDeadline?.toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("renseigne les trois champs dont dépendent des sections de la page", () => {
    expect(senatoriales?.description).toBeTruthy();
    expect(senatoriales?.sourceUrl).toBeTruthy();
    expect(senatoriales?.decreeUrl).toContain("legifrance.gouv.fr");
  });

  it("remet en jeu 178 sièges au suffrage indirect", () => {
    expect(senatoriales?.totalSeats).toBe(178);
    expect(senatoriales?.suffrage).toBe("INDIRECT");
  });
});

describe("seed élections : invariants généraux", () => {
  it("n'a pas de slug en double", () => {
    const slugs = ELECTIONS.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("ne marque une date comme confirmée que si un premier tour est fixé", () => {
    for (const e of ELECTIONS) {
      if (e.dateConfirmed) expect(e.round1Date, `${e.slug}`).not.toBeNull();
    }
  });
});
