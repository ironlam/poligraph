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
import type { AffairStatus, Involvement } from "../src/generated/prisma";

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

/** Rôles pour lesquels le résultat judiciaire de l'affaire est celui de la personne. */
const ADVERSE_INVOLVEMENTS: Involvement[] = ["DIRECT", "INDIRECT"];

/** Hôtes de juridictions et d'institutions compétentes. Niveau B. */
const OFFICIAL_HOSTS = [
  "courdecassation.fr",
  "cours-appel.justice.fr",
  "justice.fr",
  "conseil-etat.fr",
  "ccomptes.fr",
  "legifrance.gouv.fr",
  "conseil-constitutionnel.fr",
  "juricaf.org",
];

/** Éditeurs correspondant à une juridiction ou institution compétente. Niveau B. */
const OFFICIAL_PUBLISHER =
  /cour d.appel|cour de cassation|conseil d.[ée]tat|cour des comptes|tribunal|parquet|minist[èe]re de la justice|conseil constitutionnel|ordre des/i;

/** Types de source qui ne comptent jamais comme secondaire indépendante.
 *  Wikipedia est exclu délibérément : c'est la source qui a induit en erreur sur
 *  l'arrêt du 7 juillet 2026, et une encyclopédie n'atteste pas un dispositif. */
const NOT_INDEPENDENT_TYPES = new Set(["WIKIPEDIA", "WIKIDATA"]);

/**
 * Recours encore ouvert, énoncé explicitement.
 *
 * La première version cherchait « pourvoi », « en appel » ou « non définitive »
 * n'importe où, et flaguait 15 affaires à tort : une condamnation définitive raconte
 * normalement son historique (« condamné en appel », « rejet du pourvoi, donnant un
 * caractère définitif »). Mentionner un recours passé n'est pas une contradiction.
 */
