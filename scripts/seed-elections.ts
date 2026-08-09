/**
 * Seed script for upcoming French elections
 *
 * Idempotent: uses upsert on slug, safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/seed-elections.ts
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import type { ElectionType, ElectionScope, SuffrageType } from "../src/generated/prisma";

interface ElectionSeed {
  slug: string;
  type: ElectionType;
  title: string;
  shortTitle: string;
  description?: string;
  scope: ElectionScope;
  round1Date: Date | null;
  round2Date: Date | null;
  dateConfirmed: boolean;
  totalSeats: number | null;
  suffrage: SuffrageType;
  registrationDeadline?: Date;
  candidacyOpenDate?: Date;
  candidacyDeadline?: Date;
  campaignStartDate?: Date;
  sourceUrl?: string;
  decreeUrl?: string;
}

export const ELECTIONS: ElectionSeed[] = [
  {
    slug: "municipales-2026",
    type: "MUNICIPALES",
    title: "Élections municipales de 2026",
    shortTitle: "Municipales 2026",
    description:
      "Les élections municipales de 2026 permettront de renouveler l'ensemble des " +
      "conseils municipaux et intercommunaux en France. Avec la réforme de 2025, toutes les " +
      "communes passeront au scrutin de liste paritaire, une première historique. " +
      "Environ 460 000 conseillers municipaux seront élus les 15 et 22 mars 2026.",
    scope: "MUNICIPAL",
    round1Date: new Date("2026-03-15"),
    round2Date: new Date("2026-03-22"),
    dateConfirmed: true,
    totalSeats: 460000,
    suffrage: "DIRECT",
    registrationDeadline: new Date("2026-02-07"),
    candidacyDeadline: new Date("2026-02-26"),
    campaignStartDate: new Date("2026-03-02"),
    sourceUrl: "https://www.service-public.fr/particuliers/vosdroits/N47",
  },
  {
    slug: "senatoriales-2026",
    type: "SENATORIALES",
    title: "Élections sénatoriales de 2026",
    shortTitle: "Sénatoriales 2026",
    description:
      "Le 27 septembre 2026, la série 2 du Sénat est renouvelée : 178 sièges sur 348, " +
      "répartis sur 64 circonscriptions. Les sénateurs y sont désignés par 93 469 grands " +
      "électeurs, dont 88 937 délégués des conseils municipaux, soit 95,2 % du collège. " +
      "Les conseils municipaux ont désigné leurs délégués le 5 juin 2026. Les candidatures " +
      "se déposent du 7 au 11 septembre 2026.",
    scope: "NATIONAL",
    // Date set by décret n° 2026-301 of 21 April 2026. The seed carried 28
    // September with dateConfirmed false: since `update` rewrites both fields
    // unconditionally, every run reinstated a wrong "provisional dates" badge on
    // top of a wrong date.
    round1Date: new Date("2026-09-27"),
    round2Date: null,
    dateConfirmed: true,
    totalSeats: 178,
    suffrage: "INDIRECT",
    candidacyOpenDate: new Date("2026-09-07"),
    candidacyDeadline: new Date("2026-09-11"),
    sourceUrl: "https://senatoriales2026.senat.fr/",
    decreeUrl: "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053925339",
  },
  {
    slug: "presidentielle-2027",
    type: "PRESIDENTIELLE",
    title: "Élection présidentielle de 2027",
    shortTitle: "Présidentielle 2027",
    scope: "NATIONAL",
    round1Date: new Date("2027-04-11"),
    round2Date: new Date("2027-04-25"),
    dateConfirmed: false,
    totalSeats: 1,
    suffrage: "DIRECT",
  },
  {
    slug: "legislatives-2029",
    type: "LEGISLATIVES",
    title: "Élections législatives de 2029",
    shortTitle: "Législatives 2029",
    scope: "NATIONAL",
    round1Date: null,
    round2Date: null,
    dateConfirmed: false,
    totalSeats: 577,
    suffrage: "DIRECT",
  },
  {
    slug: "departementales-2028",
    type: "DEPARTEMENTALES",
    title: "Élections départementales de 2028",
    shortTitle: "Départementales 2028",
    scope: "DEPARTMENTAL",
    round1Date: null,
    round2Date: null,
    dateConfirmed: false,
    totalSeats: 4056,
    suffrage: "DIRECT",
  },
  {
    slug: "regionales-2028",
    type: "REGIONALES",
    title: "Élections régionales de 2028",
    shortTitle: "Régionales 2028",
    scope: "REGIONAL",
    round1Date: null,
    round2Date: null,
    dateConfirmed: false,
    totalSeats: 1757,
    suffrage: "DIRECT",
  },
  {
    slug: "europeennes-2029",
    type: "EUROPEENNES",
    title: "Élections européennes de 2029",
    shortTitle: "Européennes 2029",
    scope: "EUROPEAN",
    round1Date: null,
    round2Date: null,
    dateConfirmed: false,
    totalSeats: 81,
    suffrage: "DIRECT",
  },
];

async function main() {
  console.log("=== Seed élections ===\n");

  let created = 0;
  let updated = 0;

  for (const election of ELECTIONS) {
    const data = {
      type: election.type,
      title: election.title,
      shortTitle: election.shortTitle,
      ...(election.description && { description: election.description }),
      scope: election.scope,
      round1Date: election.round1Date,
      round2Date: election.round2Date,
      dateConfirmed: election.dateConfirmed,
      totalSeats: election.totalSeats,
      suffrage: election.suffrage,
      ...(election.registrationDeadline && { registrationDeadline: election.registrationDeadline }),
      ...(election.candidacyOpenDate && { candidacyOpenDate: election.candidacyOpenDate }),
      ...(election.candidacyDeadline && { candidacyDeadline: election.candidacyDeadline }),
      ...(election.campaignStartDate && { campaignStartDate: election.campaignStartDate }),
      ...(election.sourceUrl && { sourceUrl: election.sourceUrl }),
      ...(election.decreeUrl && { decreeUrl: election.decreeUrl }),
    };

    const result = await db.election.upsert({
      where: { slug: election.slug },
      create: { slug: election.slug, ...data },
      update: data,
    });

    // Check if it was newly created (createdAt === updatedAt means just created)
    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    if (isNew) {
      created++;
      console.log(`  + ${election.shortTitle} (créée)`);
    } else {
      updated++;
      console.log(`  ~ ${election.shortTitle} (mise à jour)`);
    }
  }

  console.log(`\nTerminé : ${created} créées, ${updated} mises à jour`);
}

// Guarded so importing this module (for the seed-data regression test) never
// touches the database: main() only runs when this file is the process entry point.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Erreur:", error);
      process.exit(1);
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
