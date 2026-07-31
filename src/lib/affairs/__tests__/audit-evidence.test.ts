import { describe, it, expect } from "vitest";
import {
  archiveBaseline,
  assess,
  isComparable,
  parseLedger,
  recordReview,
  splitsByTarget,
  type Baseline,
  type ContradictionKind,
  type Ledger,
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
    expect(a.evidenceLevel).toBe("A");
  });

  it("an official Source row without a linked decision: both yes", () => {
    const a = affair({ decisionCount: 0, sources: [OFFICIAL_SOURCE] });

    expect(a.hasOfficialSource).toBe(true);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.evidenceLevel).toBe("B");
  });

  it("both at once: both yes, and the decision wins the level", () => {
    const a = affair({ decisionCount: 1, sources: [OFFICIAL_SOURCE] });

    expect(a.hasOfficialSource).toBe(true);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.evidenceLevel).toBe("A");
  });

  it("no official backing at all: both no", () => {
    const a = affair({
      decisionCount: 0,
      sources: [source(), source({ publisher: "Libération", title: "Un autre titre" })],
    });

    expect(a.hasOfficialSource).toBe(false);
    expect(a.hasOfficialEvidence).toBe(false);
    expect(a.evidenceLevel).toBe("C");
  });

  it("no source at all: both no, and the affair falls to D", () => {
    const a = affair({ decisionCount: 0, sources: [] });

    expect(a.hasOfficialSource).toBe(false);
    expect(a.hasOfficialEvidence).toBe(false);
    expect(a.evidenceLevel).toBe("D");
  });

  // This affair is backed by an identified ruling AND contradicts itself. It used
  // to report level D, which said the evidence was insufficient when it was the
  // best available. Both facts are now reported side by side.
  it("keeps reporting the backing of a contradictory affair", () => {
    const a = affair({
      decisionCount: 1,
      sources: [OFFICIAL_SOURCE],
      status: "CONDAMNATION_PREMIERE_INSTANCE",
      description: "La condamnation est définitive.",
    });

    expect(a.evidenceLevel).toBe("A");
    expect(a.contradictions.map((c) => c.kind)).toEqual(["NON_DEFINITIF_MAIS_RECOURS_EPUISE"]);
    expect(a.hasOfficialEvidence).toBe(true);
    expect(a.hasOfficialSource).toBe(true);
  });
});

// Evidence quality is a property of the world: the documents exist or they do
// not. Internal coherence is a property of our own data entry. Collapsing both
// onto one axis hid 11 published fiches whose evidence was already at C and
// whose only problem was a field we had written wrong ourselves.
describe("preuve et cohérence sont deux axes indépendants", () => {
  it("une fiche contradictoire garde le niveau de preuve qu'elle mérite", () => {
    const contradictory = affair({
      involvement: "VICTIM",
      sources: [source(), source({ publisher: "Libération", title: "Un autre titre" })],
    });

    expect(contradictory.evidenceLevel).toBe("C");
    expect(contradictory.contradictions).toHaveLength(1);
    expect(contradictory.contradictions[0]!.kind).toBe("IMPLICATION_NON_ADVERSE");
  });

  it("le niveau de preuve est le même avec et sans contradiction", () => {
    const sources = [OFFICIAL_SOURCE];
    const clean = affair({ sources, involvement: "DIRECT" });
    const dirty = affair({ sources, involvement: "VICTIM" });

    expect(dirty.evidenceLevel).toBe(clean.evidenceLevel);
    expect(clean.contradictions).toEqual([]);
    expect(dirty.contradictions).not.toEqual([]);
  });

  it("une preuve absente reste en D, contradiction ou pas", () => {
    expect(affair({ sources: [] }).evidenceLevel).toBe("D");
    expect(affair({ sources: [], involvement: "VICTIM" }).evidenceLevel).toBe("D");
  });
});

