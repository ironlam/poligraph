/**
 * Import the people elected on 27 September 2026 from the Ministry of the Interior feed.
 *
 * Usage:
 *   npm run senatoriales:import-results              # dry run: reads the feed, writes nothing
 *   npm run senatoriales:import-results -- --apply   # writes
 *   npm run senatoriales:import-results -- --only=01,08
 *
 * A constituency is written as a whole or not at all (see `planConstituency`), inside a
 * transaction that replaces its elected candidacies, so running the import again after
 * new results come in is safe. The script creates no `Politician` and touches no
 * `Mandate`: the switch of mandates is a separate step once terms begin on 1 October.
 *
 * The identity resolver records its decisions in the database, so it only runs with
 * `--apply`; a dry run lists the people it would have to resolve.
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { USER_AGENT } from "@/config/site";
import { DataSource, Judgement, MandateType } from "../src/generated/prisma";
import { resolveBatch } from "../src/lib/identity";
import {
  FeedNotXmlError,
  matchOutgoing,
  SN2026_FEED_BASE,
  parseIndex,
  parseResults,
  resultsUrl,
  type FeedConstituencyResult,
  type FeedElected,
} from "../src/lib/senatoriales/results-feed";
import {
  OutgoingSenateCompositionSchema,
  SENATE_OUTGOING_COMPOSITION_KEY,
} from "../src/types/stats-snapshots";
import {
  linkElected,
  mergeIndexes,
  planConstituency,
  resolverSourceId,
  type ConstituencyDecision,
  type PlannedElected,
} from "./lib/senatoriales-results-plan";

const ELECTION_SLUG = "senatoriales-2026";
const SOURCE_LABEL = "Ministère de l'Intérieur, résultats des élections sénatoriales 2026";
const REQUEST_DELAY_MS = 300;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args
  .find((a) => a.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  return res.text();
}

async function fetchResult(
  code: string,
  round: 1 | 2
): Promise<FeedConstituencyResult | "not-published"> {
  const body = await fetchText(resultsUrl(code, round));
  if (body === null) return "not-published";
  try {
    return parseResults(body);
  } catch (error) {
    if (error instanceof FeedNotXmlError) return "not-published";
    throw error;
  }
}

async function main() {
  const election = await db.election.findUnique({
    where: { slug: ELECTION_SLUG },
    select: { id: true },
  });
  if (!election) throw new Error(`Élection ${ELECTION_SLUG} introuvable`);

  const snapshot = await db.statsSnapshot.findUnique({
    where: { key: SENATE_OUTGOING_COMPOSITION_KEY },
  });
  if (!snapshot) throw new Error(`Snapshot ${SENATE_OUTGOING_COMPOSITION_KEY} introuvable`);
  const outgoing = OutgoingSenateCompositionSchema.parse(snapshot.data).seats;

  const [index1, index2] = await Promise.all([
    fetchText(`${SN2026_FEED_BASE}/resultatsT1/INDEX1FE.xml`),
    fetchText(`${SN2026_FEED_BASE}/resultatsT2/INDEX2FE.xml`),
  ]);
  if (!index1) throw new Error("Index du premier tour indisponible");
  const statuses = mergeIndexes(parseIndex(index1), index2 ? parseIndex(index2) : []).filter(
    (s) => !only || only.includes(s.status.code)
  );

  // 1. Decide, constituency by constituency.
  const decisions: Array<ConstituencyDecision & { url: string }> = [];
  for (const { status, round } of statuses) {
    const result =
      status.filled === "NON" ? "not-published" : await fetchResult(status.code, round);
    decisions.push({ ...planConstituency(status, result), url: resultsUrl(status.code, round) });
    if (status.filled !== "NON") await sleep(REQUEST_DELAY_MS);
  }

  const toReplace = decisions.filter(
    (d): d is Extract<ConstituencyDecision, { action: "replace" }> & { url: string } =>
      d.action === "replace"
  );
  const allElected = toReplace.flatMap((d) => d.elected);

  // 2. Link: outgoing seats first, then the resolver (apply only, it writes decisions).
  const needResolver = allElected.filter((e) => matchOutgoing(e, outgoing) === null);
  const resolverMatches = new Map<string, string>();
  if (apply && needResolver.length > 0) {
    const batch = await resolveBatch({
      sourceType: DataSource.SENAT,
      inputs: needResolver.map((e: FeedElected) => ({
        firstName: e.firstName,
        lastName: e.lastName,
        source: DataSource.SENAT,
        sourceId: resolverSourceId(e),
        department: e.constituencyCode,
        gender: e.civility === "Mme" ? "F" : "M",
        mandateType: MandateType.SENATEUR,
      })),
    });
    for (const r of batch.results) {
      if (r.politicianId && r.decision === Judgement.SAME) {
        resolverMatches.set(r.sourceId, r.politicianId);
      }
    }
  }

  // 3. Report.
  console.log(`\n${apply ? "APPLICATION" : "DRY RUN (rien n'est écrit)"}\n`);
  for (const d of decisions) {
    if (d.action === "skip") {
      console.log(`  ${d.code.padEnd(4)} ignorée : ${d.reason}`);
      continue;
    }
    const linked = linkElected(d.elected, outgoing, resolverMatches);
    console.log(`  ${d.code.padEnd(4)} ${d.elected[0]?.constituencyName ?? ""}`);
    for (const e of linked) {
      const link =
        e.link === "outgoing"
          ? "sortant"
          : e.link === "resolver"
            ? "fiche trouvée"
            : apply
              ? "non rattaché"
              : "à résoudre";
      console.log(`       T${e.round} ${e.firstName} ${e.lastName} (${e.nuanceLabel}) : ${link}`);
    }
  }
  const skipped = decisions.length - toReplace.length;
  console.log(
    `\n${toReplace.length} circonscription(s) à publier, ${allElected.length} élu(s), ` +
      `${skipped} ignorée(s), ${needResolver.length} hors sortants.`
  );

  if (!apply) {
    await db.$disconnect();
    return;
  }

  // 4. Write, one transaction per constituency.
  for (const d of toReplace) {
    const linked: PlannedElected[] = linkElected(d.elected, outgoing, resolverMatches);
    await db.$transaction(async (tx) => {
      await tx.candidacy.deleteMany({
        where: { electionId: election.id, constituencyCode: d.code },
      });
      for (const e of linked) {
        const firstName = e.firstName;
        const lastName = e.lastName;
        const candidate =
          (await tx.candidate.findFirst({
            where: { firstName, lastName, politicianId: e.politicianId },
          })) ??
          (await tx.candidate.create({
            data: {
              firstName,
              lastName,
              gender: e.civility === "Mme" ? "F" : "M",
              politicianId: e.politicianId,
            },
          }));
        const votes = e.votes ?? e.listVotes;
        const pct = e.pct ?? e.listPct;
        await tx.candidacy.create({
          data: {
            electionId: election.id,
            candidateId: candidate.id,
            politicianId: e.politicianId,
            candidateName: `${firstName} ${lastName}`,
            partyLabel: e.nuanceLabel || null,
            constituencyCode: d.code,
            constituencyName: e.constituencyName,
            listName: e.listName,
            listPosition: e.listPosition,
            ...(e.round === 1
              ? { round1Votes: votes, round1Pct: pct }
              : { round2Votes: votes, round2Pct: pct }),
            isElected: true,
            sourceUrl: d.url,
            sourceLabel: SOURCE_LABEL,
          },
        });
      }
    });
    console.log(`  ${d.code} écrite (${linked.length} élu(s))`);
  }

  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
