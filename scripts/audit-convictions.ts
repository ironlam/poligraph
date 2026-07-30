/**
 * Audit des condamnations publiées — niveau de preuve et file de travail (#566).
 *
 * STRICTEMENT EN LECTURE SEULE sur la base. Le script classe, priorise et découpe
 * en lots ; il n'écrit jamais une affaire. Les corrections passent par
 * `AffairUpdateProposal` ou par la modération, jamais par ici.
 *
 * Deux axes, délibérément séparés. Le niveau de preuve dit ce que le monde publie
 * sur cette affaire ; les contradictions disent ce que nous avons mal saisi. Les
 * confondre sur un seul axe masquait 11 fiches déjà étayées au niveau C.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/audit-convictions.ts                 # métrique + file
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --report        # + comparaison
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --batch         # prochain lot
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --batch --size=25
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --resolved=id1,id2
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --transferred=id1 --issue=571
 *   npx tsx --env-file=.env scripts/audit-convictions.ts --recapture     # fige une référence
 */
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../src/lib/db.js";
import type { AffairStatus } from "../src/generated/prisma";
import { RULES } from "../src/lib/affairs/grading-rules.js";
import {
  ADVERSE_INVOLVEMENTS,
  assess,
  hasPreciseSentence,
  isComparable,
  parseLedger,
  type ContradictionKind,
  type EvidenceLevel,
  type Ledger,
  type ReviewEntry,
  type ReviewOutcome,
} from "../src/lib/affairs/audit-evidence.js";

const LEDGER = path.join(process.cwd(), "data", "audit-convictions.json");
const DEFAULT_BATCH_SIZE = 20;
const MIN_BATCH_SIZE = 15;
const MAX_BATCH_SIZE = 25;
const LEVELS = ["A", "B", "C", "D"] as const;

/** Statuts de condamnation. Repris explicitement : une valeur ajoutée à l'enum doit
 *  être arbitrée ici plutôt que d'entrer dans l'audit par surprise. */
const CONVICTION_STATUSES: AffairStatus[] = [
  "CONDAMNATION_PREMIERE_INSTANCE",
  "APPEL_EN_COURS",
  "POURVOI_EN_CASSATION",
  "CONDAMNATION_DEFINITIVE",
];

