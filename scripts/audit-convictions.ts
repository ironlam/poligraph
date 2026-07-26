/**
 * Audit des condamnations publiées — niveau de preuve et file de travail (#566).
 *
 * STRICTEMENT EN LECTURE SEULE sur la base. Le script classe, priorise et découpe
 * en lots ; il n'écrit jamais une affaire. Les corrections passent par
 * `AffairUpdateProposal` ou par la modération, jamais par ici.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/audit-convictions.ts                 # métrique + file
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --batch         # prochain lot
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --batch --size=25
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --done=id1,id2  # marque traité
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --report        # avant/après
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../src/lib/db.js";
import type { AffairStatus } from "../src/generated/prisma";
import {
  ADVERSE_INVOLVEMENTS,
  assess,
  hasPreciseSentence,
  parseLedger,
  type EvidenceLevel,
  type Ledger,
} from "../src/lib/affairs/audit-evidence.js";

const LEDGER = path.join(process.cwd(), "data", "audit-convictions.json");
const DEFAULT_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 25;

/** Statuts de condamnation. Repris explicitement : une valeur ajoutée à l'enum doit
 *  être arbitrée ici plutôt que d'entrer dans l'audit par surprise. */
const CONVICTION_STATUSES: AffairStatus[] = [
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "POURVOI_EN_CASSATION",
  "CONDAMNATION_DEFINITIVE",
];

function readLedger(): Ledger {
  if (!fs.existsSync(LEDGER)) return { done: [] };
  try {
    return parseLedger(JSON.parse(fs.readFileSync(LEDGER, "utf8")));
  } catch {
    console.error(`Registre illisible (${LEDGER}), il faut le corriger à la main.`);
    process.exit(1);
  }
}

