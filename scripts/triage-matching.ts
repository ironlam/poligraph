#!/usr/bin/env tsx
/**
 * Assisted triage of the affair-matching review queue.
 *
 * Closes only the decisions whose every candidate rests on a surname the
 * vocabulary flags as an ordinary word of the text. The rule itself lives in
 * `src/lib/affair-matching/triage.ts` and is unit-tested there; this file is the
 * database shell around it.
 *
 * Why it is versioned and committed rather than thrown away: the July pass ran
 * from a script in `scripts/.local/` that was deleted afterwards, so the review
 * capacity vanished with the file and the backlog grew straight back.
 *
 * What it cannot do: publish anything. It writes `reviewedBy = auto-triage-vN`,
 * which `review-provenance` classifies as assisted, so the publish guard still
 * demands a human before an affair goes public.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/triage-matching.ts                  # rapport, aucune écriture
 *   npx tsx --env-file=.env scripts/triage-matching.ts --sample=20      # échantillon à relire
 *   npx tsx --env-file=.env scripts/triage-matching.ts --apply
 *   npx tsx --env-file=.env scripts/triage-matching.ts --revoke=auto-triage-v2
 */
import { db } from "@/lib/db";
import { loadSurnameVocabulary } from "@/lib/affair-matching/persistence";
import {
  classifyForTriage,
  unproposedNames,
  TRIAGE_VERSION,
  KNOWN_TRIAGE_VERSIONS,
  type TriageCandidate,
  type TriageRow,
} from "@/lib/affair-matching/triage";
import { looseWords } from "@/lib/affair-matching/triage";

/** Postgres tolerates far more, but a bounded chunk keeps the statement readable in logs. */
const CHUNK = 200;

