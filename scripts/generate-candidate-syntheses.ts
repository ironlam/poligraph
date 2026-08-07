/**
 * Generates the synthesis shown on a presidential candidate's page.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts --apply
 *   npx tsx --env-file=.env scripts/generate-candidate-syntheses.ts --apply --only=jean-luc-melenchon
 *
 * Dry run by default: it prints the text it would store and writes nothing.
 *
 * Only declared candidacies are considered. A candidacy that is merely rumoured has
 * not asked anyone to read a summary of its programme, and saying so on its page would
 * lend it a substance its own status denies.
 */

import { db } from "@/lib/db";
import { callAnthropic } from "@/lib/api/anthropic";
import {
  buildCandidateSynthesisPrompt,
  screenSynthesis,
  SYNTHESIS_SYSTEM_PROMPT,
  type CandidateSynthesisInput,
} from "@/lib/presidentielle/candidate-synthesis";

const ELECTION_SLUG = "presidentielle-2027";
/** Mandates kept in the prompt, most recent first. Enough for a career, short of a list. */
const MANDATE_LIMIT = 8;

const apply = process.argv.includes("--apply");
const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];

async function main(): Promise<void> {
  const election = await db.election.findFirst({
    where: { slug: ELECTION_SLUG },
    select: { id: true },
  });
  if (!election) throw new Error(`élection ${ELECTION_SLUG} introuvable`);

  const candidacies = await db.candidacy.findMany({
    where: {
      electionId: election.id,
      status: "DECLARE",
      ...(only ? { politician: { slug: only } } : {}),
    },
    select: {
      id: true,
      candidateName: true,
      partyLabel: true,
      politicianId: true,
      party: { select: { name: true } },
      presidentialData: { select: { id: true } },
    },
    orderBy: { candidateName: "asc" },
  });

  console.log(
    `${apply ? "APPLY (écrit en base)" : "dry run"} — ${candidacies.length} candidature(s) déclarée(s)\n`
  );

  let written = 0;
  let rejected = 0;

  for (const candidacy of candidacies) {
    if (!candidacy.politicianId) {
      console.log(`SKIP ${candidacy.candidateName} : candidature sans politicien`);
      continue;
    }

    const [mandates, voteCount, measures] = await Promise.all([
      db.mandate.findMany({
        where: { politicianId: candidacy.politicianId },
        select: { role: true, title: true, institution: true, startDate: true, endDate: true },
        orderBy: { startDate: "desc" },
        take: MANDATE_LIMIT,
      }),
      db.vote.count({ where: { politicianId: candidacy.politicianId } }),
      db.measure.findMany({
        where: {
          candidacyId: candidacy.id,
          publicationStatus: "PUBLISHED",
          withdrawnAt: null,
          publishedRevision: { reviewedAt: { not: null } },
        },
        select: { theme: true, publishedRevision: { select: { text: true } } },
      }),
    ]);

    const input: CandidateSynthesisInput = {
      candidateName: candidacy.candidateName,
      partyLabel: candidacy.party?.name ?? candidacy.partyLabel,
      mandates: mandates.map((m) => ({
        // `title` carries the constituency, `role` only exists for offices within the
        // institution. Preferring title is what keeps "Députée de la 3e du Rhône"
        // rather than a bare null.
        role: m.role ?? m.title,
        institution: m.institution,
        startYear: m.startDate.getUTCFullYear(),
        endYear: m.endDate?.getUTCFullYear() ?? null,
      })),
      voteCount,
      measures: measures.flatMap((m) =>
        m.publishedRevision ? [{ theme: m.theme, text: m.publishedRevision.text }] : []
      ),
    };

    const response = await callAnthropic(
      [{ role: "user", content: buildCandidateSynthesisPrompt(input) }],
      {
        system: SYNTHESIS_SYSTEM_PROMPT,
        maxTokens: 900,
      }
    );
    const raw = response.content.find((c) => c.type === "text")?.text ?? "";
    const screened = screenSynthesis(raw);

    if (!screened.ok) {
      rejected++;
      console.log(`REFUSÉ ${candidacy.candidateName} : ${screened.reason} (${screened.detail})`);
      console.log(`   texte : ${raw.slice(0, 160)}\n`);
      continue;
    }

    console.log(
      `OK ${candidacy.candidateName} (${mandates.length} mandats, ${input.measures.length} mesures)`
    );
    console.log(`${screened.text}\n`);

    if (!apply) continue;

    // The synthesis belongs to the presidential extension, which may not exist yet for
    // a candidacy nobody has curated. Creating it here would publish nothing on its own
    // (it defaults to DRAFT), but it would still be a row this script has no mandate to
    // invent, so a missing extension is reported rather than filled in.
    if (!candidacy.presidentialData) {
      console.log(`   NON ÉCRIT : pas d'extension présidentielle pour cette candidature\n`);
      continue;
    }

    await db.candidacyPresidential.update({
      where: { id: candidacy.presidentialData.id },
      data: { synthesis: screened.text, synthesisGeneratedAt: new Date() },
    });
    written++;
  }

  console.log(
    apply
      ? `\n${written} synthèses écrites, ${rejected} refusées`
      : `\ndry run — ${rejected} refusées, passer --apply pour écrire`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
