#!/usr/bin/env tsx
/**
 * Re-scores queued affair-matching decisions with the current resolver.
 *
 * Bumping RESOLVER_VERSION freezes the assisted triage: it only acts on rows the
 * current resolver produced, so a backlog scored by an older version stays put
 * forever unless something re-runs it. This is that something, and it is
 * committed rather than thrown away for the same reason the triage script is.
 *
 * **The safety property is structural, not a filter to keep in sync.** The
 * publish guard blocks on two paths: `affairId`, and orphan rows matched by
 * `chosenPoliticianId` plus a `sourceRef` equal to one of the affair's source
 * URLs. A row carrying neither field cannot be on either path, so re-scoring it
 * cannot change what is publishable. Duplicating the guard's OR clause here
 * would have worked today and drifted the first time the guard changed.
 *
 * That restriction also excludes every SAME row on its own, since a SAME always
 * carries a chosen politician. What is left is exactly the noise queue.
 *
 * **Truncated texts.** `candidateText` keeps only the first 2000 characters, so
 * more than half the backlog has lost its original text. Re-scoring those on
 * less text than the first pass saw is still an improvement for a human reading
 * the queue, but it must not feed automatic closure: they are written as
 * `v2-partial`, which the triage version guard refuses without needing to know
 * about this script.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/rescore-affair-decisions.ts              # rapport
 *   npx tsx --env-file=.env scripts/rescore-affair-decisions.ts --sample=15
 *   npx tsx --env-file=.env scripts/rescore-affair-decisions.ts --apply
 *   npx tsx --env-file=.env scripts/rescore-affair-decisions.ts --apply --limit=100
 */
import { db } from "@/lib/db";
import { scoreAffairAgainstCandidates } from "@/lib/affair-matching";
import { loadCandidatePool, loadSurnameVocabulary } from "@/lib/affair-matching/persistence";
import { CandidatePrefilter } from "@/lib/affair-matching/candidate-prefilter";
import { RESOLVER_VERSION } from "@/lib/affair-matching/signals/constants";
import type { AffairScoringInput } from "@/lib/affair-matching/signals/types";
import type { SourceType } from "@/generated/prisma";

/** Marks a row re-scored on a text we know is incomplete. Never auto-triaged. */
const PARTIAL_VERSION = `${RESOLVER_VERSION}-partial`;

/** candidateText is stored as `text.slice(0, 2000)`. */
const TEXT_STORAGE_LIMIT = 2000;

/** Concurrent updates. Kept low: the connection pool is sized for lambdas. */
const CONCURRENCY = 10;

function parseArgs() {
  const args = process.argv.slice(2);
  const num = (prefix: string) => {
    const a = args.find((x) => x.startsWith(prefix));
    return a ? Number(a.split("=")[1]) : 0;
  };
  return { apply: args.includes("--apply"), sample: num("--sample="), limit: num("--limit=") };
}

interface Rescored {
  id: string;
  before: string;
  after: string;
  partial: boolean;
  topCandidateId: string | null;
  topScore: number;
  gap: number;
  topCandidates: unknown;
  gained: string[];
  excerpt: string;
}

async function compute(limit: number) {
  const [pool, vocabulary] = await Promise.all([loadCandidatePool(), loadSurnameVocabulary()]);
  const prefilter = new CandidatePrefilter(pool);
  const byId = new Map(pool.map((p) => [p.id, p]));

  const rows = await db.affairPoliticianDecision.findMany({
    // Neither guard path can reach these, so nothing publishable moves.
    where: {
      reviewedAt: null,
      affairId: null,
      chosenPoliticianId: null,
      resolverVersion: { notIn: [RESOLVER_VERSION, PARTIAL_VERSION] },
    },
    select: {
      id: true,
      judgment: true,
      textHash: true,
      candidateText: true,
      metadata: true,
      source: true,
      sourceRef: true,
      topCandidates: true,
    },
    orderBy: { createdAt: "asc" },
    ...(limit > 0 ? { take: limit } : {}),
  });

  // One query for every blocklist entry that could apply, rather than one per row.
  const blocked = await db.affairPoliticianDecision.findMany({
    where: { textHash: { in: rows.map((r) => r.textHash) }, judgment: "NOT_SAME" },
    select: { textHash: true, chosenPoliticianId: true },
  });
  const blocklist = new Map<string, Set<string>>();
  for (const b of blocked) {
    if (!b.chosenPoliticianId) continue;
    const set = blocklist.get(b.textHash) ?? new Set<string>();
    set.add(b.chosenPoliticianId);
    blocklist.set(b.textHash, set);
  }

  const results: Rescored[] = [];

  for (const row of rows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const input: AffairScoringInput = {
      text: row.candidateText,
      metadata: {
        source: (meta.source as SourceType) ?? row.source,
        sourceRef: (meta.sourceRef as string) ?? row.sourceRef,
        factsDate: meta.factsDate ? new Date(meta.factsDate as string) : null,
        verdictDate: meta.verdictDate ? new Date(meta.verdictDate as string) : null,
        court: (meta.court as string) ?? null,
        department: (meta.department as string) ?? null,
        externalIds:
          (meta.externalIds as AffairScoringInput["metadata"]["externalIds"]) ?? undefined,
      },
    };

    const excluded = blocklist.get(row.textHash) ?? new Set<string>();
    const candidates = prefilter.filter(input.text).filter((p) => !excluded.has(p.id));
    const decision = scoreAffairAgainstCandidates(input, candidates, vocabulary);

    const previousIds = new Set(
      ((row.topCandidates as unknown as Array<{ candidateId: string }>) ?? []).map(
        (c) => c.candidateId
      )
    );
    const gained = decision.topCandidates
      .filter((c) => !previousIds.has(c.candidateId))
      .map((c) => byId.get(c.candidateId)?.fullName ?? c.candidateId);

    results.push({
      id: row.id,
      before: row.judgment as string,
      after: decision.judgment,
      partial: row.candidateText.length >= TEXT_STORAGE_LIMIT,
      topCandidateId: decision.topCandidateId,
      topScore: decision.topScore,
      gap: decision.gap,
      topCandidates: decision.topCandidates,
      gained,
      excerpt: row.candidateText.replace(/\s+/g, " ").slice(0, 200),
    });
  }

  return results;
}