// The closure criteria of #566, #569, #571 and #580 quote these strings word for
// word. A criterion anchored on a display string breaks at the first rewording,
// so the kind is what issues should cite and the message stays free to change.
describe("chaque contradiction porte un type stable", () => {
  const cases: Array<[ContradictionKind, Partial<Parameters<typeof assess>[0]>]> = [
    ["IMPLICATION_NON_ADVERSE", { involvement: "MENTIONED_ONLY" }],
    ["VERDICT_SANS_DATE", { verdictDate: null }],
    ["VERDICT_DANS_LE_FUTUR", { verdictDate: new Date("2099-01-01") }],
    [
      "SOURCES_ANTERIEURES_AU_VERDICT",
      {
        verdictDate: new Date("2024-06-19"),
        sources: [source({ publishedAt: new Date("2020-01-01") })],
      },
    ],
    [
      "PEINE_FERME_MAIS_PARTIELLEMENT_SURSIS",
      {
        prisonMonths: 48,
        prisonFirmMonths: 48,
        otherSentence: "4 ans dont 2 ans ferme et 2 avec sursis",
      },
    ],
    [
      "DEFINITIF_MAIS_RECOURS_PENDANT",
      { status: "CONDAMNATION_DEFINITIVE", description: "Le pourvoi est en cours." },
    ],
    [
      "NON_DEFINITIF_MAIS_RECOURS_EPUISE",
      { status: "APPEL_EN_COURS", description: "La condamnation est définitive." },
    ],
  ];

  it.each(cases)("%s", (kind, overrides) => {
    expect(affair(overrides).contradictions.map((c) => c.kind)).toContain(kind);
  });

  it("garde une phrase française lisible à côté du type", () => {
    const [first] = affair({ verdictDate: null }).contradictions;

    expect(first!.message).toBe("statut de condamnation sans date de verdict");
  });

  it("nomme l'implication fautive dans le message", () => {
    const [first] = affair({ involvement: "PLAINTIFF" }).contradictions;

    expect(first!.message).toBe("statut de condamnation avec implication PLAINTIFF");
  });
});

// #566 allows two reasons to mark an affair examined: resolved, or transferred to
// an issue that has an owner and a closure criterion. A flat array of ids cannot
// tell them apart, so the report treated them alike and hid both. 10 of the 27
// entries were still contradictory and appeared nowhere.
describe("le registre distingue résolue, transférée et héritée", () => {
  const OLD_GENERATION = {
    done: ["aff-1", "aff-2"],
    baseline: {
      A: 3,
      B: 12,
      C: 64,
      D: 53,
      withoutOfficialSource: 120,
      capturedAt: "2026-07-26T00:00:00.000Z",
    },
    evidenceBaseline: {
      withoutOfficialEvidence: 116,
      capturedAt: "2026-07-27T00:00:00.000Z",
    },
  };

  it("lit une génération ancienne sans inventer de motif", () => {
    const ledger = parseLedger(OLD_GENERATION);

    expect(ledger.reviewed).toHaveLength(2);
    expect(ledger.reviewed[0]).toEqual({ affairId: "aff-1", outcome: { kind: "LEGACY" } });
  });

  // The old format recorded no timestamp, so none is invented.
  it("ne fabrique pas d'horodatage pour une entrée héritée", () => {
    expect(parseLedger(OLD_GENERATION).reviewed[0]!.at).toBeUndefined();
  });

  // 120 is the figure published on #566 as the canonical reference. It is archived
  // rather than differenced: it was measured under rules we cannot identify.
  it("archive l'ancienne paire de références sans la promouvoir", () => {
    const ledger = parseLedger(OLD_GENERATION);

    expect(ledger.baseline).toBeUndefined();
    expect(ledger.legacyBaselines).toEqual({
      baseline: OLD_GENERATION.baseline,
      evidenceBaseline: OLD_GENERATION.evidenceBaseline,
    });
  });

  it("relit une génération typée à l'identique", () => {
    const reviewed = [
      { affairId: "aff-1", outcome: { kind: "RESOLVED" as const }, at: "2026-07-30T10:00:00.000Z" },
      {
        affairId: "aff-2",
        outcome: { kind: "TRANSFERRED" as const, issue: 571 },
        at: "2026-07-30T10:00:00.000Z",
      },
    ];

    expect(parseLedger({ reviewed }).reviewed).toEqual(reviewed);
  });

  it("tolère un registre vide ou abîmé sans inventer d'entrée", () => {
    expect(parseLedger({}).reviewed).toEqual([]);
    expect(parseLedger(null).reviewed).toEqual([]);
    expect(parseLedger({ reviewed: "pas-un-tableau" }).reviewed).toEqual([]);
    expect(parseLedger({ done: "pas-un-tableau" }).reviewed).toEqual([]);
  });
});

