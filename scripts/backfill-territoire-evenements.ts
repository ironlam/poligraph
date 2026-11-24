/**
 * One-shot: fills the "fil du territoire" with the dated facts of 2026 the site already shows
 * (Territoires v2, lot B). The producers only write a change seen between two imports, so the
 * table started empty. To delete in the PR that follows its run (AGENTS.md, "What belongs in
 * scripts/").
 *
 *   npx tsx scripts/backfill-territoire-evenements.ts            preview, writes nothing
 *   npx tsx scripts/backfill-territoire-evenements.ts --write    writes, once per dedupeKey
 *
 * Purges no cache.
 */

import "dotenv/config";
import { db } from "@/lib/db";
import { DEPARTMENTS } from "@/config/departments";
import { phraseEvenement, territoireEvenementSchema } from "@/lib/territoires/evenements";
import {
  recordEvenements,
  resultatElectionEvenement,
  type EvenementDraft,
} from "@/services/sync/territoire-evenements";

const WRITE = process.argv.includes("--write");
// The register often carries the day of the ballot instead of the day the council elected its
// mayor (2 663 mayors on 15 March, 149 on 22 March where a second round was held). A date before
// the first council meetings that can follow the deciding round is left out, like a missing one.
const FIRST_COUNCILS = {
  afterRound1: new Date("2026-03-20T00:00:00Z"),
  afterRound2: new Date("2026-03-27T00:00:00Z"),
};
const fr = (n: number) => n.toLocaleString("fr-FR");
const day = (d: Date) => d.toISOString().slice(0, 10);

const RNE_SOURCE = {
  sourceLabel: "Répertoire national des élus, ministère de l'Intérieur",
  sourceUrl: "https://www.data.gouv.fr/datasets/repertoire-national-des-elus-1",
};
const MUNICIPALES_SOURCE = {
  sourceLabel: "Ministère de l'Intérieur, résultats des élections municipales 2026 (data.gouv.fr)",
  url: {
    1: "https://www.data.gouv.fr/datasets/elections-municipales-2026-resultats-du-premier-tour",
    2: "https://www.data.gouv.fr/datasets/elections-municipales-2026-resultats-du-second-tour",
  },
};
const SENATORIALES_SOURCE = {
  sourceLabel: "Ministère de l'Intérieur, résultats des sénatoriales 2026",
  sourceUrl: "https://www.resultats-elections.interieur.gouv.fr/Senatoriales2026/index.html",
};

/**
 * Mayors in office whose function started from the first council meetings of 2026 on. Same key as
 * `maireChangeEvenement`, so a later register import cannot write the same day twice. Published
 * under the rule of `maireChangeDrafts`: one current mayor in the commune, on a public profile.
 */
async function maires(): Promise<EvenementDraft[]> {
  const holders = await db.mandate.findMany({
    where: { type: "MAIRE", isCurrent: true, localData: { communeId: { not: null } } },
    select: {
      politician: { select: { fullName: true, publicationStatus: true } },
      localData: { select: { communeId: true, functionStart: true } },
    },
  });
  const secondRound = new Set(
    (
      await db.communeElectionRound.findMany({
        where: { election: { slug: "municipales-2026" }, round: 2 },
        select: { communeId: true },
      })
    ).map((r) => r.communeId)
  );
  const perCommune = new Map<string, number>();
  for (const h of holders) {
    const id = h.localData!.communeId!;
    perCommune.set(id, (perCommune.get(id) ?? 0) + 1);
  }
  const drafts: EvenementDraft[] = [];
  for (const h of holders) {
    const { communeId, functionStart } = h.localData!;
    if (!communeId || !functionStart) continue;
    const { afterRound1, afterRound2 } = FIRST_COUNCILS;
    if (functionStart < (secondRound.has(communeId) ? afterRound2 : afterRound1)) continue;
    const shown = perCommune.get(communeId) === 1 && h.politician.publicationStatus === "PUBLISHED";
    drafts.push({
      territoryType: "COM",
      territoryCode: communeId,
      occurredOn: functionStart,
      payload: { type: "ELECTION_MAIRE", nom: h.politician.fullName },
      ...RNE_SOURCE,
      status: shown ? "PUBLISHED" : "DRAFT",
      dedupeKey: `maire:${communeId}:${day(functionStart)}`,
    });
  }
  return drafts;
}

