/**
 * Repasse en brouillon les affaires publiées qui ne satisfont pas les règles
 * de publication en vigueur (RGPD art. 10).
 *
 * Critère, dans cet ordre :
 *   1. publicationStatus PUBLISHED et verifiedBy null
 *      → aucune trace de validation humaine, quelle que soit verifiedAt.
 *   2. publicationStatus PUBLISHED mais checkPublishable() renvoie des motifs
 *      de blocage → l'affaire ne passerait pas le garde aujourd'hui.
 *
 * Les affaires concernées repassent en DRAFT avec verifiedAt et verifiedBy
 * remis à null, et rejoignent la file de modération. Rien n'est supprimé :
 * l'opération est réversible via le parcours de modération normal.
 *
 * SÉCURITÉ : dry-run par défaut. Aucune écriture sans --confirm explicite.
 *
 * Usage :
 *   npx dotenv -e .env -- npx tsx scripts/remediate-unverified-published-affairs.ts
 *   npx dotenv -e .env -- npx tsx scripts/remediate-unverified-published-affairs.ts --confirm
 *
 * Options :
 *   --confirm        Applique réellement les changements (sinon simulation)
 *   --limit=N        Limite le nombre d'affaires traitées
 *   --json=chemin    Écrit le rapport détaillé en JSON
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { db } from "../src/lib/db";
import { checkPublishable, type PublishBlockReason } from "../src/lib/affairs/publish-guard";

interface Candidate {
  id: string;
  slug: string;
  title: string;
  status: string;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  sourceTypes: string[];
  reasons: string[];
}

function parseArg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const limitRaw = parseArg("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const jsonPath = parseArg("json");

  if (limitRaw !== undefined && (!Number.isFinite(limit) || (limit as number) <= 0)) {
    console.error(`--limit invalide : "${limitRaw}"`);
    process.exit(1);
  }

  console.log("\n=== Remédiation : affaires publiées sans validation humaine ===");
  console.log(
    confirm ? "MODE : APPLICATION RÉELLE\n" : "MODE : simulation (--confirm pour appliquer)\n"
  );

  const published = await db.affair.findMany({
    where: { publicationStatus: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      verifiedAt: true,
      verifiedBy: true,
      sources: { select: { sourceType: true } },
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`${published.length} affaire(s) publiée(s) examinée(s).`);

  const candidates: Candidate[] = [];

  for (const affair of published) {
    const reasons: string[] = [];

    if (affair.verifiedBy === null) {
      reasons.push(
        affair.verifiedAt !== null
          ? "verifiedAt renseigné mais verifiedBy null (validation incomplète)"
          : "verifiedBy null (aucune validation humaine tracée)"
      );
    }

    // Le garde de publication reste la source de vérité : on lui redemande
    // si l'affaire serait publiable aujourd'hui, plutôt que de réimplémenter
    // ses règles ici et de risquer une divergence.
    let guardReasons: PublishBlockReason[] = [];
    try {
      guardReasons = await checkPublishable(affair.id);
    } catch (error) {
      reasons.push(
        `garde de publication inexécutable : ${error instanceof Error ? error.message : String(error)}`
      );
    }
    for (const r of guardReasons) {
      reasons.push(r.code === "NO_SOURCE" ? "aucune source vérifiable" : r.message);
    }

    if (reasons.length > 0) {
      candidates.push({
        id: affair.id,
        slug: affair.slug,
        title: affair.title,
        status: affair.status,
        verifiedAt: affair.verifiedAt,
        verifiedBy: affair.verifiedBy,
        sourceTypes: [...new Set(affair.sources.map((s) => s.sourceType))],
        reasons,
      });
    }
  }

  if (candidates.length === 0) {
    console.log("\n✓ Aucune affaire à dépublier.");
    await db.$disconnect();
    return;
  }

  console.log(`\n${candidates.length} affaire(s) à dépublier vers DRAFT :\n`);
  console.table(
    candidates.map((c) => ({
      slug: c.slug.slice(0, 50),
      status: c.status,
      sources: c.sourceTypes.join(",") || "(aucune)",
      motifs: c.reasons.length,
    }))
  );

  // Ventilation par motif, pour situer d'un coup d'œil l'origine dominante.
  const byReason = new Map<string, number>();
  for (const c of candidates) {
    for (const r of c.reasons) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  }
  console.log("\nVentilation par motif :");
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }

  const wikidataOnly = candidates.filter(
    (c) => c.sourceTypes.length === 1 && c.sourceTypes[0] === "WIKIDATA"
  ).length;
  console.log(`\nDont sourcées uniquement par Wikidata : ${wikidataOnly}`);

  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(
      jsonPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2)
    );
    console.log(`\nRapport JSON écrit : ${jsonPath}`);
  }

  if (!confirm) {
    console.log(
      `\n[SIMULATION] ${candidates.length} affaire(s) repasseraient en DRAFT. ` +
        "Relancez avec --confirm pour appliquer."
    );
    await db.$disconnect();
    return;
  }

  let updated = 0;
  for (const c of candidates) {
    // Statut et champs de validation remis à zéro dans la même écriture :
    // un verifiedAt résiduel rendrait l'affaire indiscernable d'une affaire
    // validée lors d'un audit ultérieur.
    await db.affair.update({
      where: { id: c.id },
      data: { publicationStatus: "DRAFT", verifiedAt: null, verifiedBy: null },
    });

    await db.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Affair",
        entityId: c.id,
        changes: {
          remediation: "unverified-publication",
          from: "PUBLISHED",
          to: "DRAFT",
          previousVerifiedAt: c.verifiedAt?.toISOString() ?? null,
          previousVerifiedBy: c.verifiedBy,
          reasons: c.reasons,
        },
      },
    });

    updated++;
  }

  console.log(`\n✓ ${updated} affaire(s) dépubliée(s) vers DRAFT, tracées dans AuditLog.`);
  console.log("  Elles sont désormais dans la file de modération pour revue humaine.");

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