// The first version of this refused to touch an id already in the ledger, so the
// 10 entries inherited as LEGACY could never be assigned to #569 or #571 — the
// very next step this lot is meant to enable. Worse, it reported success while
// adding nothing.
describe("une entrée du registre peut être reclassée", () => {
  const legacy = (): Ledger => ({
    reviewed: [{ affairId: "aff-1", outcome: { kind: "LEGACY" } }],
  });

  it("reclasse une entrée héritée vers une issue", () => {
    const ledger = legacy();
    const counts = recordReview(ledger, ["aff-1"], { kind: "TRANSFERRED", issue: 571 });

    expect(counts).toEqual({ added: 0, reclassified: 1 });
    expect(ledger.reviewed).toHaveLength(1);
    expect(ledger.reviewed[0]!.outcome).toEqual({ kind: "TRANSFERRED", issue: 571 });
  });

  it("horodate la reclassification", () => {
    const ledger = legacy();
    recordReview(ledger, ["aff-1"], { kind: "RESOLVED" });

    expect(ledger.reviewed[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("ajoute une entrée inconnue", () => {
    const ledger = legacy();
    const counts = recordReview(ledger, ["aff-2"], { kind: "RESOLVED" });

    expect(counts).toEqual({ added: 1, reclassified: 0 });
    expect(ledger.reviewed).toHaveLength(2);
  });

  it("ne compte pas une reclassification vers le même motif", () => {
    const ledger: Ledger = {
      reviewed: [{ affairId: "aff-1", outcome: { kind: "TRANSFERRED", issue: 571 } }],
    };
    const counts = recordReview(ledger, ["aff-1"], { kind: "TRANSFERRED", issue: 571 });

    expect(counts).toEqual({ added: 0, reclassified: 0 });
  });

  it("distingue deux issues de transfert différentes", () => {
    const ledger: Ledger = {
      reviewed: [{ affairId: "aff-1", outcome: { kind: "TRANSFERRED", issue: 569 } }],
    };
    const counts = recordReview(ledger, ["aff-1"], { kind: "TRANSFERRED", issue: 571 });

    expect(counts).toEqual({ added: 0, reclassified: 1 });
  });
});

describe("archiver une référence ne l'imbrique pas", () => {
  const baseline = (day: string): Baseline => ({
    rulesVersion: 1,
    evidence: { A: 4, B: 11, C: 72, D: 45 },
    contradictoryCount: 18,
    withoutOfficialSource: 120,
    withoutOfficialEvidence: 117,
    capturedAt: `2026-07-${day}T00:00:00.000Z`,
  });

  it("archive la première référence dans un tableau plat", () => {
    expect(archiveBaseline(undefined, baseline("30"))).toEqual([baseline("30")]);
  });

  // Two successive recaptures used to produce [[old], new]: an array whose first
  // element was an array, gaining a level of nesting on every call.
  it("reste plat après deux archivages", () => {
    const once = archiveBaseline(undefined, baseline("30"));

    expect(archiveBaseline(once, baseline("31"))).toEqual([baseline("30"), baseline("31")]);
  });

  it("absorbe la paire non versionnée héritée sans l'aplatir de force", () => {
    const inherited = { baseline: { A: 3 }, evidenceBaseline: { withoutOfficialEvidence: 116 } };

    expect(archiveBaseline(inherited, baseline("30"))).toEqual([inherited, baseline("30")]);
  });

  it("n'archive rien quand il n'y a pas de référence à remplacer", () => {
    expect(archiveBaseline(undefined, undefined)).toBeUndefined();
  });
});

describe("une référence n'est comparable que sous les mêmes règles", () => {
  const baseline = {
    rulesVersion: 1,
    evidence: { A: 4, B: 11, C: 72, D: 45 },
    contradictoryCount: 18,
    withoutOfficialSource: 120,
    withoutOfficialEvidence: 117,
    capturedAt: "2026-07-30T00:00:00.000Z",
  };

  it("comparable à version égale", () => {
    expect(isComparable(baseline, 1)).toBe(true);
  });

  // This is the defect that produced a false regression diagnosis: the report
  // printed « D : 53 → 56 (+3) » across a rule change, on an unchanged corpus.
  it("non comparable à version différente", () => {
    expect(isComparable(baseline, 2)).toBe(false);
  });

  it("non comparable en l'absence de référence", () => {
    expect(isComparable(undefined, 1)).toBe(false);
  });
});

// Regression on a defect the audit was blind to: a partly-suspended sentence stored as a
// plain total was published as if the whole term were firm, because the renderer read a
// nullable boolean. 15 published fiches were in that state; the wordings below are theirs.
//
// Since #576 the predicate is `prisonFirmMonths === prisonMonths`, so the contradiction
// now means "our columns say entirely firm while our own prose splits it".
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
    expect(splitsByTarget(wording).prison).toBe(true);
  });

  // Both of these stayed firm in the corpus and must not be flagged.
  it.each([
    "2 ans de prison ferme, 50 000 € d'amende, 5 ans d'inéligibilité",
    "1ère instance : 5 ans de prison ferme avec exécution provisoire",
    "3 ans d'emprisonnement intégralement assortis du sursis",
  ])("leaves %s alone", (wording) => {
    expect(splitsByTarget(wording).prison).toBe(false);
  });

  it("flags the affair as contradictory, whichever field carries the wording", () => {
    for (const field of ["otherSentence", "sentence", "description"] as const) {
      const a = affair({
        prisonMonths: 48,
        prisonFirmMonths: 48,
        [field]: "4 ans dont 2 ans ferme et 2 ans avec sursis",
      });
      expect(
        a.contradictions.map((c) => c.kind),
        `via ${field}`
      ).toContain("PEINE_FERME_MAIS_PARTIELLEMENT_SURSIS");
      // A single press source, so the evidence axis is at D on its own merits,
      // not because of the contradiction.
      expect(a.evidenceLevel).toBe("D");
    }
  });

  it("says nothing when the sentence is recorded as entirely suspended", () => {
    const a = affair({
      prisonMonths: 48,
      prisonFirmMonths: 0,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });
    expect(a.contradictions).toEqual([]);
  });

  it("says nothing at all once the split is correctly recorded", () => {
    const a = affair({
      prisonMonths: 48,
      prisonFirmMonths: 24,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });
    expect(a.contradictions).toEqual([]);
    expect(a.editorialSignals).toEqual([]);
  });

  /**
   * The lot-2 mitigation emptied `prisonMonths` on these 15 fiches, so nothing false is
   * asserted any more and there is no contradiction. But the split is still written in
   * their prose and absent from their columns, which is what the editorial queue is for.
   *
   * A signal requiring a total would find none of them. That is the defect this test
   * exists to prevent.
   */
  it("recense la fiche vidée au lieu de la déclarer saine", () => {
    const a = affair({
      prisonMonths: null,
      prisonFirmMonths: null,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });
    expect(a.contradictions).toEqual([]);
    expect(a.editorialSignals.map((sig) => sig.kind)).toContain("PRISON_SPLIT_ONLY_IN_PROSE");
  });

  it("says nothing for a genuinely firm sentence", () => {
    const a = affair({
      prisonMonths: 24,
      prisonFirmMonths: 24,
      otherSentence: "2 ans de prison ferme, 50 000 € d'amende",
    });
    expect(a.contradictions).toEqual([]);
    expect(a.editorialSignals).toEqual([]);
  });
});