const PENDING_RECOURSE = [
  /pourvoi[^.]{0,60}?(reste possible|est possible|en cours|pendant|a [ée]t[ée] form[ée])/i,
  /(se sont pourvus|s'est pourvu|se pourvoit)[^.]{0,40}cassation/i,
  /appel en cours/i,
  /n['’]est pas d[ée]finitive/i,
];

/** Recours épuisés, énoncé explicitement. Annule le signal de pendance. */
const RECOURSE_EXHAUSTED =
  /rejet[^.]{0,40}pourvoi|pourvoi[^.]{0,40}(rejet|a [ée]t[ée] rejet)|d[ée]finitivement|caract[èe]re d[ée]finitif|voies de recours [ée]puis/i;

function describesPendingRecourse(description: string): boolean {
  if (RECOURSE_EXHAUSTED.test(description)) return false;
  return PENDING_RECOURSE.some((re) => re.test(description));
}

type EvidenceLevel = "A" | "B" | "C" | "D";

interface Ledger {
  /** Identifiants d'affaires déjà examinées, dans l'ordre de traitement. */
  done: string[];
  /** Répartition A/B/C/D au premier passage, point de comparaison figé. */
  baseline?: Record<EvidenceLevel, number> & { withoutOfficialSource: number; capturedAt: string };
}

function readLedger(): Ledger {
  if (!fs.existsSync(LEDGER)) return { done: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(LEDGER, "utf8")) as Ledger;
    return { done: parsed.done ?? [], baseline: parsed.baseline };
  } catch {
    console.error(`Registre illisible (${LEDGER}), il faut le corriger à la main.`);
    process.exit(1);
  }
}

function writeLedger(ledger: Ledger): void {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Titre réduit à sa substance, pour repérer une même dépêche reprise ailleurs. */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort()
    .join(" ");
}

interface SourceRow {
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date;
  sourceType: string;
}

interface Assessment {
  level: EvidenceLevel;
  hasOfficialSource: boolean;
  independentCount: number;
  /** Sources écartées du compte parce qu'elles reprennent le même titre. */
  duplicateReprints: number;
  contradictions: string[];
}

function assess(affair: {
  status: AffairStatus;
  involvement: Involvement;
  verdictDate: Date | null;
  description: string | null;
  prisonMonths: number | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
  sources: SourceRow[];
  decisionCount: number;
}): Assessment {
  const hasOfficialSource = affair.sources.some(
    (s) =>
      s.sourceType === "JUDILIBRE" ||
      s.sourceType === "LEGIFRANCE" ||
      OFFICIAL_PUBLISHER.test(s.publisher) ||
      OFFICIAL_HOSTS.some((h) => hostOf(s.url) === h || hostOf(s.url).endsWith("." + h))
  );

  // Indépendance : éditeurs distincts, hors encyclopédies, et une seule fois par
  // titre normalisé (une dépêche reprise ne vaut pas deux attestations).
  const seenPublishers = new Set<string>();
  const seenTitles = new Set<string>();
  let independentCount = 0;
  let duplicateReprints = 0;
  for (const s of affair.sources) {
    if (NOT_INDEPENDENT_TYPES.has(s.sourceType)) continue;
    const publisher = s.publisher.trim().toLowerCase();
    const title = normaliseTitle(s.title);
    if (seenPublishers.has(publisher)) continue;
    if (title && seenTitles.has(title)) {
      duplicateReprints++;
      continue;
    }
    seenPublishers.add(publisher);
    if (title) seenTitles.add(title);
    independentCount++;
  }

  const contradictions: string[] = [];
  if (!ADVERSE_INVOLVEMENTS.includes(affair.involvement)) {
    contradictions.push(`statut de condamnation avec implication ${affair.involvement}`);
  }
  if (!affair.verdictDate) {
    contradictions.push("statut de condamnation sans date de verdict");
  } else if (affair.verdictDate.getTime() > Date.now()) {
    contradictions.push("date de verdict dans le futur");
  } else {
    const latest = affair.sources.reduce<number>(
      (max, s) => Math.max(max, s.publishedAt.getTime()),
      0
    );
    if (latest > 0 && latest < affair.verdictDate.getTime()) {
      contradictions.push("toutes les sources précèdent la date du verdict");
    }
  }

  const description = affair.description ?? "";
  if (affair.status === "CONDAMNATION_DEFINITIVE" && describesPendingRecourse(description)) {
    contradictions.push("statut définitif mais la description décrit un recours pendant");
  }
  if (affair.status !== "CONDAMNATION_DEFINITIVE" && RECOURSE_EXHAUSTED.test(description)) {
    contradictions.push(
      "statut non définitif mais la description dit les voies de recours épuisées"
    );
  }

  let level: EvidenceLevel;
  if (contradictions.length > 0) level = "D";
  else if (affair.decisionCount > 0) level = "A";
  else if (hasOfficialSource) level = "B";
  else if (independentCount >= 2) level = "C";
  else level = "D";

  return { level, hasOfficialSource, independentCount, duplicateReprints, contradictions };
}

/** Peine chiffrée renseignée, donc vérifiable et à vérifier. */
function hasPreciseSentence(a: {
  prisonMonths: number | null;
  fineAmount: unknown;
  ineligibilityMonths: number | null;
}): boolean {
  return Boolean(
    (a.prisonMonths ?? 0) > 0 ||
    (a.fineAmount != null && Number(a.fineAmount) > 0) ||
    (a.ineligibilityMonths ?? 0) > 0
  );
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
  const withoutOfficialSource = rows.filter((r) => !r.hasOfficialSource).length;

  console.log(`\n${rows.length} condamnations publiées examinées.\n`);
  console.log("Niveau de preuve :");
  for (const level of ["A", "B", "C", "D"] as const) {
    console.log(`  ${level} : ${dist[level]}`);
  }
  console.log(`\nMétrique secondaire — sans source officielle : ${withoutOfficialSource}`);

  // Point de comparaison figé au premier passage.
  if (!ledger.baseline) {
    ledger.baseline = { ...dist, withoutOfficialSource, capturedAt: new Date().toISOString() };
    writeLedger(ledger);
    console.log("Référence enregistrée dans le registre (premier passage).");
  } else if (wantReport) {
    const b = ledger.baseline;
    console.log(`\nAvant / après (référence du ${b.capturedAt.slice(0, 10)}) :`);
    for (const level of ["A", "B", "C", "D"] as const) {
      const delta = dist[level] - b[level];
      console.log(`  ${level} : ${b[level]} → ${dist[level]} (${delta >= 0 ? "+" : ""}${delta})`);
    }
    const deltaOfficial = withoutOfficialSource - b.withoutOfficialSource;
    console.log(
      `  sans source officielle : ${b.withoutOfficialSource} → ${withoutOfficialSource} (${deltaOfficial >= 0 ? "+" : ""}${deltaOfficial})`
    );
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
