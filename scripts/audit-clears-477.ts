/**
 * Read-only audit for CLEAR transitions in a #477 backfill report (produced
 * by a --apply-clears dry-run of scripts/backfill-scrutin-dossier-477.ts).
 *
 * A CLEAR wipes a scrutin's dossierLegislatifId because the reconciler could
 * not confidently pick one candidate among several (AMBIGUOUS). That is a
 * destructive, hard-to-reverse decision, so before ever running the backfill
 * with --apply-clears, an operator should be able to see, per scrutin: the
 * currently-linked dossier, every candidate dossier with its score, the
 * current public policy title, and its amendment links. This script
 * assembles exactly that from the DB and a prior report file, and does not
 * write anything.
 *
 * Per-candidate scores come from `transition.candidateScores`, the actual
 * resolver output (src/services/sync/reconcile-scrutin-dossier/resolve.ts),
 * not a recompute. The resolver scores each candidate as the max of three
 * alias token-sets (titre, titreChemin, senatChemin; see maps.ts), and only
 * `titre` is persisted on LegislativeDossier. A recompute from the DB title
 * alone would silently disagree with the resolver whenever titreChemin or
 * senatChemin drove the real score, so this script carries the resolver's
 * own scores through the report instead of re-deriving them.
 *
 * Read-only by design: no writes, no $executeRawUnsafe. Safe to run against
 * production at any time.
 */
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { dirname } from "path";
import { billPhrase, tokenize, jaccard } from "@/services/sync/reconcile-scrutin-dossier/text";
import { ROUTES } from "@/config/routes";
import { SITE_URL } from "@/config/site";
import type { ScrutinDossierTransition } from "@/services/sync/reconcile-scrutin-dossier/types";

export interface AuditArgs {
  reportPath: string;
  outPath: string;
}

export function parseAuditArgs(argv: string[]): AuditArgs {
  const reportPath = argv.find((a) => a.startsWith("--report="))?.split("=")[1];
  if (!reportPath) {
    throw new Error("--report=<path> is required");
  }
  return {
    reportPath,
    outPath:
      argv.find((a) => a.startsWith("--out="))?.split("=")[1] ??
      "scripts/.local/clears-audit-477.enriched.json",
  };
}

interface ReportEntry {
  transition: ScrutinDossierTransition;
  repairStatus: string;
  attempts: number;
}

interface ReportFile {
  report: ReportEntry[];
}

function loadClearTransitions(path: string): ScrutinDossierTransition[] {
  const raw = readFileSync(path, "utf-8");
  const parsed = JSON.parse(raw) as ReportFile;
  if (!Array.isArray(parsed.report)) {
    throw new Error(`--report=${path} has no "report" array`);
  }
  return parsed.report.map((e) => e.transition).filter((t) => t.action === "CLEAR");
}

interface CandidateAuditEntry {
  externalId: string;
  dossierTitle: string | null;
  /** The resolver's authoritative alias-max score for this candidate
   *  (transition.candidateScores), null if the report predates that field. */
  score: number | null;
  /** Secondary signal only: jaccard(bill-phrase tokens, dossier's persisted
   *  `title` alone). NOT the resolver's score, since it ignores the
   *  titreChemin/senatChemin aliases the resolver also considers. Kept for
   *  eyeballing, never used for the pass/fail decision. */
  titleOnlyScore: number;
}

interface ClearAuditEntry {
  scrutinId: string;
  externalId: string;
  scrutinTitle: string;
  slug: string | null;
  publicUrl: string | null;
  currentDossierId: string | null;
  currentDossierTitle: string | null;
  candidates: CandidateAuditEntry[];
  /** True when this transition predates `candidateScores` (older report):
   *  candidates[].score is null and recomputedMargin is null. Regenerate the
   *  report with the updated resolver to get real scores. */
  scoreUnavailable: boolean;
  /** candidateScores[0].score - candidateScores[1].score, the resolver's own
   *  margin recomputed from the same field bestScore/margin came from. null
   *  if scoreUnavailable or fewer than two candidates. */
  recomputedMargin: number | null;
  /** The transition's recorded bestScore/margin, kept alongside for cross-check
   *  against candidates[0].score / recomputedMargin. Should always agree; a
   *  mismatch would indicate a resolver/report drift bug. */
  recordedBestScore: number | null;
  recordedMargin: number | null;
  currentPolicyTitle: string | null;
  currentPolicyTitleStatus: string | null;
  amendmentLinkCount: number;
  amendmentNumbers: string[];
}

/** Secondary signal only (see CandidateAuditEntry.titleOnlyScore doc comment):
 *  NOT the resolver's score. */
function titleOnlyScore(scrutinTokens: Set<string>, dossierTitle: string | null): number {
  if (!dossierTitle) return 0;
  return jaccard(scrutinTokens, tokenize(dossierTitle));
}

