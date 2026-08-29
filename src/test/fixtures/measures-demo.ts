/**
 * A demonstration corpus of measures, covering every moderation state.
 *
 * No measure exists in production and the tables are not there yet, so the moderation
 * screens have to be reviewed against fabricated data. Two consequences that are not
 * negotiable:
 *
 * 1. **The candidates are fictional.** Attributing invented positions to a real politician
 *    would put a false claim in the database, which is the exact failure mode this project
 *    exists to prevent. The names below are explicitly made up, and so is the election.
 * 2. **Writing is gated on the disposable container.** `.env` and `.env.prod` point at the
 *    same Supabase database, so an ungated seed run with the default environment would write
 *    fabricated political positions into production.
 *
 * States covered, one measure each: published, draft, reviewed, published with a correction
 * in flight, depublished, withdrawn, incomplete withdrawal, published with no source, empty,
 * and an orphan active draft.
 */

import type { ThemeCategory } from "@/generated/prisma";
// From ./disposable-db and NOT @/test/db-guard: this module is also imported by
// scripts/seed-measures-demo.ts under tsx, where pulling vitest in through the gate module
// crashes the script.
import { assertDisposableTestDb } from "@/test/disposable-db";

/** Deferred, same reason as the lot 1 fixtures: `@/lib/db` throws at module load. */
async function client(): Promise<typeof import("@/lib/db").db> {
  assertDisposableTestDb();
  const { db } = await import("@/lib/db");
  return db;
}

async function transitions(): Promise<typeof import("@/lib/measures/transitions")> {
  assertDisposableTestDb();
  return import("@/lib/measures/transitions");
}

/** Stable keys, so a test can name the measure it is asserting on. */
export type DemoMeasureKey =
  | "publiee"
  | "brouillon"
  | "relue"
  | "publiee_avec_correction"
  | "depubliee"
  | "retiree"
  | "retrait_incomplet"
  | "publiee_sans_source"
  | "vide"
  | "brouillon_orphelin";

export type DemoCorpus = {
  electionId: string;
  electionSlug: string;
  candidateIds: string[];
  measureIds: Record<DemoMeasureKey, string>;
};

const CORPUS_PREFIX = "demo-mesures";

/** Fictional on purpose. See the note at the top of this file. */
const CANDIDATES = [
  { firstName: "Alix", lastName: "Démonstration" },
  { firstName: "Camille", lastName: "Exemple" },
] as const;

type SeedContext = {
  db: Awaited<ReturnType<typeof client>>;
  electionId: string;
  candidacyIds: string[];
  politicianIds: string[];
};

function suffix(): string {
  return `${process.pid}-${Date.now().toString(36)}`;
}

async function seedContext(): Promise<SeedContext> {
  const db = await client();
  const unique = suffix();

  const election = await db.election.upsert({
    where: { slug: "presidentielle-2027" },
    create: {
      slug: "presidentielle-2027",
      type: "PRESIDENTIELLE",
      scope: "NATIONAL",
      title: "Élection de démonstration 2027",
      round1Date: new Date("2027-04-11T00:00:00Z"),
    },
    update: {},
  });

  const politicianIds: string[] = [];
  const candidacyIds: string[] = [];
  for (const [index, candidate] of CANDIDATES.entries()) {
    const politician = await db.politician.create({
      data: {
        slug: `${CORPUS_PREFIX}-${candidate.firstName.toLowerCase()}-${unique}-${index}`,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        fullName: `${candidate.firstName} ${candidate.lastName}`,
      },
    });
    const candidacy = await db.candidacy.create({
      data: {
        electionId: election.id,
        politicianId: politician.id,
        candidateName: `${candidate.firstName} ${candidate.lastName}`,
        status: "DECLARE",
        sourceUrl: "https://example.org/candidature-demonstration",
        sourceLabel: "Source de démonstration",
      },
    });
    politicianIds.push(politician.id);
    candidacyIds.push(candidacy.id);
  }

  return { db, electionId: election.id, candidacyIds, politicianIds };
}

