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
import { callMistral, extractMistralText } from "@/lib/api/mistral";
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

/**
 * Anthropic first, Mistral if it fails, same broad fallback as `classify-theme`.
 *
 * Falling back on any error rather than on a quota signal is deliberate and copied
 * from there: telling a spent balance apart from a rate limit or a bad request is
 * brittle, and the output goes through `screenSynthesis` whatever produced it. The
 * failure this actually covers is the recurring one on this project, an Anthropic
 * balance at zero, which returns a plain 400.
 *
 * Both errors are carried into the throw. A run that dies with only the second one
 * would hide the reason the first provider was skipped.
 */
async function generate(system: string, user: string): Promise<{ text: string; provider: string }> {
  let anthropicError: string;
  try {
    const response = await callAnthropic([{ role: "user", content: user }], {
      system,
      maxTokens: 900,
    });
    return {
      text: response.content.find((c) => c.type === "text")?.text ?? "",
      provider: "anthropic",
    };
  } catch (error) {
    anthropicError = error instanceof Error ? error.message : String(error);
    console.warn(`[synthèses] anthropic indisponible (${anthropicError}), repli sur mistral`);
  }

  try {
    const response = await callMistral(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { maxTokens: 900 }
    );
    return { text: extractMistralText(response), provider: "mistral" };
  } catch (error) {
    const mistralError = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Génération impossible — anthropic : ${anthropicError} ; mistral : ${mistralError}`
    );
  }
}

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

    const hasMeasures = input.measures.length > 0;
    const prompt = buildCandidateSynthesisPrompt(input);

    let attempt = await generate(SYNTHESIS_SYSTEM_PROMPT, prompt);
    let screened = screenSynthesis(attempt.text, { hasMeasures });

    // One retry, naming the rule that was broken. Measured on a first full run: the
    // model obeys the rules it is reminded of and slips on the ones it is only told
    // once, the long dash above all. Retrying blind would just roll the dice again,
    // and retrying twice would paper over a prompt that genuinely needs fixing.
    if (!screened.ok) {
      console.log(
        `   reprise ${candidacy.candidateName} : ${screened.reason} (${screened.detail})`
      );
      attempt = await generate(
        SYNTHESIS_SYSTEM_PROMPT,
        `${prompt}\n\nTa réponse précédente a été refusée : ${screened.detail}. Recommence en respectant cette règle.`
      );
      screened = screenSynthesis(attempt.text, { hasMeasures });
    }

    if (!screened.ok) {
      rejected++;
      console.log(`REFUSÉ ${candidacy.candidateName} : ${screened.reason} (${screened.detail})`);
      console.log(`   texte : ${attempt.text.slice(0, 160)}\n`);
      continue;
    }
    const provider = attempt.provider;

    console.log(
      `OK ${candidacy.candidateName} (${mandates.length} mandats, ${input.measures.length} mesures, ${provider})`
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
