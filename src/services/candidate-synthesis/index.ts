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

import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import {
  buildCandidateSynthesisPrompt,
  buildCandidateSynthesisGroundingPrompt,
  buildCanonicalCareer,
  buildSynthesisSystemPrompt,
  screenCandidateSynthesis,
  screenCandidateSynthesisGrounding,
  synthesisMaterial,
  type CandidateProgrammeClaim,
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

async function generate(
  system: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 1_200
): Promise<{ text: string; provider: string }> {
  const response = await callMistral([{ role: "system", content: system }, ...messages], {
    model: "mistral-large-latest",
    maxTokens,
    temperature: 0,
    responseFormat: { type: "json_object" },
  });
  return { text: extractMistralText(response), provider: response.model?.trim() || "mistral" };
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

  // One reading of the material, handed to both halves. The prompt states the length the material
  // supports and the screen enforces that same number: a model told 90 and judged at 60 pads, a
  // model told 60 and judged at 90 fails for obeying.
  const material = synthesisMaterial(input);
  const system = buildSynthesisSystemPrompt(material);
  const prompt = buildCandidateSynthesisPrompt(input);

  let validationDetail = "la réponse ne respecte pas le format attendu";
  let previousResponseText: string | undefined;
  let expectedClaimCount: number | undefined;
  const preservedClaims = new Map<number, CandidateProgrammeClaim>();
  let lastGenerationError: string | undefined;
  let accepted:
    | { text: string; provider: string; programmeClaims: CandidateProgrammeClaim[] }
    | undefined;

  for (let attemptIndex = 0; attemptIndex < 3; attemptIndex += 1) {
    const messages = previousResponseText
      ? [
          { role: "user" as const, content: prompt },
          { role: "assistant" as const, content: previousResponseText.slice(0, 10_000) },
          {
            role: "user" as const,
            content: `Cette réponse a été refusée : ${validationDetail.replace(/[<>"\n\r]/g, " ").slice(0, 1_500)}. Corrige uniquement les affirmations signalées. Conserve exactement le même nombre d'affirmations, dans le même ordre. Pour chaque axe, garde seulement 2 à 4 références qui soutiennent réellement un élément concret du texte. Produis une synthèse en axes sans juxtaposer les mesures. Les codes M1, M2 et suivants doivent apparaître uniquement dans measureRefs. Réponds uniquement avec l'objet JSON complet.`,
          },
        ]
      : [{ role: "user" as const, content: prompt }];

    try {
      const attempt = await generate(system, messages);
      previousResponseText = attempt.text;
      const parsed = parseMistralJSON<unknown>(attempt.text);
      const candidateOutput =
        parsed && typeof parsed === "object"
          ? { ...parsed, career: buildCanonicalCareer(input) }
          : parsed;
      let screened = screenCandidateSynthesis(candidateOutput, input);
      if (!screened.ok) {
        validationDetail = screened.detail;
        continue;
      }

      const parsedOutput = candidateOutput as {
        career: string;
        programmeClaims: CandidateProgrammeClaim[];
      };
      if (
        expectedClaimCount !== undefined &&
        parsedOutput.programmeClaims.length !== expectedClaimCount
      ) {
        validationDetail = `le nombre d'affirmations doit rester égal à ${expectedClaimCount}`;
        continue;
      }
      if (preservedClaims.size > 0) {
        const restoredClaims = [...parsedOutput.programmeClaims];
        for (const [index, claim] of preservedClaims) restoredClaims[index] = claim;
        screened = screenCandidateSynthesis(
          { career: parsedOutput.career, programmeClaims: restoredClaims },
          input
        );
        if (!screened.ok) {
          validationDetail = screened.detail;
          continue;
        }
      }

      const claims = screened.programmeClaims ?? [];
      expectedClaimCount ??= claims.length;
      if (claims.length > 0) {
        const verification = await generate(
          "Tu contrôles strictement l'étayage d'une synthèse politique. N'utilise aucune connaissance extérieure.",
          [{ role: "user", content: buildCandidateSynthesisGroundingPrompt(claims, input) }],
          700
        );
        const grounding = screenCandidateSynthesisGrounding(
          parseMistralJSON<unknown>(verification.text),
          claims.length
        );
        if (!grounding.ok) {
          for (const index of grounding.supportedIndexes) {
            const claim = claims[index];
            if (claim) preservedClaims.set(index, claim);
          }
          validationDetail = `contrôle d'étayage refusé : ${grounding.detail}`;
          continue;
        }
      }
      accepted = { text: screened.text, provider: attempt.provider, programmeClaims: claims };
      break;
    } catch (error) {
      if (error instanceof SyntaxError) {
        validationDetail = "la réponse JSON est invalide";
        continue;
      }
      lastGenerationError = error instanceof Error ? error.message : String(error);
      validationDetail = `appel Mistral interrompu : ${lastGenerationError}`;
    }
  }

  if (!accepted) {
    if (lastGenerationError) {
      return {
        ok: false,
        reason: "generation",
        message: `Mistral reste indisponible après trois essais : ${lastGenerationError}`,
      };
    }
    return {
      ok: false,
      reason: "refuse",
      message: `La synthèse a été refusée après trois essais : ${validationDetail}.`,
    };
  }

  const base = {
    ok: true as const,
    text: accepted.text,
    provider: accepted.provider,
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
    data: { synthesis: accepted.text, synthesisGeneratedAt: generatedAt },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "CandidacyPresidential",
      entityId: candidacy.presidentialData.id,
      changes: {
        synthesisGeneratedAt: generatedAt.toISOString(),
        provider: accepted.provider,
        measureCount: input.measures.length,
        mandateCount: mandates.length,
        programmeClaimCount: accepted.programmeClaims.length,
      },
    },
  });

  return { ...base, persisted: true };
}