// The "all sources predate the verdict" check was defeated by its own corpus:
// a Wikidata row is stamped with its import date, so it always postdates the
// verdict and pushed the maximum past it. Seven published convictions whose
// only real source was written before the decision they assert went unflagged.
describe("dating a verdict against sources that can actually attest it", () => {
  const VERDICT_2024 = new Date("2024-06-19");
  const PRESS_2020 = source({ publishedAt: new Date("2020-06-16") });
  const WIKIDATA_2026 = source({
    publisher: "Wikidata",
    sourceType: "WIKIDATA",
    title: "Wikidata — une personne",
    publishedAt: new Date("2026-01-18"),
  });
  const KIND = "SOURCES_ANTERIEURES_AU_VERDICT";

  it("flags a verdict whose only press source predates it, despite a later Wikidata row", () => {
    const a = affair({
      verdictDate: VERDICT_2024,
      sources: [PRESS_2020, WIKIDATA_2026],
    });

    expect(a.contradictions.map((c) => c.kind)).toContain(KIND);
    expect(a.evidenceLevel).toBe("D");
  });

  it("flags it just the same without the encyclopedia row", () => {
    const a = affair({ verdictDate: VERDICT_2024, sources: [PRESS_2020] });

    expect(a.contradictions.map((c) => c.kind)).toContain(KIND);
  });

  it("says nothing when a press source postdates the verdict", () => {
    const a = affair({
      verdictDate: VERDICT_2024,
      sources: [source({ publishedAt: new Date("2024-06-20") }), WIKIDATA_2026],
    });

    expect(a.contradictions.map((c) => c.kind)).not.toContain(KIND);
  });

  it("says nothing when only encyclopedias are attached, the level already sanctioning it", () => {
    const a = affair({ verdictDate: VERDICT_2024, sources: [WIKIDATA_2026] });

    expect(a.contradictions.map((c) => c.kind)).not.toContain(KIND);
    expect(a.independentCount).toBe(0);
    expect(a.evidenceLevel).toBe("D");
  });
});

