/**
 * Generation of the synthesis shown on a presidential candidate's fiche.
 *
 * Extracted from `scripts/generate-candidate-syntheses.ts`, which was its only caller and is now a
 * loop over this module. The move is what lets the admin regenerate ONE candidacy from a button:
 * the rule about which candidacies may carry a synthesis, the provider fallback, the screening and
 * the retry are editorial decisions, and duplicating them behind a button would let the two paths
 * drift — a button that produced a text the script would have refused is worse than no button.
 *
 * The prompt and the screen stay in `@/lib/presidentielle/candidate-synthesis`, pure and testable
 * without a network. This module owns everything that touches the database or a provider.
 *
 * No `server-only`: the script imports it under tsx.
 */

import { callAnthropic } from "@/lib/api/anthropic";
import { callMistral, extractMistralText } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import {
  buildCandidateSynthesisPrompt,
  screenSynthesis,
  SYNTHESIS_SYSTEM_PROMPT,
  type CandidateSynthesisInput,
} from "@/lib/presidentielle/candidate-synthesis";

/** Mandates kept in the prompt, most recent first. Enough for a career, short of a list. */
const MANDATE_LIMIT = 8;

/**
 * Why a refusal is a RETURNED value and never a throw.
 *
 * Every one of these is a state the moderator can read and act on — publish the extension, source
 * the candidacy, wait for the status to be declared — so each has to reach the screen as itself.
 * A thrown error would arrive as "l'opération a échoué" and say none of it.
 *
 * `generation` and `refuse` are the two that are not the caller's fault: the providers are both
 * down, or the model produced a text the screen rejected twice. They are still returned rather
 * than thrown, because the moderator's next move (retry now, retry later) depends on which.
 */
export type SynthesisRefusal =
  | "candidature_introuvable"
  | "sans_politicien"
  | "non_declaree"
  | "sans_extension"
  | "refuse"
  | "generation";

export type SynthesisGenerationResult =
  | {
      ok: true;
      text: string;
      provider: string;
      /** What the prompt was built from, for the script's log and the action's message. */
      measureCount: number;
      mandateCount: number;
      /** False on a dry run: the text was produced and screened, nothing was written. */
      persisted: boolean;
    }
  | { ok: false; reason: SynthesisRefusal; message: string };

/**
 * Anthropic first, Mistral if it fails, same broad fallback as `classify-theme`.
 *
 * Falling back on any error rather than on a quota signal is deliberate and copied from there:
 * telling a spent balance apart from a rate limit or a bad request is brittle, and the output goes
 * through `screenSynthesis` whatever produced it. The failure this actually covers is the recurring
 * one on this project, an Anthropic balance at zero, which returns a plain 400.
 *
 * Both errors are carried into the throw. A run that dies with only the second one would hide the
 * reason the first provider was skipped.
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

/**
 * Everything the prompt is built from, in one read.
 *
 * The measure population is the one the script has always used: PUBLISHED and reviewed, withdrawals
 * excluded. Deliberately NOT the public population of `@/lib/data/measures`, which also requires the
 * candidacy's extension to be published: a moderator preparing a fiche generates its synthesis
 * BEFORE publishing the extension, and gating the prompt on the extension would hand the model an
 * empty programme and produce the exact sentence this whole lot exists to stop.
 */
async function loadInput(candidacyId: string) {
  const candidacy = await db.candidacy.findUnique({
    where: { id: candidacyId },
    select: {
      id: true,
      candidateName: true,
      partyLabel: true,
      politicianId: true,
      status: true,
      electionId: true,
      party: { select: { name: true } },
      presidentialData: { select: { id: true } },
    },
  });
  return candidacy;
}

export type GenerateCandidateSynthesisOptions = {
  /**
   * Write the result on the candidacy's presidential extension. False is the script's dry run: the
   * text is produced and screened so the operator can read what WOULD be stored.
   */
  persist: boolean;
};