function parseArgs() {
  const args = process.argv.slice(2);
  const sampleArg = args.find((a) => a.startsWith("--sample="));
  const revokeArg = args.find((a) => a.startsWith("--revoke="));
  return {
    apply: args.includes("--apply"),
    sample: sampleArg ? Number(sampleArg.split("=")[1]) : 0,
    revoke: revokeArg ? (revokeArg.split("=")[1] ?? "") : null,
  };
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface Eligible {
  id: string;
  previousJudgment: string;
  reason: string;
  who: string;
  excerpt: string;
}

interface Withheld extends Eligible {
  named: string[];
}

async function collect() {
  const vocabulary = await loadSurnameVocabulary();

  const rows = await db.affairPoliticianDecision.findMany({
    where: { reviewedAt: null },
    select: {
      id: true,
      judgment: true,
      affairId: true,
      resolverVersion: true,
      topCandidates: true,
      candidateText: true,
    },
  });

  const candidateIds = new Set<string>();
  for (const r of rows)
    for (const c of (r.topCandidates as unknown as TriageCandidate[]) ?? [])
      candidateIds.add(c.candidateId);

  const politicians = await db.politician.findMany({
    where: { id: { in: [...candidateIds] } },
    select: { id: true, lastName: true, fullName: true },
  });
  const byId = new Map(politicians.map((p) => [p.id, p]));
  const surnameOf = (id: string) => byId.get(id)?.lastName ?? null;

  // Every known politician, not just the ones this text proposed: the check has
  // to be able to disagree with the prefilter.
  const allNames = await db.politician.findMany({ select: { id: true, fullName: true } });
  const nameOf = new Map(allNames.map((p) => [p.id, p.fullName]));
  const fullNameIndex = new Map<string, string[]>();
  for (const p of allNames) {
    const key = looseWords(p.fullName).join(" ");
    if (key.split(" ").length < 2) continue;
    const list = fullNameIndex.get(key) ?? [];
    list.push(p.id);
    fullNameIndex.set(key, list);
  }
  const maxNameWords = Math.max(2, ...[...fullNameIndex.keys()].map((k) => k.split(" ").length));

  const eligible: Eligible[] = [];
  const withheld: Withheld[] = [];
  const kept = new Map<string, number>();

  for (const r of rows) {
    const candidates = (r.topCandidates as unknown as TriageCandidate[]) ?? [];
    const row: TriageRow = {
      id: r.id,
      judgment: r.judgment as string,
      affairId: r.affairId,
      resolverVersion: r.resolverVersion,
      candidates,
    };
    const verdict = classifyForTriage(row, vocabulary, surnameOf);
    if (verdict.kind === "KEEP") {
      kept.set(verdict.reason, (kept.get(verdict.reason) ?? 0) + 1);
      continue;
    }
    const entry: Eligible = {
      id: r.id,
      previousJudgment: row.judgment,
      reason: verdict.reason,
      who: candidates.map((c) => byId.get(c.candidateId)?.fullName ?? "?").join(", "),
      excerpt: r.candidateText.replace(/\s+/g, " ").slice(0, 240),
    };

    const named = unproposedNames(
      r.candidateText,
      new Set(candidates.map((c) => c.candidateId)),
      fullNameIndex,
      maxNameWords
    ).map((id) => nameOf.get(id) ?? id);

    if (named.length > 0) withheld.push({ ...entry, named });
    else eligible.push(entry);
  }

  return { total: rows.length, eligible, withheld, kept };
}

async function report() {
  const { total, eligible, withheld, kept } = await collect();
  const byJudgment = new Map<string, number>();
  for (const e of eligible)
    byJudgment.set(e.previousJudgment, (byJudgment.get(e.previousJudgment) ?? 0) + 1);

  console.log(`File non revue : ${total} décisions`);
  console.log(`Éligibles à la clôture hors périmètre : ${eligible.length}`);
  for (const [j, n] of byJudgment) console.log(`  depuis ${j} : ${n}`);
  if (withheld.length > 0) {
    console.log(`\nRetirées du lot : ${withheld.length} nomment un élu qui n'est pas candidat`);
    for (const w of withheld.slice(0, 10)) {
      console.log(`  ${w.named.join(", ")}  (candidats: ${w.who || "aucun"})`);
      console.log(`    « ${w.excerpt.slice(0, 130)} »`);
    }
    if (withheld.length > 10) console.log(`  … et ${withheld.length - 10} autres`);
  }

  console.log(`\nLaissées à l'humain : ${total - eligible.length}`);
  for (const [reason, n] of [...kept.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(5)}  ${reason}`);
  return eligible;
}

async function showSample(size: number) {
  const eligible = await report();
  if (eligible.length === 0) return;

  // Sampling is how this stays honest: an exhaustive re-read would defeat the
  // purpose, but a random draw gives a real error rate on the batch.
  const pool = [...eligible];
  const drawn: Eligible[] = [];
  const n = Math.min(size, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool.splice(idx, 1)[0]!);
  }

  console.log(`\n=== ÉCHANTILLON DE ${n} SUR ${eligible.length} ===`);
  console.log("Relire chaque entrée : une seule erreur sur vingt vaut 5 % sur le lot.\n");
  for (const [i, e] of drawn.entries()) {
    console.log(`${String(i + 1).padStart(3)}. [${e.previousJudgment}] ${e.who}`);
    console.log(`     « ${e.excerpt} »\n`);
  }
}

async function apply() {
  const eligible = await report();
  if (eligible.length === 0) {
    console.log("\nRien à appliquer.");
    return;
  }

  console.log(`\nApplication sur ${eligible.length} décisions, marqueur ${TRIAGE_VERSION}…`);
  const reviewedAt = new Date();
  let written = 0;

  // Grouped by previous judgment so each updateMany carries identical data while
  // the audit trail still records what each row came from, which is what makes
  // --revoke able to put them back.
  const groups = new Map<string, Eligible[]>();
  for (const e of eligible) {
    const g = groups.get(e.previousJudgment) ?? [];
    g.push(e);
    groups.set(e.previousJudgment, g);
  }

  for (const [previousJudgment, group] of groups) {
    for (const batch of chunked(group, CHUNK)) {
      const ids = batch.map((e) => e.id);
      const result = await db.affairPoliticianDecision.updateMany({
        // reviewedAt still null: never clobber a review a human made meanwhile.
        where: { id: { in: ids }, reviewedAt: null },
        data: {
          judgment: "NOT_SAME",
          chosenPoliticianId: null,
          reviewedAt,
          reviewedBy: TRIAGE_VERSION,
          reviewAction: "REJECTED_OUT_OF_SCOPE",
        },
      });
      written += result.count;

      await db.auditLog.createMany({
        data: batch.map((e) => ({
          action: "UPDATE" as const,
          entityType: "AffairPoliticianDecision",
          entityId: e.id,
          changes: {
            action: "AFFAIR_DECISION_TRIAGE_OUT_OF_SCOPE",
            version: TRIAGE_VERSION,
            previousJudgment,
            newJudgment: "NOT_SAME",
            reason: e.reason,
          },
        })),
      });
    }
    console.log(`  ${previousJudgment} → NOT_SAME : ${group.length}`);
  }

  console.log(`\n${written} décisions écrites.`);
  if (written !== eligible.length) {
    console.log(
      `${eligible.length - written} ignorées : revues entre-temps, elles gardent la décision humaine.`
    );
  }
  console.log(`Révoquer ce lot : --revoke=${TRIAGE_VERSION}`);
}

async function revoke(version: string) {
  if (!(KNOWN_TRIAGE_VERSIONS as readonly string[]).includes(version)) {
    console.error(
      `Version inconnue : ${version}. Connues : ${KNOWN_TRIAGE_VERSIONS.join(", ")}.\n` +
        `Refus plutôt que de vider un marqueur au hasard.`
    );
    process.exitCode = 1;
    return;
  }

  const rows = await db.affairPoliticianDecision.findMany({
    where: { reviewedBy: version },
    select: { id: true },
  });
  if (rows.length === 0) {
    console.log(`Aucune décision marquée ${version}.`);
    return;
  }

  // The previous judgment lives in the audit trail, not on the row: restoring it
  // is the whole reason apply() writes it there.
  const logs = await db.auditLog.findMany({
    where: {
      entityType: "AffairPoliticianDecision",
      entityId: { in: rows.map((r) => r.id) },
    },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, changes: true },
  });

  const previousOf = new Map<string, string>();
  for (const l of logs) {
    const c = l.changes as { version?: string; previousJudgment?: string } | null;
    if (c?.version === version && c.previousJudgment && !previousOf.has(l.entityId)) {
      previousOf.set(l.entityId, c.previousJudgment);
    }
  }

  const restorable = rows.filter((r) => previousOf.has(r.id));
  console.log(`${rows.length} décisions marquées ${version}, ${restorable.length} restaurables.`);
  if (restorable.length < rows.length) {
    console.log(
      `${rows.length - restorable.length} sans trace d'audit exploitable : laissées en l'état ` +
        `plutôt que remises à un jugement deviné.`
    );
  }

  const byPrevious = new Map<string, string[]>();
  for (const r of restorable) {
    const p = previousOf.get(r.id)!;
    const list = byPrevious.get(p) ?? [];
    list.push(r.id);
    byPrevious.set(p, list);
  }

  for (const [previous, ids] of byPrevious) {
    for (const batch of chunked(ids, CHUNK)) {
      await db.affairPoliticianDecision.updateMany({
        where: { id: { in: batch }, reviewedBy: version },
        data: {
          judgment: previous as "NO_MATCH" | "UNDECIDED",
          reviewedAt: null,
          reviewedBy: null,
          reviewAction: null,
        },
      });
    }
    console.log(`  NOT_SAME → ${previous} : ${ids.length}`);
  }
}

async function main() {
  const { apply: shouldApply, sample, revoke: revokeVersion } = parseArgs();

  if (revokeVersion !== null) await revoke(revokeVersion);
  else if (shouldApply) await apply();
  else if (sample > 0) await showSample(sample);
  else {
    await report();
    console.log("\nAucune écriture. --sample=20 pour relire un échantillon, --apply pour écrire.");
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