function report(results: Rescored[]) {
  const transitions = new Map<string, number>();
  const gainedNames = new Map<string, number>();
  let partial = 0;
  let becameSame = 0;

  for (const r of results) {
    if (r.after !== r.before)
      transitions.set(
        `${r.before} → ${r.after}`,
        (transitions.get(`${r.before} → ${r.after}`) ?? 0) + 1
      );
    if (r.partial) partial++;
    if (r.after === "SAME") becameSame++;
    for (const n of r.gained) gainedNames.set(n, (gainedNames.get(n) ?? 0) + 1);
  }

  console.log(`${results.length} décisions à re-résoudre`);
  console.log(`  texte intact  : ${results.length - partial} → ${RESOLVER_VERSION}`);
  console.log(`  texte tronqué : ${partial} → ${PARTIAL_VERSION} (non triable automatiquement)`);

  console.log(`\n=== TRANSITIONS ===`);
  if (transitions.size === 0) console.log("  aucune");
  for (const [k, n] of [...transitions.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${k.padEnd(26)} ${n}`);
  if (becameSame > 0) {
    console.log(
      `\n  ${becameSame} deviennent SAME et prendront un chosenPoliticianId : elles pourront`
    );
    console.log(`  bloquer une publication de plus, jamais une de moins.`);
  }

  console.log(`\n=== CANDIDATS NOUVELLEMENT ATTEINTS (top 15) ===`);
  const top = [...gainedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length === 0) console.log("  aucun");
  for (const [n, c] of top) console.log(`  ${String(c).padStart(4)}  ${n}`);
}

async function apply(results: Rescored[]) {
  console.log(`\nÉcriture sur ${results.length} décisions…`);
  let done = 0;

  for (let i = 0; i < results.length; i += CONCURRENCY) {
    const batch = results.slice(i, i + CONCURRENCY);
    const written = await Promise.all(
      batch.map((r) =>
        // updateMany, not update: scoring 1423 rows takes long enough for a human
        // to review one meanwhile, and only a filtered write re-asserts the three
        // conditions that make this safe. An update by id would overwrite them.
        db.affairPoliticianDecision.updateMany({
          where: {
            id: r.id,
            reviewedAt: null,
            affairId: null,
            chosenPoliticianId: null,
          },
          data: {
            judgment: r.after as "SAME" | "UNDECIDED" | "NO_MATCH",
            topCandidates: r.topCandidates as never,
            topScore: r.topScore,
            gap: r.gap,
            resolverVersion: r.partial ? PARTIAL_VERSION : RESOLVER_VERSION,
            ...(r.after === "SAME" && r.topCandidateId
              ? { chosenPoliticianId: r.topCandidateId }
              : {}),
          },
        })
      )
    );
    done += written.reduce((n, w) => n + w.count, 0);
    const seen = Math.min(i + CONCURRENCY, results.length);
    if (seen % 200 === 0 || seen === results.length) console.log(`  ${seen}/${results.length}`);
  }

  console.log(`\n${done} décisions re-résolues.`);
  if (done !== results.length) {
    console.log(
      `${results.length - done} ignorées : touchées pendant le scoring, elles gardent leur état.`
    );
  }
  console.log(`Trier ensuite : npm run triage:matching`);
}

async function main() {
  const { apply: shouldApply, sample, limit } = parseArgs();
  const results = await compute(limit);
  report(results);

  if (sample > 0) {
    const pool = [...results];
    const drawn: Rescored[] = [];
    for (let i = 0; i < Math.min(sample, pool.length); i++)
      drawn.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
    console.log(`\n=== ÉCHANTILLON DE ${drawn.length} ===\n`);
    for (const [i, r] of drawn.entries()) {
      console.log(
        `${String(i + 1).padStart(3)}. ${r.before} → ${r.after}${r.partial ? " (texte tronqué)" : ""}` +
          `${r.gained.length ? `  nouveaux: ${r.gained.join(", ")}` : ""}`
      );
      console.log(`     « ${r.excerpt} »\n`);
    }
  }

  if (shouldApply) await apply(results);
  else console.log(`\nAucune écriture. --sample=15 pour relire, --apply pour écrire.`);

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