/**
 * Produces the synthesis of one candidacy, and stores it when asked to.
 *
 * Only DECLARED candidacies are considered. A candidacy that is merely rumoured has not asked
 * anyone to read a summary of its programme, and saying so on its page would lend it a substance
 * its own status denies. The rule lives here rather than in the script's query so the button
 * cannot bypass it.
 */
export async function generateCandidateSynthesis(
  candidacyId: string,
  options: GenerateCandidateSynthesisOptions
): Promise<SynthesisGenerationResult> {
  const candidacy = await loadInput(candidacyId);
  if (!candidacy) {
    return { ok: false, reason: "candidature_introuvable", message: "Candidature introuvable." };
  }
  if (!candidacy.politicianId) {
    return {
      ok: false,
      reason: "sans_politicien",
      message: "Candidature sans politique rattaché : ni mandats ni votes à résumer.",
    };
  }
  if (candidacy.status !== "DECLARE") {
    return {
      ok: false,
      reason: "non_declaree",
      message:
        "Seule une candidature déclarée porte une synthèse. Une candidature pressentie n'a demandé " +
        "à personne de lire un résumé de son programme.",
    };
  }

  const politicianId = candidacy.politicianId;
  const [mandates, voteCount, measures] = await Promise.all([
    db.mandate.findMany({
      where: { politicianId },
      select: { role: true, title: true, institution: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
      take: MANDATE_LIMIT,
    }),
    db.vote.count({ where: { politicianId } }),
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
      // `title` carries the constituency, `role` only exists for offices within the institution.
      // Preferring title is what keeps "Députée de la 3e du Rhône" rather than a bare null.
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

  let attempt: { text: string; provider: string };
  try {
    attempt = await generate(SYNTHESIS_SYSTEM_PROMPT, prompt);
  } catch (error) {
    return {
      ok: false,
      reason: "generation",
      message: error instanceof Error ? error.message : String(error),
    };
  }
  let screened = screenSynthesis(attempt.text, { hasMeasures });

  // One retry, naming the rule that was broken. Measured on a first full run: the model obeys the
  // rules it is reminded of and slips on the ones it is only told once, the long dash above all.
  // Retrying blind would just roll the dice again, and retrying twice would paper over a prompt
  // that genuinely needs fixing.
  if (!screened.ok) {
    try {
      attempt = await generate(
        SYNTHESIS_SYSTEM_PROMPT,
        `${prompt}\n\nTa réponse précédente a été refusée : ${screened.detail}. Recommence en respectant cette règle.`
      );
    } catch (error) {
      return {
        ok: false,
        reason: "generation",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    screened = screenSynthesis(attempt.text, { hasMeasures });
  }

  if (!screened.ok) {
    return {
      ok: false,
      reason: "refuse",
      message: `Texte refusé par le contrôle : ${screened.reason} (${screened.detail}).`,
    };
  }

  const base = {
    ok: true as const,
    text: screened.text,
    provider: attempt.provider,
    measureCount: input.measures.length,
    mandateCount: mandates.length,
  };

  if (!options.persist) return { ...base, persisted: false };

  // The synthesis belongs to the presidential extension, which may not exist yet for a candidacy
  // nobody has curated. Creating it here would publish nothing on its own (it defaults to DRAFT),
  // but it would still be a row this module has no mandate to invent, so a missing extension is
  // reported rather than filled in — the moderator creates it by publishing the fiche.
  if (!candidacy.presidentialData) {
    return {
      ok: false,
      reason: "sans_extension",
      message:
        "Pas d'extension présidentielle pour cette candidature. Publier la fiche la crée, " +
        "et la synthèse pourra alors être écrite.",
    };
  }

  const generatedAt = new Date();
  await db.candidacyPresidential.update({
    where: { id: candidacy.presidentialData.id },
    data: { synthesis: screened.text, synthesisGeneratedAt: generatedAt },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "CandidacyPresidential",
      entityId: candidacy.presidentialData.id,
      changes: {
        synthesisGeneratedAt: generatedAt.toISOString(),
        provider: attempt.provider,
        measureCount: input.measures.length,
        mandateCount: mandates.length,
      },
    },
  });

  return { ...base, persisted: true };
}