type MeasureSeed = {
  text: string;
  theme: ThemeCategory;
};

function buildRevision(input: { text: string; chiffree: boolean; validFrom: Date }) {
  return {
    text: input.text,
    precision: input.chiffree ? ("CHIFFREE" as const) : ("OBJECTIF_SANS_CHIFFRE" as const),
    validFrom: input.validFrom,
    extractionMethod: "AI_ASSISTED" as const,
    extractionConfidence: 0.82,
    extractorVersion: "demo-1",
  };
}

const PRIMARY_SOURCE = {
  sourceKind: "PROGRAMME_PARTI" as const,
  tier: "PRIMARY" as const,
  url: "https://example.org/programme-demonstration.pdf",
  page: "12",
  publishedAt: new Date("2027-01-15T00:00:00Z"),
};

const PRESS_SOURCE = {
  sourceKind: "ARTICLE_PRESSE" as const,
  tier: "SECONDARY" as const,
  url: "https://example.org/article-demonstration",
  page: null,
  publishedAt: new Date("2027-02-02T00:00:00Z"),
};

async function createDemoMeasure(
  context: SeedContext,
  candidateIndex: number,
  seed: MeasureSeed,
  options: { chiffree?: boolean } = {}
): Promise<{ measureId: string; revisionId: string }> {
  const { createMeasure } = await transitions();
  const politicianId = context.politicianIds[candidateIndex];
  const candidacyId = context.candidacyIds[candidateIndex];
  if (politicianId === undefined || candidacyId === undefined) {
    throw new Error(`Candidature de démonstration ${candidateIndex} absente du contexte`);
  }

  return createMeasure({
    politicianId,
    electionId: context.electionId,
    candidacyId,
    programEditionId: null,
    attribution: "PERSONAL",
    theme: seed.theme,
    precedingMeasureId: null,
    revision: buildRevision({
      text: seed.text,
      chiffree: options.chiffree ?? false,
      validFrom: new Date("2027-01-15T00:00:00Z"),
    }),
    sources: [PRIMARY_SOURCE],
  });
}

/**
 * Seeds the corpus and returns the identifiers.
 *
 * Everything reachable through the transitions goes through them. The four broken states are
 * written directly, and that is the nature of the exercise: the transitions refuse to produce
 * them, while a past import or a manual correction leaves exactly those behind. The
 * moderation screens exist to show them.
 */
