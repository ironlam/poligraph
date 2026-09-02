import type { Prisma, ThemeCategory } from "@/generated/prisma";
import {
  callMistral,
  extractMistralText,
  parseMistralJSON,
  type MistralOptions,
} from "@/lib/api/mistral";
import { db } from "@/lib/db";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import {
  buildThemeSynthesisPrompt,
  buildThemeSynthesisGroundingPrompt,
  computeThemeCorpusFingerprint,
  screenThemeSynthesis,
  screenThemeSynthesisGrounding,
  THEME_SYNTHESIS_PROMPT_VERSION,
  themeSynthesisMaxAxes,
  type ThemeSynthesisClaim,
} from "@/lib/presidentielle/candidacy-theme-synthesis";
import { loadCandidacyThemeSynthesisCorpus } from "@/lib/presidentielle/candidacy-theme-synthesis-corpus";

const MODEL = "mistral-large-latest";

function buildSynthesisResponseFormat(
  theme: ThemeCategory,
  measureCount: number
): NonNullable<MistralOptions["responseFormat"]> {
  return {
    type: "json_schema",
    json_schema: {
      name: "candidacy_theme_synthesis_v3",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["theme", "claims"],
        properties: {
          theme: { type: "string", enum: [theme] },
          claims: {
            type: "array",
            minItems: 1,
            maxItems: themeSynthesisMaxAxes(measureCount),
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "measureRefs"],
              properties: {
                text: { type: "string", minLength: 10, maxLength: 800 },
                measureRefs: {
                  type: "array",
                  minItems: 1,
                  maxItems: 12,
                  items: { type: "string", pattern: "^M[1-9][0-9]*$" },
                },
              },
            },
          },
        },
      },
    },
  };
}

function buildGroundingResponseFormat(
  claimCount: number
): NonNullable<MistralOptions["responseFormat"]> {
  return {
    type: "json_schema",
    json_schema: {
      name: "candidacy_theme_synthesis_grounding_v3",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["claims", "quality"],
        properties: {
          claims: {
            type: "array",
            minItems: claimCount,
            maxItems: claimCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["index", "supported", "reason"],
              properties: {
                index: { type: "integer", minimum: 0 },
                supported: { type: "boolean" },
                reason: { type: "string", minLength: 1, maxLength: 300 },
              },
            },
          },
          quality: {
            type: "object",
            additionalProperties: false,
            required: ["isSynthesis", "representsMainAxes", "reason"],
            properties: {
              isSynthesis: { type: "boolean" },
              representsMainAxes: { type: "boolean" },
              reason: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
        },
      },
    },
  };
}

export type ThemeSynthesisActor = {
  id: string;
  ipAddress: string;
  userAgent: string;
};

export type ThemeSynthesisGenerationResult =
  | {
      ok: true;
      text: string;
      claims: ThemeSynthesisClaim[];
      corpusFingerprint: string;
      electionId: string;
      measureCount: number;
      model: string;
      persisted: boolean;
    }
  | {
      ok: false;
      reason:
        | "candidature_introuvable"
        | "candidature_non_declaree"
        | "extension_absente"
        | "theme_non_couvert"
        | "corpus_modifie"
        | "generation"
        | "refuse";
      message: string;
    };

export type GenerateThemeSynthesisOptions = {
  persist: boolean;
  actor: ThemeSynthesisActor;
};

