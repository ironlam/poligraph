import { describe, it, expect } from "vitest";
import type { JudilibreDecision } from "@/lib/api/judilibre";
import { buildJudilibreDecisionUrl } from "@/lib/api/judilibre";
import {
  buildJudilibreMetadata,
  hashJudilibrePayload,
  JUDILIBRE_MAPPER_VERSION,
  mapJudilibreToCourtDecision,
  type JudilibreLabels,
} from "../judilibre-court-decision";

// Issue #337 — payloads copied from real API responses, including the fact that a
// 1997 decision carries no `ecli` key at all while a 2026 one does.

const LABELS: JudilibreLabels = {
  jurisdiction: { cc: "Cour de cassation", ca: "Cour d'appel" },
  chamber: { cr: "Chambre criminelle", soc: "Chambre sociale" },
  solution: { rejet: "Rejet", cassation: "Cassation" },
  type: { arret: "Arrêt" },
};

const RETRIEVED_AT = new Date("2026-07-26T10:00:00Z");

/** 1997 decision: no ECLI key, as the API actually returns it. */
function historicalDecision(overrides: Partial<JudilibreDecision> = {}): JudilibreDecision {
  return {
    id: "6079a87a9ba5988459c4d674",
    number: "96-83.698",
    numbers: ["96-83.698"],
    decision_date: "1997-10-27",
    jurisdiction: "cc",
    chamber: "cr",
    solution: "rejet",
    type: "arret",
    publication: ["b"],
    themes: ["recel", "prescription"],
    summary: "Les dispositions des articles 203 du Code de procédure pénale…",
    text: "Sur le moyen unique de cassation…",
    ...overrides,
  } as JudilibreDecision;
}

describe("mapJudilibreToCourtDecision — champs de décision (#337)", () => {
  it("mappe une décision historique sans ECLI", () => {
    const mapped = mapJudilibreToCourtDecision(historicalDecision(), LABELS, RETRIEVED_AT);

    expect(mapped.judilibreId).toBe("6079a87a9ba5988459c4d674");
    expect(mapped.ecli).toBeNull();
    expect(mapped.pourvoiNumber).toBe("96-83.698");
    expect(mapped.pourvoiNumberNormalized).toBe("9683698");
    expect(mapped.decisionDate?.toISOString()).toBe("1997-10-27T00:00:00.000Z");
    expect(mapped.court).toBe("Cour de cassation");
    expect(mapped.chamber).toBe("Chambre criminelle");
    expect(mapped.solution).toBe("Rejet");
  });

  it("garde l'ECLI d'une décision récente", () => {
    const mapped = mapJudilibreToCourtDecision(
      historicalDecision({ ecli: "ECLI:FR:CCASS:2026:CR00556", decision_date: "2026-05-06" }),
      LABELS,
      RETRIEVED_AT
    );

    expect(mapped.ecli).toBe("ECLI:FR:CCASS:2026:CR00556");
  });

  it("construit l'URL publique depuis l'identifiant", () => {
    const mapped = mapJudilibreToCourtDecision(historicalDecision(), LABELS, RETRIEVED_AT);

    expect(mapped.sourceUrl).toBe(
      "https://www.courdecassation.fr/decision/6079a87a9ba5988459c4d674"
    );
    expect(buildJudilibreDecisionUrl("a b/c")).toBe(
      "https://www.courdecassation.fr/decision/a%20b%2Fc"
    );
  });

  it("laisse un libellé nul plutôt que d'inventer, sur un code inconnu", () => {
    const mapped = mapJudilibreToCourtDecision(
      historicalDecision({ jurisdiction: "xx", chamber: "yy", solution: "zz" }),
      LABELS,
      RETRIEVED_AT
    );

    expect(mapped.court).toBeNull();
    expect(mapped.chamber).toBeNull();
    expect(mapped.solution).toBeNull();
  });

  it("rend une date nulle sur une valeur malformée, jamais un Invalid Date", () => {
    for (const bad of ["", "27/10/1997", "1997-13-45x", "pas une date"]) {
      const mapped = mapJudilibreToCourtDecision(
        historicalDecision({ decision_date: bad }),
        LABELS,
        RETRIEVED_AT
      );
      expect(mapped.decisionDate).toBeNull();
    }
  });

  it("date à minuit UTC, pour qu'un fuseau ne décale pas le jour", () => {
    const mapped = mapJudilibreToCourtDecision(
      historicalDecision({ decision_date: "1997-10-27" }),
      LABELS,
      RETRIEVED_AT
    );

    expect(mapped.decisionDate?.getUTCDate()).toBe(27);
    expect(mapped.decisionDate?.getUTCHours()).toBe(0);
  });

  it("ne produit aucun champ éditorial", () => {
    const mapped = mapJudilibreToCourtDecision(
      historicalDecision({ themes: ["corruption"], summary: "Condamnation confirmée" }),
      LABELS,
      RETRIEVED_AT
    ) as unknown as Record<string, unknown>;

    // Ce qu'un mappeur de décision n'a pas à décider.
    for (const forbidden of [
      "title",
      "category",
      "status",
      "politicianId",
      "verdictDate",
      "sentence",
      "publicationStatus",
      "affairId",
    ]) {
      expect(mapped).not.toHaveProperty(forbidden);
    }
  });
});

describe("metadata et hash (#337)", () => {
  it("retire le corps de la décision, mais garde sa longueur", () => {
    const record = historicalDecision({ text: "x".repeat(109_681) });
    const meta = buildJudilibreMetadata(record, RETRIEVED_AT);

    // metadata est chargé à chaque rendu de fiche publique : le corps n'y a pas sa place.
    expect(meta.judilibre).not.toHaveProperty("text");
    expect(meta.textLength).toBe(109_681);
    // Comparé au corps omis, pour rester vrai quels que soient les autres champs.
    expect(JSON.stringify(meta).length).toBeLessThan(meta.textLength / 10);
  });

  it("conserve les champs bruts que le mappeur n'utilise pas", () => {
    const record = historicalDecision({ visa: [{ title: "article 7" }], nac: "12A" });
    const meta = buildJudilibreMetadata(record, RETRIEVED_AT);

    expect(meta.judilibre).toMatchObject({ visa: [{ title: "article 7" }], nac: "12A" });
  });

  it("hash stable quel que soit l'ordre des clés", () => {
    const a = { id: "x", number: "1", text: "t" } as unknown as JudilibreDecision;
    const b = { text: "t", number: "1", id: "x" } as unknown as JudilibreDecision;

    expect(hashJudilibrePayload(a)).toBe(hashJudilibrePayload(b));
  });

  it("le hash couvre le corps, même s'il n'est pas stocké", () => {
    const before = historicalDecision({ text: "version initiale" });
    const after = historicalDecision({ text: "texte rectifié" });

    // Sinon une rectification du texte passerait pour une absence de changement.
    expect(hashJudilibrePayload(before)).not.toBe(hashJudilibrePayload(after));
  });

  it("enregistre la version du mappeur et la date de récupération", () => {
    const meta = buildJudilibreMetadata(historicalDecision(), RETRIEVED_AT);

    expect(meta.mapperVersion).toBe(JUDILIBRE_MAPPER_VERSION);
    expect(meta.retrievedAt).toBe("2026-07-26T10:00:00.000Z");
  });
});
