/**
 * Rewrite legacy internal paths embedded in Scrutin.citizenImpact markdown to
 * their canonical equivalents (the same targets the 308 redirects already use):
 *
 *   /votes/<slug>      ->  /parlement/votes/<slug>
 *   /assemblee/<slug>  ->  /parlement/dossiers/<slug>
 *
 * Dry-run by default. Pass --apply to write (per-row atomic updates, idempotent
 * and resumable — no long-held transaction, so it is safe alongside other writers).
 *
 *   Dry-run:  npx dotenv -e .env -- npx tsx scripts/cleanup-citizen-impact-legacy-links.ts
 *   Apply:    npx dotenv -e .env -- npx tsx scripts/cleanup-citizen-impact-legacy-links.ts --apply
 *
 * Idempotent: the /votes/ rule uses a (?<!parlement) lookbehind so it never
 * rewrites an already-canonical /parlement/votes/ path; the /assemblee/ target
 * (/parlement/dossiers/) shares no substring with /assemblee/. Running twice is a no-op.
 */
import "dotenv/config";
import { db } from "@/lib/db";

// Guarded so /parlement/votes/ (which contains "/votes/") is never matched.
const VOTES_RE = /(?<!parlement)\/votes\//g;
const ASSEMBLEE_RE = /\/assemblee\//g;

function rewrite(text: string): { next: string; votes: number; assemblee: number } {
  const votes = (text.match(VOTES_RE) || []).length;
  const assemblee = (text.match(ASSEMBLEE_RE) || []).length;
  const next = text
    .replace(VOTES_RE, "/parlement/votes/")
    .replace(ASSEMBLEE_RE, "/parlement/dossiers/");
  return { next, votes, assemblee };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "APPLY (will write)" : "DRY-RUN (no write)"}\n`);

  const rows = await db.scrutin.findMany({
    where: {
      OR: [
        { citizenImpact: { contains: "/votes/" } },
        { citizenImpact: { contains: "/assemblee/" } },
      ],
    },
    select: { id: true, slug: true, citizenImpact: true },
  });

  let scanned = 0;
  let affected = 0;
  let votesTotal = 0;
  let assembleeTotal = 0;
  const ambiguous: Array<{ id: string; leftover: string }> = [];
  const samples: Array<{ slug: string | null; before: string; after: string }> = [];
  const updates: Array<{ id: string; citizenImpact: string }> = [];

  for (const row of rows) {
    scanned++;
    const text = row.citizenImpact!;
    const { next, votes, assemblee } = rewrite(text);
    if (next === text) continue; // nothing to change (defensive)
    affected++;
    votesTotal += votes;
    assembleeTotal += assemblee;

    // Idempotency self-check: a second pass must be a no-op.
    if (rewrite(next).next !== next) {
      throw new Error(`Non-idempotent rewrite on scrutin ${row.id} — aborting before any write.`);
    }

    // Ambiguity check: any legacy token still present after rewrite is unexpected.
    const leftover = next.match(/(?<!parlement)\/votes\/|\/assemblee\//g);
    if (leftover) ambiguous.push({ id: row.id, leftover: leftover.join(", ") });

    if (samples.length < 10) {
      const idx = text.search(/(?<!parlement)\/votes\/|\/assemblee\//);
      const win = (s: string) => s.slice(Math.max(0, idx - 30), idx + 70).replace(/\n/g, " ");
      samples.push({ slug: row.slug, before: win(text), after: win(next) });
    }

    if (apply) updates.push({ id: row.id, citizenImpact: next });
  }

  console.log("===== SUMMARY =====");
  console.log(`1. Candidate rows (broad prefilter)     : ${scanned}`);
  console.log(`2. Rows affected (would change)         : ${affected}`);
  console.log(`3. Replacements by type:`);
  console.log(`     /votes/      -> /parlement/votes/     : ${votesTotal}`);
  console.log(`     /assemblee/  -> /parlement/dossiers/  : ${assembleeTotal}`);
  console.log(`5. Ambiguous / un-rewritable occurrences  : ${ambiguous.length}`);
  if (ambiguous.length) console.log(JSON.stringify(ambiguous.slice(0, 20), null, 2));

  console.log(`\n4. Before/after samples (up to 10):`);
  samples.forEach((s, i) => {
    console.log(`\n  [${i + 1}] ${s.slug ?? "(no slug)"}`);
    console.log(`      before: …${s.before}…`);
    console.log(`      after : …${s.after}…`);
  });

  if (apply) {
    if (ambiguous.length) {
      throw new Error("Ambiguous occurrences detected — aborting APPLY. Review before writing.");
    }
    // Individual row updates (no wrapping transaction): each update is its own
    // atomic statement, so locks are held only for that single row and only
    // momentarily — gentle on the shared connection pool and any concurrent
    // writer. A small concurrency keeps it reasonably fast without starving the
    // pool (max: 2). Safe to interrupt/resume: the rewrite is idempotent, so
    // re-running only touches rows that still hold a legacy path.
    const CONCURRENCY = 4;
    let done = 0;
    console.log(`\nApplying ${updates.length} per-row updates (concurrency ${CONCURRENCY})…`);
    for (let i = 0; i < updates.length; i += CONCURRENCY) {
      const slice = updates.slice(i, i + CONCURRENCY);
      await Promise.all(
        slice.map((u) =>
          db.scrutin.update({ where: { id: u.id }, data: { citizenImpact: u.citizenImpact } })
        )
      );
      done += slice.length;
      if (done % 200 === 0 || done === updates.length) {
        console.log(`  updated ${done}/${updates.length}`);
      }
    }
    console.log("Done. All rows updated (idempotent — safe to re-run).");
  } else {
    console.log(`\n(DRY-RUN) No write performed. Re-run with --apply to commit.`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