/**
 * Issue #576 — the patterns name no penalty, so prison and ineligibility had to be told
 * apart some other way.
 *
 * Requiring a prison keyword was the obvious fix and the wrong one: four of the fifteen
 * known fiches never say « prison ». So attribution is asymmetric, ineligibility proving
 * itself by name and prison being the default subject of a sentence description.
 */
describe("splitsByTarget — attribution prison / inéligibilité (#576)", () => {
  it.each([
    "1 an ferme (aménagé en bracelet électronique) + 2 ans avec sursis",
    "18 mois ferme (aménagé en détention à domicile) + 18 mois avec sursis",
    "4 ans ferme, 1 an avec sursis. 400 000 FF d'amende",
    "6 mois ferme, 6 mois avec sursis",
  ])("attribue à la prison un texte qui ne la nomme pas : %s", (wording) => {
    expect(splitsByTarget(wording).prison).toBe(true);
    expect(splitsByTarget(wording).ineligibility).toBe(false);
  });

  it("attribue à l'inéligibilité un segment qui la nomme", () => {
    const found = splitsByTarget("45 mois d'inéligibilité dont 30 avec sursis");

    expect(found.ineligibility).toBe(true);
    expect(found.prison).toBe(false);
  });

  it("reconnaît la privation des droits civiques", () => {
    expect(splitsByTarget("5 ans de privation des droits civiques dont 2 avec sursis")).toEqual({
      prison: false,
      ineligibility: true,
    });
  });

  it("sépare les deux quand une fiche porte les deux", () => {
    const found = splitsByTarget(
      "3 ans de prison dont 1 an ferme ; 45 mois d'inéligibilité dont 30 avec sursis"
    );

    expect(found).toEqual({ prison: true, ineligibility: true });
  });

  // Le point-virgule sépare les segments, sinon le « dont » de l'inéligibilité serait
  // revendiqué par la phrase voisine.
  it("ne laisse pas un segment revendiquer le « dont » du voisin", () => {
    const found = splitsByTarget(
      "3 ans de prison ferme ; 45 mois d'inéligibilité dont 30 avec sursis"
    );

    expect(found.ineligibility).toBe(true);
    expect(found.prison).toBe(false);
  });
});

describe("assess — file éditoriale prison / inéligibilité (#576)", () => {
  it("ne prend pas une inéligibilité mixte pour une peine de prison mixte", () => {
    const a = affair({
      prisonMonths: 24,
      prisonFirmMonths: 24,
      ineligibilityMonths: 45,
      ineligibilityFirmMonths: null,
      otherSentence: "2 ans de prison ferme ; 45 mois d'inéligibilité dont 30 avec sursis",
    });

    expect(a.contradictions.map((c) => c.kind)).not.toContain(
      "PEINE_FERME_MAIS_PARTIELLEMENT_SURSIS"
    );
    const kinds = a.editorialSignals.map((s) => s.kind);
    expect(kinds).toContain("INELIGIBILITY_SPLIT_ONLY_IN_PROSE");
    expect(kinds).not.toContain("PRISON_SPLIT_ONLY_IN_PROSE");
  });

  it("compte les deux files séparément sur une fiche qui porte les deux", () => {
    const a = affair({
      prisonMonths: null,
      prisonFirmMonths: null,
      ineligibilityMonths: 45,
      ineligibilityFirmMonths: null,
      otherSentence:
        "3 ans de prison dont 1 an ferme ; 45 mois d'inéligibilité dont 30 avec sursis",
    });

    expect(a.editorialSignals.map((s) => s.kind).sort()).toEqual([
      "INELIGIBILITY_SPLIT_ONLY_IN_PROSE",
      "PRISON_SPLIT_ONLY_IN_PROSE",
    ]);
    expect(a.contradictions).toEqual([]);
  });

  // Détection d'une paire irreprésentable : elle appartient à l'auditeur, pas au rendu.
  it("signale une paire incohérente même sans prose", () => {
    const a = affair({ prisonMonths: 24, prisonFirmMonths: 36, otherSentence: null });

    expect(a.editorialSignals.map((s) => s.kind)).toContain("REPARTITION_INCOHERENTE");
  });

  it("ne signale rien sur une fiche sans peine chiffrée", () => {
    const a = affair({ prisonMonths: null, prisonFirmMonths: null, otherSentence: null });

    expect(a.editorialSignals).toEqual([]);
  });
});