async function main() {
  const args = parseAuditArgs(process.argv.slice(2));
  const clears = loadClearTransitions(args.reportPath);

  if (clears.length === 0) {
    console.log(`[audit-clears] no CLEAR transitions found in ${args.reportPath}`);
    return;
  }

  const { db } = await import("@/lib/db");

  const enriched: ClearAuditEntry[] = [];
  for (const t of clears) {
    const scrutin = await db.scrutin.findUnique({
      where: { id: t.scrutinId },
      select: {
        title: true,
        slug: true,
        dossierLegislatifId: true,
        policyTitle: { select: { policyTitle: true, status: true } },
        amendmentLinks: { select: { amendment: { select: { number: true } } } },
      },
    });
    if (!scrutin) {
      console.error(`[audit-clears] scrutin ${t.scrutinId} (${t.externalId}) not found, skipping`);
      continue;
    }

    const currentDossier = scrutin.dossierLegislatifId
      ? await db.legislativeDossier.findUnique({
          where: { id: scrutin.dossierLegislatifId },
          select: { title: true },
        })
      : null;

    const candidateDossiers =
      t.candidateExternalIds.length > 0
        ? await db.legislativeDossier.findMany({
            where: { externalId: { in: t.candidateExternalIds } },
            select: { externalId: true, title: true },
          })
        : [];
    const titleByExternalId = new Map(candidateDossiers.map((d) => [d.externalId, d.title]));

    const phrase = billPhrase(scrutin.title) ?? scrutin.title;
    const scrutinTokens = tokenize(phrase);

    const scoreUnavailable = t.candidateScores === undefined;
    const resolverScoreByExternalId = new Map(
      (t.candidateScores ?? []).map((c) => [c.externalId, c.score])
    );

    const candidates: CandidateAuditEntry[] = t.candidateExternalIds
      .map((ext) => {
        const dossierTitle = titleByExternalId.get(ext) ?? null;
        return {
          externalId: ext,
          dossierTitle,
          score: scoreUnavailable ? null : (resolverScoreByExternalId.get(ext) ?? null),
          titleOnlyScore: titleOnlyScore(scrutinTokens, dossierTitle),
        };
      })
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    // t.candidateScores is already sorted desc by the resolver (see resolve.ts).
    const recomputedMargin =
      t.candidateScores && t.candidateScores.length >= 2
        ? t.candidateScores[0]!.score - t.candidateScores[1]!.score
        : null;

    enriched.push({
      scrutinId: t.scrutinId,
      externalId: t.externalId,
      scrutinTitle: scrutin.title,
      slug: scrutin.slug,
      publicUrl: scrutin.slug ? `${SITE_URL}${ROUTES.voteDetail(scrutin.slug)}` : null,
      currentDossierId: scrutin.dossierLegislatifId,
      currentDossierTitle: currentDossier?.title ?? null,
      candidates,
      scoreUnavailable,
      recomputedMargin,
      recordedBestScore: t.bestScore ?? null,
      recordedMargin: t.margin ?? null,
      currentPolicyTitle: scrutin.policyTitle?.policyTitle ?? null,
      currentPolicyTitleStatus: scrutin.policyTitle?.status ?? null,
      amendmentLinkCount: scrutin.amendmentLinks.length,
      amendmentNumbers: scrutin.amendmentLinks.map((l) => l.amendment.number),
    });
  }

  mkdirSync(dirname(args.outPath), { recursive: true });
  writeFileSync(args.outPath, JSON.stringify(enriched, null, 2));

  console.log(
    `[audit-clears] ${enriched.length} CLEAR transition(s) audited, written to ${args.outPath}`
  );
  for (const e of enriched) {
    console.log(`\n${e.externalId}  ${e.scrutinTitle}`);
    console.log(`  public: ${e.publicUrl ?? "(no slug)"}`);
    console.log(
      `  current dossier: ${e.currentDossierId ?? "(none)"}  ${e.currentDossierTitle ?? ""}`
    );
    if (e.scoreUnavailable) {
      console.log(
        "  score unavailable (regenerate report with the updated resolver): showing the title-only signal below, which is NOT the resolver's real score."
      );
    }
    for (const c of e.candidates.slice(0, 2)) {
      const scoreLabel = e.scoreUnavailable
        ? `titleOnlyScore=${c.titleOnlyScore.toFixed(3)} (secondary signal only)`
        : `score=${(c.score ?? 0).toFixed(3)} (resolver, authoritative)`;
      console.log(
        `  candidate ${c.externalId}  ${scoreLabel}  ${c.dossierTitle ?? "(dossier not found)"}`
      );
    }
    console.log(
      `  recorded bestScore=${e.recordedBestScore ?? "n/a"} margin=${e.recordedMargin ?? "n/a"}` +
        (e.recomputedMargin !== null
          ? `  (recomputed margin=${e.recomputedMargin.toFixed(3)})`
          : "")
    );
    console.log(
      `  current public title: ${e.currentPolicyTitle ?? "(none)"}  [${
        e.currentPolicyTitleStatus ?? "n/a"
      }]`
    );
  }

  await db.$disconnect();
}

// Guarded so importing this module (e.g. for a future unit test of
// parseAuditArgs) never touches the database: main() only runs when this
// file is the process entry point, not on import.
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