function writeLedger(ledger: Ledger): void {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const wantBatch = args.includes("--batch");
  const wantReport = args.includes("--report");
  const doneArg = args.find((a) => a.startsWith("--done="));
  const sizeArg = args.find((a) => a.startsWith("--size="));

  const size = Math.min(
    MAX_BATCH_SIZE,
    Math.max(MIN_BATCH_SIZE, Number(sizeArg?.split("=")[1] ?? DEFAULT_BATCH_SIZE))
  );

  const ledger = readLedger();

  if (doneArg) {
    const ids = doneArg
      .split("=")[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const before = ledger.done.length;
    // Idempotent : un identifiant déjà présent n'est pas ajouté deux fois.
    ledger.done = [...new Set([...ledger.done, ...ids])];
    writeLedger(ledger);
    console.log(`Registre : ${before} → ${ledger.done.length} affaire(s) examinée(s).`);
    return;
  }

  const affairs = await db.affair.findMany({
    where: { publicationStatus: "PUBLISHED", status: { in: CONVICTION_STATUSES } },
    select: {
      id: true,
      slug: true,
      status: true,
      involvement: true,
      verdictDate: true,
      description: true,
      prisonMonths: true,
      fineAmount: true,
      ineligibilityMonths: true,
      politician: {
        select: {
          fullName: true,
          _count: { select: { mandates: { where: { isCurrent: true } } } },
        },
      },
      sources: {
        select: { url: true, title: true, publisher: true, publishedAt: true, sourceType: true },
      },
      _count: { select: { courtDecisions: true } },
    },
  });

  const rows = affairs.map((a) => {
    const assessment = assess({
      status: a.status,
      involvement: a.involvement,
      verdictDate: a.verdictDate,
      description: a.description,
      prisonMonths: a.prisonMonths,
      fineAmount: a.fineAmount,
      ineligibilityMonths: a.ineligibilityMonths,
      sources: a.sources,
      decisionCount: a._count.courtDecisions,
    });
    return {
      id: a.id,
      slug: a.slug,
      status: a.status,
      involvement: a.involvement,
      name: a.politician.fullName,
      inOffice: a.politician._count.mandates > 0,
      verdictDate: a.verdictDate,
      preciseSentence: hasPreciseSentence(a),
      sourceCount: a.sources.length,
      ...assessment,
    };
  });

  const distribution = (subset: typeof rows) =>
    subset.reduce((acc, r) => ({ ...acc, [r.level]: acc[r.level] + 1 }), {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
    } as Record<EvidenceLevel, number>);

  const dist = distribution(rows);
  // Two different questions, deliberately kept apart. The first asks whether a
  // reader can click an official source on the page; the second asks whether
  // anything official backs the affair at all, a linked decision included.
  const withoutOfficialSourceRow = rows.filter((r) => !r.hasOfficialSource).length;
  const withoutOfficialEvidence = rows.filter((r) => !r.hasOfficialEvidence).length;

  console.log(`\n${rows.length} condamnations publiées examinées.\n`);
  console.log("Niveau de preuve :");
  for (const level of ["A", "B", "C", "D"] as const) {
    console.log(`  ${level} : ${dist[level]}`);
  }
  console.log(`\nSans preuve officielle (métrique principale) : ${withoutOfficialEvidence}`);
  console.log(`Sans ligne Source officielle (complétude éditoriale) : ${withoutOfficialSourceRow}`);

  // Point de comparaison figé au premier passage.
  if (!ledger.baseline) {
    ledger.baseline = {
      ...dist,
      withoutOfficialSource: withoutOfficialSourceRow,
      capturedAt: new Date().toISOString(),
    };
    writeLedger(ledger);
    console.log("Référence enregistrée dans le registre (premier passage).");
  }

  // Capture séparée : un registre antérieur à cette métrique n'a pas d'historique
  // pour elle, et lui en fabriquer un rétroactivement serait une invention.
  const evidenceBaselineIsNew = !ledger.evidenceBaseline;
  if (evidenceBaselineIsNew) {
    ledger.evidenceBaseline = {
      withoutOfficialEvidence,
      capturedAt: new Date().toISOString(),
    };
    writeLedger(ledger);
  }

  if (wantReport && ledger.baseline) {
    const b = ledger.baseline;
    console.log(`\nAvant / après (référence du ${b.capturedAt.slice(0, 10)}) :`);
    for (const level of ["A", "B", "C", "D"] as const) {
      const delta = dist[level] - b[level];
      console.log(`  ${level} : ${b[level]} → ${dist[level]} (${delta >= 0 ? "+" : ""}${delta})`);
    }
    const deltaSourceRow = withoutOfficialSourceRow - b.withoutOfficialSource;
    console.log(
      `  sans ligne Source officielle : ${b.withoutOfficialSource} → ${withoutOfficialSourceRow} (${deltaSourceRow >= 0 ? "+" : ""}${deltaSourceRow})`
    );

    const eb = ledger.evidenceBaseline!;
    if (evidenceBaselineIsNew) {
      console.log(
        `  sans preuve officielle : ${withoutOfficialEvidence} (référence prise aujourd'hui, pas d'historique)`
      );
    } else {
      const deltaEvidence = withoutOfficialEvidence - eb.withoutOfficialEvidence;
      console.log(
        `  sans preuve officielle : ${eb.withoutOfficialEvidence} → ${withoutOfficialEvidence} (${deltaEvidence >= 0 ? "+" : ""}${deltaEvidence}, référence du ${eb.capturedAt.slice(0, 10)})`
      );
    }

    console.log(
      `\nCritère de succès : ${dist.D === 0 ? "ATTEINT" : `${dist.D} affaire(s) en niveau D`}`
    );
  }

  // File priorisée. L'ordre des critères est celui de #566.
  const done = new Set(ledger.done);
  const queue = rows
    .filter((r) => !done.has(r.id))
    .sort((x, y) => {
      const rank = (r: typeof x) => [
        r.contradictions.length > 0 ? 0 : 1,
        ADVERSE_INVOLVEMENTS.includes(r.involvement) ? 1 : 0,
        r.preciseSentence ? 0 : 1,
        -(r.verdictDate?.getTime() ?? 0),
        r.inOffice ? 0 : 1,
      ];
      const a = rank(x);
      const b = rank(y);
      for (let i = 0; i < a.length; i++) {
        if (a[i]! !== b[i]!) return a[i]! - b[i]!;
      }
      return x.slug.localeCompare(y.slug);
    });

  console.log(`\nFile : ${queue.length} à examiner, ${done.size} déjà examinée(s).`);
  const urgent = queue.filter((r) => r.contradictions.length > 0);
  if (urgent.length) {
    console.log(`\nREVUE URGENTE — ${urgent.length} affaire(s) contradictoires :`);
    for (const r of urgent) {
      console.log(`  [${r.level}] ${r.name} — /affaires/${r.slug}`);
      for (const c of r.contradictions) console.log(`        ${c}`);
    }
  }

  if (wantBatch) {
    const batch = queue.slice(0, size);
    console.log(`\n=== LOT DE ${batch.length} (taille demandée ${size}) ===`);
    for (const r of batch) {
      console.log(
        [
          `[${r.level}]`,
          r.status.padEnd(32),
          r.involvement.padEnd(14),
          `src=${String(r.sourceCount).padStart(2)}`,
          `indep=${r.independentCount}`,
          r.preciseSentence ? "peine chiffrée" : "sans chiffre  ",
          r.name,
        ].join(" | ")
      );
      console.log(`      /affaires/${r.slug}   id=${r.id}`);
    }
    if (queue.length > batch.length) {
      console.log(
        `\n${queue.length - batch.length} affaire(s) restent hors de ce lot : la couverture est bornée ici, pas complète.`
      );
    }
    console.log(
      `\nUne fois le lot traité :\n  npx tsx --env-file=.env scripts/audit-convictions.ts --done=${batch.map((b) => b.id).join(",")}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
