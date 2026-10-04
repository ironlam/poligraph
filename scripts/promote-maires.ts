import "dotenv/config";
import { db } from "../src/lib/db.js";
import { PublicationStatus } from "../src/generated/prisma/index.js";
import { requestProfileRefresh } from "../src/lib/politicians/profile-snapshot/request.js";

interface PromoteStats {
  eligible: number;
  promoted: number;
  belowThreshold: number;
}

function computeCompleteness(politician: {
  birthDate: Date | null;
  currentPartyId: string | null;
  photoUrl: string | null;
  biography: string | null;
  externalIds: { source: string }[];
}): number {
  let score = 0;
  if (politician.birthDate) score++;
  if (politician.currentPartyId) score++;
  if (politician.photoUrl) score++;
  if (politician.biography && politician.biography.length > 50) score++;
  if (politician.externalIds.some((e) => e.source === "WIKIDATA")) score++;
  if (politician.externalIds.some((e) => e.source === "HATVP")) score++;
  return score;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const minPopArg = args.find((a) => a.startsWith("--min-population="));
  const minPop = minPopArg ? parseInt(minPopArg.split("=")[1]!) : 20000;
  const minScoreArg = args.find((a) => a.startsWith("--min-score="));
  const minScore = minScoreArg ? parseInt(minScoreArg.split("=")[1]!) : 2;

  console.log("=== Promote Maires ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Min population: ${minPop.toLocaleString()}`);
  console.log(`Min completeness score: ${minScore}/6`);
  console.log("");

  const draftMaires = await db.politician.findMany({
    where: {
      publicationStatus: "DRAFT",
      mandates: { some: { type: "MAIRE", isCurrent: true } },
    },
    select: {
      id: true,
      fullName: true,
      slug: true,
      birthDate: true,
      currentPartyId: true,
      photoUrl: true,
      biography: true,
      externalIds: { select: { source: true } },
      _count: { select: { externalIds: true } },
      mandates: {
        where: { type: "MAIRE", isCurrent: true },
        select: {
          localData: {
            select: {
              commune: { select: { name: true, population: true } },
            },
          },
        },
        take: 1,
      },
    },
  });

  const stats: PromoteStats = { eligible: 0, promoted: 0, belowThreshold: 0 };

  const inStrata = draftMaires.filter(
    (m) => (m.mandates[0]?.localData?.commune?.population ?? 0) >= minPop
  );
  stats.eligible = inStrata.length;

  console.log(`DRAFT maires in strata (pop >= ${minPop.toLocaleString()}): ${inStrata.length}`);

  const toPromote: typeof inStrata = [];
  const belowThreshold: typeof inStrata = [];

  for (const m of inStrata) {
    const score = computeCompleteness(m);
    if (score >= minScore) {
      toPromote.push(m);
    } else {
      belowThreshold.push(m);
    }
  }

  stats.belowThreshold = belowThreshold.length;
  console.log(`Qualifying (score >= ${minScore}): ${toPromote.length}`);
  console.log(`Below threshold: ${belowThreshold.length}`);

  if (toPromote.length > 0) {
    console.log("\nSample (first 10):");
    for (const m of toPromote.slice(0, 10)) {
      const commune = m.mandates[0]?.localData?.commune;
      const score = computeCompleteness(m);
      console.log(
        `  ${m.fullName.padEnd(30)} ${(commune?.name ?? "?").padEnd(25)} pop:${(commune?.population ?? 0).toString().padStart(7)} score:${score}/6`
      );
    }
  }

  if (dryRun) {
    console.log("\n[DRY RUN] No changes applied.");
    await db.$disconnect();
    return;
  }

  if (toPromote.length === 0) {
    console.log("\nNo mayors to promote.");
    await db.$disconnect();
    return;
  }

  const ids = toPromote.map((m) => m.id);
  const result = await db.politician.updateMany({
    where: { id: { in: ids } },
    data: { publicationStatus: PublicationStatus.PUBLISHED },
  });

  stats.promoted = result.count;
  console.log(`\nPromoted ${stats.promoted} maires to PUBLISHED`);
  await requestProfileRefresh({ politicianIds: ids }, "cli:promote-maires");

  await db.$disconnect();
}
main().catch(console.error);
