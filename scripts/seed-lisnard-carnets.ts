#!/usr/bin/env tsx
/**
 * npm run seed:lisnard-carnets -- [--apply] [--skip-url-check]
 *
 * Loads the propositions of the Nouvelle Énergie thematic booklets into the versioned measure
 * model, for David Lisnard's présidentielle 2027 candidacy.
 *
 * **Dry-run by default**: writing demands `--apply`, because this creates editorial content.
 *
 * **Creates drafts, never publishes.** `createMeasure()` writes at `publicationStatus = DRAFT`
 * and only `publishMeasureRevision()` can change that, after a named human has reviewed the
 * revision. That review happens in `/admin/mesures`, not here: a script has no reviewer identity
 * to record, and inventing one would make the audit trail lie about who validated the text.
 *
 * **Idempotent**: an edition is matched by its label and a proposition by its normalized text
 * against every revision the candidacy already carries, drafts included. Rerunning adds nothing,
 * and a proposition already entered by hand in the admin is not duplicated.
 */
import "dotenv/config";
import {
  LISNARD_CARNETS_SEED,
  normalizeMeasureText,
  type ProgramEditionSeed,
  type ProgramSeed,
} from "./lib/lisnard-carnets-seed";
import { USER_AGENT } from "../src/config/site";
import { db } from "../src/lib/db";
import { createProgramEdition } from "../src/lib/measures/program-editions";
import { createMeasure } from "../src/lib/measures/transitions";

type EditionReport = {
  label: string;
  editionCreated: boolean;
  created: number;
  alreadyPresent: number;
};

/**
 * The URLs are the only thing in the seed that this session could not verify: the booklets were
 * read as PDF files, and `unenouvelleenergie.fr` is unreachable from the environment the seed was
 * written in. A measure whose source cannot be checked is exactly what this project refuses to
 * publish, so the check runs where the network is, on the machine that applies the seed.
 */