/**
 * Regression on the crude version of the asymmetric rule (#576).
 *
 * Attributing by mere co-occurrence in a segment misattributed five fiches, because a
 * comma does not cut a segment: « 5 ans de prison dont 3 ans ferme, 6 ans
 * d'inéligibilité » names ineligibility after the marker, and that does not make the
 * split the ineligibility's. The wordings below are the real ones.
 */
describe("splitsByTarget — proximité, pas co-occurrence (#576)", () => {
  it.each([
    "5 ans de prison dont 3 ans ferme, 6 ans d'inéligibilité",
    "2 ans de prison dont 6 mois ferme, 3 ans d'inéligibilité",
    "4 ans de prison dont 3 avec sursis, 100 000€ d'amende, 5 ans d'inéligibilité",
    "2 ans de prison dont 1 an ferme avec aménagement, 5 ans d'inéligibilité",
  ])("garde le partage à la prison quand l'inéligibilité vient après : %s", (wording) => {
    expect(splitsByTarget(wording)).toEqual({ prison: true, ineligibility: false });
  });

  it("attribue à l'inéligibilité quand c'est elle qui précède le marqueur", () => {
    expect(
      splitsByTarget("3 ans de prison ferme, 45 mois d'inéligibilité dont 30 avec sursis")
    ).toEqual({ prison: false, ineligibility: true });
  });

  it("attribue les deux quand chacune porte son propre marqueur", () => {
    expect(
      splitsByTarget(
        "3 ans de prison dont 1 an ferme et 45 mois d'inéligibilité dont 30 avec sursis"
      )
    ).toEqual({ prison: true, ineligibility: true });
  });
});

/**
 * Regression on two false positives found by reading the queue the signal produced, not
 * by reasoning about it (#576).
 *
 * The Macron fiche recounts Benalla's sentence and the Josso fiche recounts Guerriau's,
 * both in their descriptions. Without the involvement guard, the editorial queue asked
 * someone to enter a third party's split as this person's own.
 */
describe("la file éditoriale ne réclame pas la peine d'un tiers (#576)", () => {
  const THIRD_PARTY_PROSE =
    "Alexandre Benalla a été condamné à 3 ans de prison dont 1 an ferme et 2 ans avec sursis.";

  it.each(["MENTIONED_ONLY", "VICTIM", "PLAINTIFF"] as const)(
    "ne signale rien quand la personne est %s",
    (involvement) => {
      const a = affair({ involvement, prisonMonths: null, description: THIRD_PARTY_PROSE });

      expect(a.editorialSignals.map((s) => s.kind)).not.toContain("PRISON_SPLIT_ONLY_IN_PROSE");
    }
  );

  it.each(["DIRECT", "INDIRECT"] as const)("signale quand la personne est %s", (involvement) => {
    const a = affair({ involvement, prisonMonths: null, description: THIRD_PARTY_PROSE });

    expect(a.editorialSignals.map((s) => s.kind)).toContain("PRISON_SPLIT_ONLY_IN_PROSE");
  });

  // `0` states there is no prison term; `null` states the figure was removed. Only the
  // second belongs in the queue.
  it("ne signale rien sur une fiche sans peine de prison (0, pas null)", () => {
    const a = affair({
      prisonMonths: 0,
      description: "un partage sans rapport : 2 ans dont 1 an ferme",
    });

    expect(a.editorialSignals.map((s) => s.kind)).not.toContain("PRISON_SPLIT_ONLY_IN_PROSE");
  });

  it("signale la fiche dont le total a été retiré (null)", () => {
    const a = affair({
      prisonMonths: null,
      otherSentence: "4 ans dont 2 ans ferme et 2 ans avec sursis",
    });

    expect(a.editorialSignals.map((s) => s.kind)).toContain("PRISON_SPLIT_ONLY_IN_PROSE");
  });
});
