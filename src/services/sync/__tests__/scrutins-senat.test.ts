import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { parseScrutinMetadata } from "@/services/sync/scrutins-senat";

describe("import des scrutins publics du Sénat", () => {
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