export async function generateCandidacyThemeSynthesis(
  candidacyId: string,
  theme: ThemeCategory,
  options: GenerateThemeSynthesisOptions
): Promise<ThemeSynthesisGenerationResult> {
  const loaded = await db.$transaction((tx) =>
    // The project client is extended for public IDs. Its transaction delegate is runtime-compatible
    // with Prisma.TransactionClient, but Prisma 7 does not preserve that relation structurally.
    loadCandidacyThemeSynthesisCorpus(tx as unknown as Prisma.TransactionClient, candidacyId, theme)
  );
  if (!loaded.ok) {
    const failures: Record<
      typeof loaded.reason,
      Extract<ThemeSynthesisGenerationResult, { ok: false }>
    > = {
      CANDIDACY_NOT_FOUND: {
        ok: false,
        reason: "candidature_introuvable",
        message: "Candidature introuvable.",
      },
      CANDIDACY_NOT_DECLARED: {
        ok: false,
        reason: "candidature_non_declaree",
        message: "Seule une candidature annoncée ou retirée peut porter des synthèses thématiques.",
      },
      PRESIDENTIAL_EXTENSION_MISSING: {
        ok: false,
        reason: "extension_absente",
        message: "Les métadonnées présidentielles de la candidature sont absentes.",
      },
      THEME_NOT_COVERED: {
        ok: false,
        reason: "theme_non_couvert",
        message: "Aucune mesure publiée ne couvre ce thème.",
      },
    };
    return failures[loaded.reason];
  }
  const { corpus } = loaded;

  const prompt = buildThemeSynthesisPrompt(corpus.input);
  let validationDetail = "La réponse ne respecte pas le format attendu.";
  let accepted: { text: string; claims: ThemeSynthesisClaim[]; model: string } | undefined;
  let previousResponseText: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const messages = previousResponseText
      ? [
          { role: "user" as const, content: prompt },
          { role: "assistant" as const, content: previousResponseText.slice(0, 8_000) },
          {
            role: "user" as const,
            content: `Cette réponse a été refusée : ${validationDetail.replace(/[<>"\n\r]/g, " ").slice(0, 500)} Corrige ce brouillon sans transférer la cible, la condition ou la modalité d'une mesure vers une autre. Réponds à nouveau uniquement avec l'objet JSON complet.`,
          },
        ]
      : [{ role: "user" as const, content: prompt }];
    try {
      const response = await callMistral(messages, {
        model: MODEL,
        maxTokens: 900,
        temperature: 0,
        responseFormat: buildSynthesisResponseFormat(
          corpus.input.theme,
          corpus.input.measures.length
        ),
      });
      previousResponseText = extractMistralText(response);
      const parsed = parseMistralJSON<unknown>(previousResponseText);
      const screened = screenThemeSynthesis(parsed, corpus.input);
      if (screened.ok) {
        const verificationResponse = await callMistral(
          [
            {
              role: "user",
              content: buildThemeSynthesisGroundingPrompt(screened.claims, corpus.input),
            },
          ],
          {
            model: MODEL,
            maxTokens: 700,
            temperature: 0,
            responseFormat: buildGroundingResponseFormat(screened.claims.length),
          }
        );
        const verification = screenThemeSynthesisGrounding(
          parseMistralJSON<unknown>(extractMistralText(verificationResponse)),
          screened.claims.length
        );
        if (!verification.ok) {
          validationDetail = `Contrôle d'étayage refusé : ${verification.detail}`;
          continue;
        }
        accepted = {
          text: screened.text,
          claims: screened.claims,
          model: response.model?.trim() || MODEL,
        };
        break;
      }
      validationDetail = screened.detail;
    } catch (error) {
      if (error instanceof SyntaxError) {
        validationDetail = "La réponse JSON est invalide.";
        continue;
      }
      return {
        ok: false,
        reason: "generation",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!accepted) {
    return {
      ok: false,
      reason: "refuse",
      message: `La synthèse a été refusée après deux essais : ${validationDetail}`,
    };
  }

  const corpusFingerprint = computeThemeCorpusFingerprint({
    theme: corpus.input.theme,
    measures: corpus.input.measures,
  });
  const base = {
    ok: true as const,
    text: accepted.text,
    claims: accepted.claims,
    corpusFingerprint,
    electionId: corpus.electionId,
    measureCount: corpus.input.measures.length,
    model: accepted.model,
  };
  if (!options.persist) return { ...base, persisted: false };

  const generatedAt = new Date();
  const persisted = await db.$transaction(async (tx) => {
    // Serializes regeneration with the human publication gate. Without the shared lock, a new
    // draft could replace the text between a moderator's preview and the publication update.
    await lockMeasureCandidacy(tx, candidacyId);
    const current = await loadCandidacyThemeSynthesisCorpus(
      tx as unknown as Prisma.TransactionClient,
      candidacyId,
      theme
    );
    if (!current.ok) return false;
    const currentFingerprint = computeThemeCorpusFingerprint({
      theme: current.corpus.input.theme,
      measures: current.corpus.input.measures,
    });
    // Mistral runs outside the transaction. Refuse the write when the published corpus changed
    // in the meantime, so the admin never receives a newly created but already obsolete draft.
    if (currentFingerprint !== corpusFingerprint) return false;

    const synthesis = await tx.candidacyThemeSynthesis.upsert({
      where: {
        candidacyPresidentialId_theme: {
          candidacyPresidentialId: corpus.presidentialId,
          theme,
        },
      },
      create: {
        candidacyPresidentialId: corpus.presidentialId,
        theme,
        text: accepted.text,
        evidence: { claims: accepted.claims },
        corpusFingerprint,
        sourceMeasureCount: corpus.input.measures.length,
        model: accepted.model,
        promptVersion: THEME_SYNTHESIS_PROMPT_VERSION,
        status: "PENDING_REVIEW",
        generatedAt,
      },
      update: {
        text: accepted.text,
        evidence: { claims: accepted.claims },
        corpusFingerprint,
        sourceMeasureCount: corpus.input.measures.length,
        model: accepted.model,
        promptVersion: THEME_SYNTHESIS_PROMPT_VERSION,
        status: "PENDING_REVIEW",
        generatedAt,
        validatedAt: null,
        validatedBy: null,
        publishedAt: null,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        action: "GENERATE_THEME_SYNTHESIS",
        entityType: "CandidacyThemeSynthesis",
        entityId: synthesis.id,
        changes: {
          candidacyId,
          theme,
          corpusFingerprint,
          sourceMeasureCount: corpus.input.measures.length,
          model: accepted.model,
          promptVersion: THEME_SYNTHESIS_PROMPT_VERSION,
          claims: accepted.claims,
        },
        userId: options.actor.id,
        ipAddress: options.actor.ipAddress,
        userAgent: options.actor.userAgent,
      },
    });
    return true;
  });

  if (!persisted) {
    return {
      ok: false,
      reason: "corpus_modifie",
      message:
        "Les mesures publiées de ce thème ont changé pendant la génération. Relancez la synthèse.",
    };
  }

  return { ...base, persisted: true };
}