export async function seedMeasuresDemoCorpus(): Promise<DemoCorpus> {
  const context = await seedContext();
  const { db, electionId } = context;
  const {
    reviewMeasureRevision,
    publishMeasureRevision,
    draftMeasureRevision,
    discardMeasureRevision,
    depublishMeasure,
    withdrawMeasure,
  } = await transitions();

  const election = await db.election.findUniqueOrThrow({
    where: { id: electionId },
    select: { slug: true },
  });

  // 1. Published, correctly.
  const publiee = await createDemoMeasure(context, 0, {
    text: "Encadrer les loyers dans les zones tendues et étendre le dispositif aux communes littorales.",
    theme: "LOGEMENT_URBANISME",
  });
  await reviewMeasureRevision({ ...publiee, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(publiee);

  // 2. Draft, nobody has read it.
  const brouillon = await createDemoMeasure(context, 1, {
    text: "Rendre gratuits les transports scolaires dans les départements ruraux.",
    theme: "TRANSPORTS",
  });

  // 3. Reviewed, not published.
  const relue = await createDemoMeasure(context, 0, {
    text: "Porter la part du fret ferroviaire à 20 % du transport de marchandises en cinq ans.",
    theme: "TRANSPORTS",
  });
  await reviewMeasureRevision({ ...relue, reviewedBy: "relecteur de démonstration" });

  // 4. Published, with a reviewed correction in flight.
  const avecCorrection = await createDemoMeasure(context, 1, {
    text: "Créer 5 000 postes d'enseignants sur la durée du mandat.",
    theme: "EDUCATION_CULTURE",
  });
  await reviewMeasureRevision({ ...avecCorrection, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(avecCorrection);
  const correction = await draftMeasureRevision({
    measureId: avecCorrection.measureId,
    revision: buildRevision({
      text: "Créer 5 000 postes d'enseignants dès la première année du mandat.",
      chiffree: true,
      validFrom: new Date("2027-02-20T00:00:00Z"),
    }),
    sources: [PRESS_SOURCE],
  });
  await reviewMeasureRevision({
    measureId: avecCorrection.measureId,
    revisionId: correction.revisionId,
    reviewedBy: "relecteur de démonstration",
  });

  // 5. Depublished, with its reason.
  const depubliee = await createDemoMeasure(context, 0, {
    text: "Réformer le financement de l'audiovisuel public.",
    theme: "INSTITUTIONS",
  });
  await reviewMeasureRevision({ ...depubliee, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(depubliee);
  await depublishMeasure({
    measureId: depubliee.measureId,
    reason: "Formulation trop éloignée du texte source, à réextraire.",
  });

  // 6. Withdrawn, sourced.
  const retiree = await createDemoMeasure(context, 1, {
    text: "Supprimer la taxe d'habitation sur les résidences secondaires.",
    theme: "ECONOMIE_BUDGET",
  });
  await reviewMeasureRevision({ ...retiree, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(retiree);
  await withdrawMeasure({
    measureId: retiree.measureId,
    withdrawnAt: new Date("2027-03-01T00:00:00Z"),
    sourceUrl: "https://example.org/retrait-demonstration",
    sourceLabel: "Conférence de presse du 1er mars 2027",
  });

  // 7. Anomaly: withdrawn with no source. Direct write, withdrawMeasure() refuses it.
  const retraitIncomplet = await createDemoMeasure(context, 0, {
    text: "Instaurer un revenu de base pour les 18-25 ans.",
    theme: "SOLIDARITES_PROTECTION_SOCIALE",
  });
  await reviewMeasureRevision({ ...retraitIncomplet, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(retraitIncomplet);
  await db.measure.update({
    where: { id: retraitIncomplet.measureId },
    data: { withdrawnAt: new Date("2027-03-05T00:00:00Z") },
  });

  // 8. Anomaly: published revision with no source left.
  const sansSource = await createDemoMeasure(context, 1, {
    text: "Doubler le budget de la rénovation énergétique des bâtiments publics.",
    theme: "ENVIRONNEMENT_ENERGIE",
  });
  await reviewMeasureRevision({ ...sansSource, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(sansSource);
  await db.measureSource.deleteMany({ where: { measureRevisionId: sansSource.revisionId } });

  // 9. Empty: the only draft was discarded through the real path.
  const vide = await createDemoMeasure(context, 0, {
    text: "Généraliser la médiation numérique dans les maisons France Services.",
    theme: "NUMERIQUE_TECH",
  });
  await discardMeasureRevision(vide);

  // 10. Anomaly: an active draft no pointer designates.
  const orphelin = await createDemoMeasure(context, 1, {
    text: "Créer une agence publique du médicament essentiel.",
    theme: "SANTE",
  });
  await reviewMeasureRevision({ ...orphelin, reviewedBy: "relecteur de démonstration" });
  await publishMeasureRevision(orphelin);
  await db.measureRevision.create({
    data: {
      measureId: orphelin.measureId,
      text: "Créer une agence publique du médicament, périmètre à préciser.",
      validFrom: new Date("2027-02-25T00:00:00Z"),
      extractionMethod: "IMPORTED",
    },
  });

  return {
    electionId,
    electionSlug: election.slug,
    candidateIds: context.politicianIds,
    measureIds: {
      publiee: publiee.measureId,
      brouillon: brouillon.measureId,
      relue: relue.measureId,
      publiee_avec_correction: avecCorrection.measureId,
      depubliee: depubliee.measureId,
      retiree: retiree.measureId,
      retrait_incomplet: retraitIncomplet.measureId,
      publiee_sans_source: sansSource.measureId,
      vide: vide.measureId,
      brouillon_orphelin: orphelin.measureId,
    },
  };
}
