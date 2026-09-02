import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedMeasuresDemoCorpus, type DemoCorpus } from "@/test/fixtures/measures-demo";

let db: typeof import("@/lib/db").db;
let queryMeasureQueue: typeof import("../queue-query").queryMeasureQueue;
let corpus: DemoCorpus;

const SEED_TIMEOUT_MS = 120_000;

/** Every query is scoped to the corpus election, so the counters are deterministic. */
function scoped(filters: Partial<Parameters<typeof queryMeasureQueue>[0]> = {}) {
  return queryMeasureQueue({ electionId: corpus.electionId, ...filters });
}

describeIfDisposableDb("queryMeasureQueue", () => {
  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ queryMeasureQueue } = await import("../queue-query"));
    corpus = await seedMeasuresDemoCorpus();
  }, SEED_TIMEOUT_MS);

  afterAll(async () => {
    await db.$disconnect();
  });

  it("compte les dix états du corpus, un par étape du cycle", async () => {
    const result = await scoped();

    expect(result.counts).toEqual({
      // published, published with a correction in flight, withdrawn, incomplete withdrawal,
      // published with no source, orphan draft: all six are declared published.
      PUBLISHED: 6,
      DRAFT: 1,
      REVIEWED: 1,
      DEPUBLISHED: 1,
      EMPTY: 1,
    });
    expect(result.total).toBe(10);
    expect(result.scanCapped).toBe(false);
  });

  it("compte séparément les anomalies et les retraits", async () => {
    const result = await scoped();

    // Incomplete withdrawal, published with no source, orphan active draft.
    expect(result.anomalyCount).toBe(3);
    // Withdrawn (sourced) and withdrawn (unsourced): both are withdrawals.
    expect(result.withdrawnCount).toBe(2);
  });

  it("isole les fiches dont le contexte éditorial reste à compléter", async () => {
    const result = await scoped({ enrichment: "DETAILS_MISSING" });

    expect(result.total).toBe(result.enrichmentCounts.DETAILS_MISSING);
    expect(result.rows.every((row) => !row.hasDetails)).toBe(true);
  });

  it("borne la page sans jamais produire un LIMIT invalide", async () => {
    // take: 0 and take: -5 must not reach the database as such. A negative LIMIT fails with
    // P2010, and a zero one silently returns an empty page that reads like "no measures".
    await expect(scoped({ take: 3 }).then((r) => r.rows.length)).resolves.toBe(3);
    await expect(scoped({ take: 0 }).then((r) => r.rows.length)).resolves.toBe(1);
    await expect(scoped({ take: -5 }).then((r) => r.rows.length)).resolves.toBe(1);
    await expect(scoped({ take: 5000 }).then((r) => r.rows.length)).resolves.toBe(10);
  });

  it("pagine sans recouvrement et garde le total", async () => {
    const first = await scoped({ take: 6, skip: 0 });
    const second = await scoped({ take: 6, skip: 6 });

    expect(first.rows).toHaveLength(6);
    expect(second.rows).toHaveLength(4);
    expect(first.total).toBe(10);
    expect(second.total).toBe(10);

    const overlap = first.rows.filter((row) => second.rows.some((other) => other.id === row.id));
    expect(overlap).toEqual([]);
  });

  it("filtre sur une étape dérivée sans toucher aux compteurs", async () => {
    const result = await scoped({ publication: ["DRAFT"] });

    expect(result.rows.map((row) => row.id)).toEqual([corpus.measureIds.brouillon]);
    expect(result.total).toBe(1);
    // The counters keep showing the whole distribution: a filter chip that only counted the
    // selected state would leave the moderator unable to see there is anything else.
    expect(result.counts.PUBLISHED).toBe(6);
  });

  it("filtre sur les seules mesures porteuses d'une anomalie", async () => {
    const result = await scoped({ anomaliesOnly: true });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((row) => row.state.anomalies.length > 0)).toBe(true);
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [
        corpus.measureIds.retrait_incomplet,
        corpus.measureIds.publiee_sans_source,
        corpus.measureIds.brouillon_orphelin,
      ].sort()
    );
  });

  it("filtre par thème", async () => {
    const result = await scoped({ theme: ["TRANSPORTS"] });

    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [corpus.measureIds.brouillon, corpus.measureIds.relue].sort()
    );
  });

  it("filtre par candidature sans mélanger deux programmes de la même élection", async () => {
    const candidacy = await db.measure.findUniqueOrThrow({
      where: { id: corpus.measureIds.relue },
      select: { candidacyId: true },
    });
    expect(candidacy.candidacyId).not.toBeNull();

    const result = await scoped({ candidacyId: candidacy.candidacyId ?? undefined });

    expect(result.rows.some((row) => row.id === corpus.measureIds.relue)).toBe(true);
    expect(result.rows.some((row) => row.id === corpus.measureIds.brouillon)).toBe(false);
  });

  it("isole ou exclut les retraits", async () => {
    const only = await scoped({ withdrawn: "only" });
    const excluded = await scoped({ withdrawn: "exclude" });

    expect(only.rows.map((row) => row.id).sort()).toEqual(
      [corpus.measureIds.retiree, corpus.measureIds.retrait_incomplet].sort()
    );
    expect(excluded.rows).toHaveLength(8);
    expect(excluded.rows.every((row) => row.state.withdrawal === null)).toBe(true);
  });

  it("cherche une sous-chaîne sans tenir compte de la casse", async () => {
    const exact = await scoped({ q: "fret ferroviaire" });
    const shouted = await scoped({ q: "FRET FERROVIAIRE" });

    expect(exact.rows.map((row) => row.id)).toEqual([corpus.measureIds.relue]);
    expect(shouted.rows.map((row) => row.id)).toEqual([corpus.measureIds.relue]);
  });

  it("rend un résultat vide sans compteur fantôme", async () => {
    const result = await scoped({ theme: ["IMMIGRATION"] });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.counts).toEqual({
      PUBLISHED: 0,
      DRAFT: 0,
      REVIEWED: 0,
      DEPUBLISHED: 0,
      EMPTY: 0,
    });
    expect(result.anomalyCount).toBe(0);
  });

  it("montre le texte public et signale la correction en cours, pas l'inverse", async () => {
    const result = await scoped({ publication: ["PUBLISHED"] });
    const row = result.rows.find((r) => r.id === corpus.measureIds.publiee_avec_correction);

    // The reference text is the PUBLISHED one, because that is what the site displays. The
    // pending draft is signalled beside it instead of quietly replacing it.
    expect(row?.referenceText).toContain("sur la durée du mandat");
    expect(row?.state.activeDraft).toEqual({ id: expect.any(String), reviewed: true });
    expect(row?.state.draftIsCorrection).toBe(true);
  });

  it("n'invente pas de texte pour une mesure sans révision de référence", async () => {
    const result = await scoped({ publication: ["EMPTY"] });

    expect(result.rows.map((row) => row.id)).toEqual([corpus.measureIds.vide]);
    // toBeNull() and not toBeUndefined(): the row is there, its reference text is not.
    expect(result.rows[0]?.referenceText).toBeNull();
  });
});
