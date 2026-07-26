import { describe, it, expect } from "vitest";
import {
  assess,
  parseLedger,
  describesPartlySuspendedSentence,
  type SourceRow,
} from "@/lib/affairs/audit-evidence";

// #566 counted two different things under one name. `hasOfficialSource` only
// looks at Source rows, while level A is granted on a linked CourtDecision, so
// an affair backed by an identified decision was still reported as "unsourced".
// The two questions are now separate metrics and must stay separate.

const VERDICT = new Date("2023-05-31");
const AFTER_VERDICT = new Date("2023-06-01");

function source(overrides: Partial<SourceRow> = {}): SourceRow {
  return {
    url: "https://www.lemonde.fr/article",
    title: "Un titre de presse",
    publisher: "Le Monde",
    publishedAt: AFTER_VERDICT,
    sourceType: "PRESSE",
    ...overrides,
  };
}

const OFFICIAL_SOURCE = source({
  url: "https://www.legifrance.gouv.fr/jufi/id/JUFITEXT000048493146",
  title: "Arrêt du 31 mai 2023",
  publisher: "Legifrance",
});

function affair(overrides: Partial<Parameters<typeof assess>[0]> = {}) {
  return assess({
    status: "CONDAMNATION_PREMIERE_INSTANCE",
    involvement: "DIRECT",
    verdictDate: VERDICT,
    description: "Une description neutre, sans mention de recours.",
    prisonMonths: null,
    fineAmount: null,
    ineligibilityMonths: null,
    sources: [source()],
    decisionCount: 0,
    ...overrides,
  });
}

describe("the two official-backing metrics are distinct", () => {
  it("a linked decision without an official Source row: evidence yes, source row no", () => {
    const a = affair({ decisionCount: 1, sources: [source()] });

    expect(a.hasOfficialSource).toBe(false);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.level).toBe("A");
  });

  it("an official Source row without a linked decision: both yes", () => {
    const a = affair({ decisionCount: 0, sources: [OFFICIAL_SOURCE] });

    expect(a.hasOfficialSource).toBe(true);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.level).toBe("B");
  });

  it("both at once: both yes, and the decision wins the level", () => {
    const a = affair({ decisionCount: 1, sources: [OFFICIAL_SOURCE] });

    expect(a.hasOfficialSource).toBe(true);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.level).toBe("A");
  });

  it("no official backing at all: both no", () => {
    const a = affair({
      decisionCount: 0,
      sources: [source(), source({ publisher: "Libération", title: "Un autre titre" })],
    });

    expect(a.hasOfficialSource).toBe(false);
    expect(a.hasOfficialEvidence).toBe(false);
    expect(a.level).toBe("C");
  });

  it("no source at all: both no, and the affair falls to D", () => {
    const a = affair({ decisionCount: 0, sources: [] });

    expect(a.hasOfficialSource).toBe(false);
    expect(a.hasOfficialEvidence).toBe(false);
    expect(a.level).toBe("D");
  });

  // A contradiction sends the affair to D whatever backs it, but it does not
  // erase the fact that the backing exists: the two metrics stay truthful.
  it("keeps reporting the backing of a contradictory affair", () => {
    const a = affair({
      decisionCount: 1,
      sources: [OFFICIAL_SOURCE],
      status: "CONDAMNATION_PREMIERE_INSTANCE",
      description: "La condamnation est définitive.",
    });

    expect(a.level).toBe("D");
    expect(a.contradictions.length).toBeGreaterThan(0);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.hasOfficialSource).toBe(true);
  });
});

