import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import {
  getNextSenateCursor,
  parseScrutinMetadata,
  shouldSaveSenateCursor,
} from "@/services/sync/scrutins-senat";

describe("import des scrutins publics du Sénat", () => {
  it("garde le curseur derrière un scrutin rejeté au milieu d'une liste descendante", () => {
    expect(
      getNextSenateCursor(100, [
        { number: 105, outcome: "PROCESSED" },
        { number: 104, outcome: "RETRY" },
        { number: 103, outcome: "PROCESSED" },
        { number: 102, outcome: "PROCESSED" },
        { number: 101, outcome: "PROCESSED" },
      ])
    ).toBe(103);
  });

  it("avance au plus grand scrutin quand aucun numéro ne doit être retenté", () => {
    expect(
      getNextSenateCursor(100, [
        { number: 103, outcome: "PROCESSED" },
        { number: 102, outcome: "PROCESSED" },
        { number: 101, outcome: "PROCESSED" },
      ])
    ).toBe(103);
  });

  it("conserve le curseur courant si le prochain scrutin doit être retenté", () => {
    expect(
      getNextSenateCursor(100, [
        { number: 103, outcome: "PROCESSED" },
        { number: 102, outcome: "PROCESSED" },
        { number: 101, outcome: "RETRY" },
      ])
    ).toBe(100);
  });

  it("réinitialise un ancien curseur quand un import forcé échoue dès le numéro 1", () => {
    const nextCursor = getNextSenateCursor(0, [{ number: 1, outcome: "RETRY" }]);

    expect(nextCursor).toBe(0);
    expect(shouldSaveSenateCursor(false, true, 0, nextCursor)).toBe(true);
  });

  it("extrait le total de contrôle officiel sans supposer 348 sièges", () => {
    const html = `
      <p class="page-lead">Projet de loi de test</p>
      <p>Séance du 10 octobre 2024</p>
      <strong>331</strong> votants
      <strong>267</strong> suffrages exprimés
      <strong>34</strong> pour
      <strong>233</strong> contre
      Abstention : 64
      N'ont pas pris part au vote : 16
      Le Sénat a adopté
    `;

    expect(parseScrutinMetadata(html, 2024, "1")).toMatchObject({
      votesFor: 34,
      votesAgainst: 233,
      votesAbstain: 64,
      officialVoters: 331,
      officialNonVoters: 16,
      result: "ADOPTED",
      sourceUrl: "https://www.senat.fr/scrutin-public/2024/scr2024-1.html",
    });
  });

  it("laisse les totaux de contrôle absents non démontrés", () => {
    expect(parseScrutinMetadata("<h1>Scrutin n°2</h1>", 2024, "2")).toMatchObject({
      officialVoters: null,
      officialNonVoters: null,
    });
  });
});