function readLedger(): Ledger {
  if (!fs.existsSync(LEDGER)) return { reviewed: [] };
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

function idsFrom(arg: string): string[] {
  return arg
    .split("=")[1]!
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Ajoute des entrées sans dupliquer : une affaire déjà sortie de la file y reste. */
function record(ledger: Ledger, ids: string[], outcome: ReviewOutcome): number {
  const known = new Set(ledger.reviewed.map((e) => e.affairId));
  const fresh: ReviewEntry[] = ids
    .filter((affairId) => !known.has(affairId))
    .map((affairId) => ({ affairId, outcome, at: new Date().toISOString() }));
  ledger.reviewed = [...ledger.reviewed, ...fresh];
  return fresh.length;
}

async function main() {
  const args = process.argv.slice(2);
  const wantBatch = args.includes("--batch");
  const wantReport = args.includes("--report");
  const wantRecapture = args.includes("--recapture");
  const resolvedArg = args.find((a) => a.startsWith("--resolved="));
  const transferredArg = args.find((a) => a.startsWith("--transferred="));
  const issueArg = args.find((a) => a.startsWith("--issue="));
  const sizeArg = args.find((a) => a.startsWith("--size="));

  // `--done=` ne disait pas pourquoi l'affaire sortait de la file, et c'est
  // exactement ce qui a fait disparaître 10 fiches contradictoires de la revue.
  // Le faire signifier silencieusement l'un des deux nouveaux motifs rejouerait
  // la confusion qu'on retire.
  if (args.some((a) => a.startsWith("--done="))) {
    console.error(
      "--done= n'existe plus : il ne disait pas pourquoi l'affaire sortait de la file.\n" +
        "  --resolved=id1,id2                 affaire corrigée\n" +
        "  --transferred=id1,id2 --issue=571  affaire confiée à une issue"
    );
    process.exit(1);
  }

  const size = Math.min(
    MAX_BATCH_SIZE,
    Math.max(MIN_BATCH_SIZE, Number(sizeArg?.split("=")[1] ?? DEFAULT_BATCH_SIZE))
  );

  const ledger = readLedger();

  if (resolvedArg || transferredArg) {
    if (transferredArg && !issueArg) {
      console.error("--transferred= exige --issue=N : une affaire confiée sans destinataire");
      console.error("est une affaire perdue, pas une affaire traitée.");
      process.exit(1);
    }
    let added = 0;
    if (resolvedArg) added += record(ledger, idsFrom(resolvedArg), { kind: "RESOLVED" });
    if (transferredArg) {
      const issue = Number(issueArg!.split("=")[1]);
      if (!Number.isInteger(issue) || issue <= 0) {
        console.error(`--issue=${issueArg!.split("=")[1]} n'est pas un numéro d'issue.`);
        process.exit(1);
      }
      added += record(ledger, idsFrom(transferredArg), { kind: "TRANSFERRED", issue });
    }
    writeLedger(ledger);
    console.log(`Registre : ${added} entrée(s) ajoutée(s), ${ledger.reviewed.length} au total.`);
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
      prisonSuspended: true,
      sentence: true,
      otherSentence: true,
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
      prisonSuspended: a.prisonSuspended,
      sentence: a.sentence,
      otherSentence: a.otherSentence,
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
  type Row = (typeof rows)[number];

  const evidenceDist = rows.reduce(
    (acc, r) => ({ ...acc, [r.evidenceLevel]: acc[r.evidenceLevel] + 1 }),
    { A: 0, B: 0, C: 0, D: 0 } as Record<EvidenceLevel, number>
  );
  const contradictory = rows.filter((r) => r.contradictions.length > 0);
  // Two different questions, deliberately kept apart. The first asks whether a
  // reader can click an official source on the page; the second asks whether
  // anything official backs the affair at all, a linked decision included.
  const withoutOfficialSourceRow = rows.filter((r) => !r.hasOfficialSource).length;
  const withoutOfficialEvidence = rows.filter((r) => !r.hasOfficialEvidence).length;

  const sufficient = (r: Row) => r.evidenceLevel !== "D";
  const cross = (evidenceOk: boolean, coherent: boolean) =>
    rows.filter((r) => sufficient(r) === evidenceOk && (r.contradictions.length === 0) === coherent)
      .length;

  console.log(`\n${rows.length} condamnations publiées examinées.\n`);
  console.log("PREUVE       " + LEVELS.map((l) => `${l}=${evidenceDist[l]}`).join("   "));
  console.log(`COHÉRENCE    ${contradictory.length} fiche(s) contradictoire(s)`);

  console.log("\ncroisement :");
  console.log(`  preuve suffisante   + contradictoire : ${cross(true, false)}   (édition seule)`);
  console.log(`  preuve insuffisante + contradictoire : ${cross(false, false)}`);
  console.log(`  preuve insuffisante + cohérente      : ${cross(false, true)}`);
  console.log(`  preuve suffisante   + cohérente      : ${cross(true, true)}`);

  console.log(`\nsans preuve officielle        : ${withoutOfficialEvidence}`);
  console.log(`sans ligne Source officielle  : ${withoutOfficialSourceRow}`);

  // Une fiche peut porter deux contradictions, donc ce total ne peut pas égaler le
  // nombre de fiches. La sortie le dit pour qu'un écart ne se lise pas comme un bug.
  const perKind = new Map<ContradictionKind, number>();
  for (const r of rows) {
    for (const c of r.contradictions) perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1);
  }
  if (perKind.size) {
    const occurrences = [...perKind.values()].reduce((a, b) => a + b, 0);
    console.log(
      `\nCONTRADICTIONS PAR TYPE — ${occurrences} occurrence(s) sur ${contradictory.length} fiche(s)`
    );
    for (const [kind, n] of [...perKind].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${kind}`);
    }
  }

  if (wantReport) {
    if (isComparable(ledger.baseline, RULES.version)) {
      const b = ledger.baseline!;
      console.log(
        `\nAvant / après (référence du ${b.capturedAt.slice(0, 10)}, règles v${b.rulesVersion}) :`
      );
      for (const level of LEVELS) {
        const delta = evidenceDist[level] - b.evidence[level];
        console.log(
          `  ${level} : ${b.evidence[level]} → ${evidenceDist[level]} (${delta >= 0 ? "+" : ""}${delta})`
        );
      }
      const deltas: Array<[string, number, number]> = [
        ["contradictions", b.contradictoryCount, contradictory.length],
        ["sans preuve officielle", b.withoutOfficialEvidence, withoutOfficialEvidence],
        ["sans ligne Source officielle", b.withoutOfficialSource, withoutOfficialSourceRow],
      ];
      for (const [label, before, after] of deltas) {
        const d = after - before;
        console.log(`  ${label} : ${before} → ${after} (${d >= 0 ? "+" : ""}${d})`);
      }
    } else {
      console.log("\nRÉFÉRENCE NON COMPARABLE");
      if (ledger.baseline) {
        console.log(
          `  Référence du ${ledger.baseline.capturedAt.slice(0, 10)} prise sous les règles v${ledger.baseline.rulesVersion}, les règles courantes sont v${RULES.version}.`
        );
      } else {
        console.log("  Aucune référence versionnée : la précédente a été prise avant que les");
        console.log("  règles ne soient versionnées, donc on ne sait pas sous quelles règles.");
      }
      console.log("  Aucun delta n'est calculé : les niveaux ne sont pas commensurables.");
      console.log("  Figer une nouvelle référence : --recapture");
    }

    console.log("\nCRITÈRES DE #566");
    console.log(
      `  cohérence : ${contradictory.length} contradiction(s)         (sous notre contrôle)`
    );
    console.log(
      `  preuve    : ${evidenceDist.D} fiche(s) insuffisante(s)  (dépend des sources publiées)`
    );
  }

  if (wantRecapture) {
    // Archivée, pas écrasée : une référence est un point de comparaison publié, et
    // la perdre en silence coûte plus cher qu'un objet mort dans un fichier local.
    const archived = ledger.legacyBaselines ? [ledger.legacyBaselines] : [];
    if (ledger.baseline) archived.push(ledger.baseline);
    ledger.legacyBaselines = archived.length ? archived : undefined;
    ledger.baseline = {
      rulesVersion: RULES.version,
      evidence: evidenceDist,
      contradictoryCount: contradictory.length,
      withoutOfficialSource: withoutOfficialSourceRow,
      withoutOfficialEvidence,
      capturedAt: new Date().toISOString(),
    };
    writeLedger(ledger);
    console.log(`\nNouvelle référence figée sous les règles v${RULES.version}.`);
    console.log("La précédente est archivée dans legacyBaselines, pas écrasée.");
  }

  // File priorisée. L'ordre des critères est celui de #566.
  const reviewedById = new Map(ledger.reviewed.map((e) => [e.affairId, e]));
  const queue = rows
    .filter((r) => !reviewedById.has(r.id))
    .sort((x, y) => {
      const rank = (r: Row) => [
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

  const urgent = queue.filter((r) => r.contradictions.length > 0);
  if (urgent.length) {
    console.log(`\nREVUE URGENTE — ${urgent.length} affaire(s) dans la file :`);
    for (const r of urgent) {
      console.log(`  [${r.evidenceLevel}] ${r.name} — /affaires/${r.slug}`);
      for (const c of r.contradictions) console.log(`        ${c.kind}  ${c.message}`);
    }
  }

  // La correction du défaut central : `urgent` se calcule sur la file, donc une
  // affaire sortie de la file disparaissait de l'écran même en restant
  // contradictoire. 10 fiches étaient dans cet état, et le rapport annonçait
  // 8 affaires en revue urgente quand il y en avait 18.
  const outOfQueue = rows.filter((r) => reviewedById.has(r.id) && r.contradictions.length > 0);
  if (outOfQueue.length) {
    console.log(`\nENCORE CONTRADICTOIRES HORS FILE — ${outOfQueue.length} affaire(s) :`);
    for (const r of outOfQueue) {
      const outcome = reviewedById.get(r.id)!.outcome;
      const motif =
        outcome.kind === "TRANSFERRED"
          ? `transférée #${outcome.issue}`
          : outcome.kind === "RESOLVED"
            ? "déclarée résolue"
            : "motif hérité";
      console.log(`  [${r.evidenceLevel}] ${r.name} — /affaires/${r.slug}   (${motif})`);
      for (const c of r.contradictions) console.log(`        ${c.kind}  ${c.message}`);
    }
  }

  const byOutcome = (kind: ReviewOutcome["kind"]) =>
    ledger.reviewed.filter((e) => e.outcome.kind === kind).length;
  console.log(`\nFILE : ${queue.length} à examiner`);
  console.log(
    `EXAMINÉES : ${byOutcome("RESOLVED")} résolue(s) · ${byOutcome("TRANSFERRED")} transférée(s) · ${byOutcome("LEGACY")} héritée(s)`
  );

  if (wantBatch) {
    const batch = queue.slice(0, size);
    console.log(`\n=== LOT DE ${batch.length} (taille demandée ${size}) ===`);
    for (const r of batch) {
      console.log(
        [
          `[${r.evidenceLevel}]`,
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
      `\nUne fois le lot traité, selon le motif de sortie :\n` +
        `  --resolved=${batch.map((b) => b.id).join(",")}\n` +
        `  --transferred=<sous-ensemble> --issue=<numéro>`
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