describe("the ledger stays readable across generations", () => {
  it("reads a ledger written before the stricter metric existed", () => {
    const old = {
      done: ["aff-1", "aff-2"],
      baseline: {
        A: 3,
        B: 12,
        C: 64,
        D: 53,
        withoutOfficialSource: 120,
        capturedAt: "2026-07-26T00:00:00.000Z",
      },
    };

    const ledger = parseLedger(old);

    expect(ledger.done).toEqual(["aff-1", "aff-2"]);
    // The historical figure keeps its original meaning: Source rows only.
    expect(ledger.baseline?.withoutOfficialSource).toBe(120);
    expect(ledger.baseline?.capturedAt).toBe("2026-07-26T00:00:00.000Z");
    // No history is invented for the metric that did not exist yet.
    expect(ledger.evidenceBaseline).toBeUndefined();
  });

  it("reads a ledger holding both baselines, each with its own date", () => {
    const ledger = parseLedger({
      done: [],
      baseline: {
        A: 3,
        B: 11,
        C: 66,
        D: 51,
        withoutOfficialSource: 119,
        capturedAt: "2026-07-26T00:00:00.000Z",
      },
      evidenceBaseline: {
        withoutOfficialEvidence: 116,
        capturedAt: "2026-07-27T00:00:00.000Z",
      },
    });

    expect(ledger.baseline?.capturedAt).toBe("2026-07-26T00:00:00.000Z");
    expect(ledger.evidenceBaseline?.capturedAt).toBe("2026-07-27T00:00:00.000Z");
    expect(ledger.evidenceBaseline?.withoutOfficialEvidence).toBe(116);
  });

  it("tolerates an empty or malformed ledger without inventing entries", () => {
    expect(parseLedger({}).done).toEqual([]);
    expect(parseLedger(null).done).toEqual([]);
    expect(parseLedger({ done: "not-an-array" }).done).toEqual([]);
  });
});

// Regression on a defect the audit was blind to: `SentenceDetails` prints
// « (ferme) » whenever `prisonSuspended` is not true, so a partly-suspended
// sentence stored as a plain total is published as if the whole term were firm.
// 15 published fiches were in that state; the wordings below are theirs.
describe("detects a total shown as firm over a partly suspended sentence", () => {
  const REAL_WORDINGS = [
    "dont 48 mois de prison ferme, 12 mois avec sursis",
    "4 ans ferme, 1 an avec sursis",
    "2 ans de prison dont 1 ferme",
    "6 mois ferme, 6 mois avec sursis",
    "5 ans de prison dont 3 ans ferme",
    "2 ans de prison dont 6 mois ferme",
    "18 mois ferme (aménagé en détention à domicile) + 18 mois avec sursis",
    "4 ans dont 2 ans ferme et 2 ans avec sursis",
    "1 an ferme (aménagé en bracelet électronique) + 2 ans avec sursis",
    "Le 31 mars 2025, il est condamné en première instance à 12 mois de prison dont 10 ferme",
    "3 ans de prison dont 1 an ferme sous bracelet électronique",
    "1 an de prison dont 6 mois ferme, aménagée sous bracelet électronique",
    "2 ans de prison dont 1 an ferme avec aménagement",
    "4 ans de prison dont 3 avec sursis",
  ];

  it.each(REAL_WORDINGS)("recognises %s", (wording) => {
    expect(describesPartlySuspendedSentence(wording)).toBe(true);
  });

  // Both of these stayed firm in the corpus and must not be flagged.
  it.each([
    "2 ans de prison ferme, 50 000 € d'amende, 5 ans d'inéligibilité",
    "1ère instance : 5 ans de prison ferme avec exécution provisoire",
    "3 ans d'emprisonnement intégralement assortis du sursis",
  ])("leaves %s alone", (wording) => {
    expect(describesPartlySuspendedSentence(wording)).toBe(false);
  });

  it("flags the affair as contradictory, whichever field carries the wording", () => {
    for (const field of ["otherSentence", "sentence", "description"] as const) {
      const a = affair({
        prisonMonths: 48,
        prisonSuspended: false,
        [field]: "4 ans dont 2 ans ferme et 2 ans avec sursis",
      });
      expect(a.contradictions, `via ${field}`).toContain(
        "peine affichée entièrement ferme alors que le texte décrit une part avec sursis"
      );
      expect(a.level).toBe("D");
    }
  });

  it("says nothing when the sentence is recorded as suspended", () => {
    const a = affair({
      prisonMonths: 48,
      prisonSuspended: true,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });
    expect(a.contradictions).toEqual([]);
  });

  it("says nothing once the unrepresentable figure has been removed", () => {
    const a = affair({
      prisonMonths: null,
      prisonSuspended: null,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });
    expect(a.contradictions).toEqual([]);
  });

  it("says nothing for a genuinely firm sentence", () => {
    const a = affair({
      prisonMonths: 24,
      prisonSuspended: false,
      otherSentence: "2 ans de prison ferme, 50 000 € d'amende",
    });
    expect(a.contradictions).toEqual([]);
  });
});
