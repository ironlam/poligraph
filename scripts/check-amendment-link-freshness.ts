/**
 * READ-ONLY monitor: detects a stall in scrutin<->amendment linking.
 *
 * The amendment pipeline can fail SILENTLY (the daily sync marks the step
 * "completed" even when it created/linked nothing), so a green workflow is not
 * proof of progress. This check is data-driven and needs no link timestamp
 * (the join table has none): it compares the newest *linked* vote against the
 * newest *amendable* vote. When linking keeps up, the two track within a day or
 * two; when it stalls, the linked frontier freezes weeks behind. To avoid false
 * positives during recess (no votes -> no links is normal) and from the odd
 * vote that never resolves to an amendment, it also requires that amendable
 * votes old enough to have been linked remain unlinked.
 *
 * Exits 0 always; writes `stalled` and `detail` to $GITHUB_OUTPUT so the
 * workflow can open an issue. Read-only: no writes, no external API calls.
 */
import { appendFileSync } from "node:fs";
import { db } from "@/lib/db";
import {
  isLinkingStalled,
  partitionUnlinkedVotes,
} from "@/lib/monitoring/amendment-link-freshness";
import { AMENDMENT_LINK_UNRESOLVABLE_IDS } from "@/config/amendment-link-unresolvable";

const MAX_LAG_HOURS = Number(process.env.LINK_FRESHNESS_MAX_LAG_HOURS ?? "48");
const LEGISLATURE = Number(process.env.LINK_FRESHNESS_LEGISLATURE ?? "17");
const ABSOLUTE_UNLINKED_THRESHOLD = Number(process.env.LINK_FRESHNESS_ABS_UNLINKED ?? "20");
const RECENT_WINDOW_DAYS = 14;

function writeOutput(key: string, value: string): void {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  if (value.includes("\n")) {
    appendFileSync(out, `${key}<<__EOF__\n${value}\n__EOF__\n`);
  } else {
    appendFileSync(out, `${key}=${value}\n`);
  }
}

async function main(): Promise<void> {
  const now = Date.now();
  const lagCutoff = new Date(now - MAX_LAG_HOURS * 3_600_000);
  const windowStart = new Date(now - RECENT_WINDOW_DAYS * 24 * 3_600_000);

  const [
    latestLinkedVote,
    latestAmendableVote,
    windowUnlinked,
    confirmedUnlinked,
    amendmentCount,
    lastAmendment,
  ] = await Promise.all([
    db.scrutin.findFirst({
      where: { legislature: LEGISLATURE, chamber: "AN", amendmentLinks: { some: {} } },
      orderBy: { votingDate: "desc" },
      select: { votingDate: true },
    }),
    db.scrutin.findFirst({
      where: { legislature: LEGISLATURE, chamber: "AN", type: "AMENDEMENT" },
      orderBy: { votingDate: "desc" },
      select: { votingDate: true, externalId: true },
    }),
    // Only AMENDEMENT votes with a dossier are ever eligible for a link/title —
    // ARTICLE/MOTION/FINAL/AUTRE votes are out of scope and must not count
    // toward the stall signal. Old enough that linking SHOULD have happened,
    // yet hasn't. No config exclusion in the query: partitionUnlinkedVotes
    // splits this window population into blocking vs confirmed-unresolvable,
    // which is equivalent to `externalId NOT IN (unresolvable keys)` for the
    // blocking count while also yielding the confirmed list for the detail.
    db.scrutin.findMany({
      where: {
        legislature: LEGISLATURE,
        chamber: "AN",
        type: "AMENDEMENT",
        dossierLegislatifId: { not: null },
        votingDate: { gte: windowStart, lte: lagCutoff },
        amendmentLinks: { none: {} },
      },
      select: { externalId: true },
    }),
    // Confirmed-unresolvable votes still unlinked at ANY age (no lower window
    // bound): so an explicitly-classified vote is never silently hidden just
    // because it aged out of the recent window.
    db.scrutin.findMany({
      where: {
        legislature: LEGISLATURE,
        chamber: "AN",
        type: "AMENDEMENT",
        dossierLegislatifId: { not: null },
        votingDate: { lte: lagCutoff },
        amendmentLinks: { none: {} },
        externalId: { in: [...AMENDMENT_LINK_UNRESOLVABLE_IDS] },
      },
      orderBy: { votingDate: "desc" },
      select: { externalId: true, votingDate: true },
    }),
    db.amendment.count(),
    db.amendment.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  // MAIN (blocking) signal excludes the confirmed-unresolvable set by explicit
  // id only — never by age.
  const { blocking, confirmedUnresolvable: confirmedInWindow } = partitionUnlinkedVotes(
    windowUnlinked.map((s) => s.externalId),
    AMENDMENT_LINK_UNRESOLVABLE_IDS
  );
  const recentLinkableUnlinked = blocking.length;

  const lagHours =
    latestAmendableVote && latestLinkedVote
      ? (latestAmendableVote.votingDate.getTime() - latestLinkedVote.votingDate.getTime()) /
        3_600_000
      : 0;
  const stalled = isLinkingStalled({
    lagHours,
    recentLinkableUnlinked,
    maxLagHours: MAX_LAG_HOURS,
    absoluteUnlinkedThreshold: ABSOLUTE_UNLINKED_THRESHOLD,
  });

  const iso = (d: Date | null | undefined) => d?.toISOString() ?? "n/a";
  const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? "n/a";
  const confirmedList =
    confirmedUnlinked.length > 0
      ? ` [${confirmedUnlinked.map((s) => s.externalId).join(", ")}]`
      : "";
  const detail = [
    `Amendment linking freshness (legislature ${LEGISLATURE}, threshold ${MAX_LAG_HOURS}h)`,
    `- newest amendable vote (type AMENDEMENT): ${day(latestAmendableVote?.votingDate)} ${latestAmendableVote?.externalId ?? ""}`.trim(),
    `- newest vote that HAS a link:            ${day(latestLinkedVote?.votingDate)}`,
    `- linked frontier lag: ${(lagHours / 24).toFixed(1)} days`,
    `- linkable votes (AMENDEMENT + dossier) >${MAX_LAG_HOURS}h old still unlinked (last ${RECENT_WINDOW_DAYS}d): ${windowUnlinked.length} = ${recentLinkableUnlinked} unresolved-not-yet-classified (BLOCKING) + ${confirmedInWindow.length} confirmed-unresolvable`,
    `- confirmed-unresolvable, still unlinked (explicit config, NON-BLOCKING): ${confirmedUnlinked.length}${confirmedList}`,
    `- Amendment corpus: ${amendmentCount} rows, newest ingested ${iso(lastAmendment?.createdAt)}`,
    `- verdict: ${stalled ? "STALLED" : "ok"}`,
  ].join("\n");

  console.log(detail);
  writeOutput("stalled", String(stalled));
  writeOutput("detail", detail);

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    appendFileSync(stepSummary, `## Amendment linking freshness\n\n\`\`\`\n${detail}\n\`\`\`\n`);
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