async function assertUrlsResolve(seed: ProgramSeed): Promise<void> {
  const urls = new Set(
    seed.editions.flatMap((edition) => [edition.documentUrl, edition.sourceUrl])
  );
  const unreachable: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) unreachable.push(`${url} → HTTP ${response.status}`);
    } catch (error) {
      unreachable.push(`${url} → ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (unreachable.length > 0) {
    throw new Error(
      `Sources injoignables, aucune écriture :\n  ${unreachable.join("\n  ")}\n` +
        "Corriger les URL du seed (le site a pu renommer ses pages) avant de réessayer."
    );
  }
}

async function resolveCandidacy(seed: ProgramSeed): Promise<{
  candidacyId: string;
  electionId: string;
  politicianId: string;
}> {
  const election = await db.election.findUnique({
    where: { slug: seed.electionSlug },
    select: { id: true },
  });
  if (!election) throw new Error(`Élection ${seed.electionSlug} introuvable`);

  const politician = await db.politician.findUnique({
    where: { slug: seed.politicianSlug },
    select: { id: true },
  });
  if (!politician) throw new Error(`Politique ${seed.politicianSlug} introuvable`);

  const candidacy = await db.candidacy.findFirst({
    where: { electionId: election.id, politicianId: politician.id },
    select: { id: true, status: true, sourceUrl: true, sourceLabel: true },
  });
  if (!candidacy) {
    throw new Error(
      `Aucune candidature de ${seed.politicianSlug} à ${seed.electionSlug} : la créer avant de semer son programme`
    );
  }
  // Same condition as publication in the admin: an unsourced or undeclared candidacy keeps its
  // measures invisible, so the seed would create content nobody can ever publish.
  if (!candidacy.status || !candidacy.sourceUrl || !candidacy.sourceLabel) {
    throw new Error(
      "La candidature doit porter un statut et une source (URL et libellé) avant de recevoir des mesures"
    );
  }

  return { candidacyId: candidacy.id, electionId: election.id, politicianId: politician.id };
}

/** Editions are versioned per candidacy, so a new one takes the next free version. */
async function nextEditionVersion(candidacyId: string, electionId: string): Promise<number> {
  const latest = await db.programEdition.findFirst({
    where: { candidacyId, electionId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

async function seedEdition(input: {
  seed: ProgramSeed;
  edition: ProgramEditionSeed;
  context: { candidacyId: string; electionId: string; politicianId: string };
  existingTexts: Set<string>;
  dryRun: boolean;
}): Promise<EditionReport> {
  const { seed, edition, context, existingTexts, dryRun } = input;
  const report: EditionReport = {
    label: edition.label,
    editionCreated: false,
    created: 0,
    alreadyPresent: 0,
  };

  const known = await db.programEdition.findFirst({
    where: { candidacyId: context.candidacyId, label: edition.label },
    select: { id: true },
  });
  let programEditionId = known?.id ?? null;
  if (!known && !dryRun) {
    const version = await nextEditionVersion(context.candidacyId, context.electionId);
    const created = await createProgramEdition({
      electionId: context.electionId,
      ownerType: "CANDIDACY",
      partyId: null,
      candidacyId: context.candidacyId,
      label: edition.label,
      version,
      publishedAt: edition.publishedAt,
      documentUrl: edition.documentUrl,
    });
    programEditionId = created.programEditionId;
  }
  report.editionCreated = !known;

  for (const measure of edition.measures) {
    const key = normalizeMeasureText(measure.text);
    if (existingTexts.has(key)) {
      report.alreadyPresent += 1;
      continue;
    }
    // Added before the write so a duplicate inside the seed itself cannot slip through twice,
    // and so the dry-run counts exactly what an apply would create.
    existingTexts.add(key);
    report.created += 1;
    if (dryRun) continue;

    await createMeasure({
      politicianId: context.politicianId,
      electionId: context.electionId,
      candidacyId: context.candidacyId,
      programEditionId,
      attribution: seed.attribution,
      theme: measure.theme,
      precedingMeasureId: null,
      revision: {
        text: measure.text,
        precision: measure.precision,
        validFrom: seed.validFrom,
        // Transcribed by hand from the booklet, not extracted by a model: the confidence and the
        // extractor version have no meaning here and stay null rather than carrying a fake score.
        extractionMethod: "MANUAL",
        extractionConfidence: null,
        extractorVersion: null,
      },
      sources: [
        {
          sourceKind: edition.sourceKind,
          tier: "PRIMARY",
          url: edition.sourceUrl,
          page: measure.page,
          publishedAt: edition.publishedAt,
        },
      ],
    });
  }

  return report;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes("--apply");
  const skipUrlCheck = process.argv.includes("--skip-url-check");
  const seed = LISNARD_CARNETS_SEED;

  if (!skipUrlCheck) await assertUrlsResolve(seed);

  const context = await resolveCandidacy(seed);

  // Every revision the candidacy carries, drafts and published alike: deduplicating against the
  // published ones only would recreate a draft that a moderator has already rejected or is still
  // reading.
  const revisions = await db.measureRevision.findMany({
    where: { measure: { candidacyId: context.candidacyId } },
    select: { text: true },
  });
  const existingTexts = new Set(revisions.map((revision) => normalizeMeasureText(revision.text)));

  const reports: EditionReport[] = [];
  for (const edition of seed.editions) {
    reports.push(await seedEdition({ seed, edition, context, existingTexts, dryRun }));
  }

  console.log(
    `[seed-lisnard-carnets] mode ${dryRun ? "essai à blanc (aucune écriture)" : "APPLIQUÉ"}`
  );
  for (const report of reports) {
    console.log(`  ${report.label}`);
    console.log(`    édition            ${report.editionCreated ? "créée" : "déjà présente"}`);
    console.log(`    brouillons créés   ${report.created}`);
    console.log(`    déjà présentes     ${report.alreadyPresent}`);
  }
  const created = reports.reduce((total, report) => total + report.created, 0);
  console.log(`  total brouillons     ${created}`);
  if (created > 0) {
    console.log(
      "  Les mesures restent en brouillon : les relire et les publier dans /admin/mesures."
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