/** One line per commune and round of the 2026 municipal results, as the commune page shows. */
async function resultatsMunicipales(): Promise<EvenementDraft[]> {
  const election = await db.election.findUniqueOrThrow({
    where: { slug: "municipales-2026" },
    select: { id: true, slug: true, title: true, round1Date: true, round2Date: true },
  });
  const rounds = await db.communeElectionRound.findMany({
    where: { electionId: election.id },
    select: { communeId: true, round: true },
  });
  const drafts: EvenementDraft[] = [];
  for (const r of rounds) {
    const tour = r.round === 1 ? 1 : r.round === 2 ? 2 : null;
    const roundDate = tour === 1 ? election.round1Date : election.round2Date;
    if (!tour || !roundDate) continue;
    drafts.push(
      resultatElectionEvenement({
        inseeCode: r.communeId,
        electionSlug: election.slug,
        electionLabel: election.title,
        tour,
        roundDate,
        sourceLabel: MUNICIPALES_SOURCE.sourceLabel,
        sourceUrl: MUNICIPALES_SOURCE.url[tour],
      })
    );
  }
  return drafts;
}

/**
 * One line per department renewed on 27 September 2026, counted on the elected candidacies of
 * the Ministry feed (the list /elections/senatoriales-2026 shows), not on current mandates: a
 * seat can have changed hands since. Constituencies without a department page are left out.
 */
async function senatoriales(): Promise<EvenementDraft[]> {
  const election = await db.election.findUniqueOrThrow({
    where: { slug: "senatoriales-2026" },
    select: { id: true, slug: true, title: true, round1Date: true },
  });
  if (!election.round1Date) return [];
  const elected = await db.candidacy.findMany({
    where: { electionId: election.id, isElected: true },
    take: 200,
    select: { constituencyCode: true },
  });
  const sieges = new Map<string, number>();
  for (const { constituencyCode } of elected) {
    if (!constituencyCode || !(constituencyCode in DEPARTMENTS)) continue;
    sieges.set(constituencyCode, (sieges.get(constituencyCode) ?? 0) + 1);
  }
  return [...sieges].map(([code, n]) => ({
    territoryType: "DEP" as const,
    territoryCode: code,
    occurredOn: election.round1Date!,
    payload: {
      type: "ELECTION_SENATEURS" as const,
      electionSlug: election.slug,
      electionLabel: election.title,
      sieges: n,
    },
    ...SENATORIALES_SOURCE,
    status: "PUBLISHED" as const,
    dedupeKey: `senatoriales:${election.slug}:${code}`,
  }));
}

async function main() {
  const drafts = [
    ...(await maires()),
    ...(await resultatsMunicipales()),
    ...(await senatoriales()),
  ];

  const counts = new Map<string, number>();
  const samples = new Map<string, EvenementDraft>();
  let invalid = 0;
  for (const d of drafts) {
    if (!territoireEvenementSchema.safeParse(d.payload).success) invalid++;
    const key = `${d.payload.type} ${d.territoryType} ${d.status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!samples.has(key)) samples.set(key, d);
  }
  const keys = new Set(drafts.map((d) => d.dedupeKey));
  const before = await db.territoireEvenement.count();

  console.log(`Événements à écrire : ${fr(drafts.length)} (${fr(keys.size)} clés distinctes)`);
  for (const [key, n] of [...counts].sort()) {
    const s = samples.get(key)!;
    console.log(`  ${key.padEnd(34)} ${fr(n).padStart(7)}`);
    console.log(
      `      ex. ${s.territoryCode}, ${day(s.occurredOn)} : ${phraseEvenement(s.payload)}`
    );
  }
  console.log(`Contenus refusés par le schéma : ${fr(invalid)}`);
  console.log(`Lignes déjà en base : ${fr(before)}`);

  if (!WRITE) {
    console.log("\nAperçu : rien n'a été écrit. Relancer avec --write pour écrire.");
    return;
  }

  const result = await recordEvenements(drafts);
  const after = await db.territoireEvenement.count();
  console.log(
    `\nÉcrit : ${fr(result.written)} lignes, ${fr(result.rejected)} écartées. En base : ${fr(after)}.`
  );
  // `recordEvenements` never throws: an interrupted write shows only in this count.
  if (after < keys.size - invalid) {
    process.exitCode = 1;
    console.error("Écriture incomplète : relancer, la clé d'idempotence évite les doublons.");
  }
}

main()
  .catch((err) => {
    console.error("Erreur :", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
