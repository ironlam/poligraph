import type { Prisma, ThemeCategory } from "@/generated/prisma";
import { callMistral, extractMistralText, parseMistralJSON } from "@/lib/api/mistral";
import { db } from "@/lib/db";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import {
  buildThemeSynthesisPrompt,
  computeThemeCorpusFingerprint,
  screenThemeSynthesis,
  THEME_SYNTHESIS_PROMPT_VERSION,
  type ThemeSynthesisClaim,
} from "@/lib/presidentielle/candidacy-theme-synthesis";
import { loadCandidacyThemeSynthesisCorpus } from "@/lib/presidentielle/candidacy-theme-synthesis-corpus";

const MODEL = "mistral-large-latest";

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
        message: "Seule une candidature déclarée peut porter des synthèses thématiques.",
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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repair =
      attempt === 0
        ? ""
        : `\n\nLa réponse précédente a été refusée : ${validationDetail.replace(/[<>"\n\r]/g, " ").slice(0, 240)} Recommence en corrigeant uniquement ce problème.`;
    try {
      const response = await callMistral([{ role: "user", content: `${prompt}${repair}` }], {
        model: MODEL,
        maxTokens: 900,
        temperature: 0,
        responseFormat: { type: "json_object" },
      });
      const parsed = parseMistralJSON<unknown>(extractMistralText(response));
      const screened = screenThemeSynthesis(parsed, corpus.input);
      if (screened.ok) {
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

  const corpusFingerprint = computeThemeCorpusFingerprint(corpus.input);
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
  await db.$transaction(async (tx) => {
    // Serializes regeneration with the human publication gate. Without the shared lock, a new
    // draft could replace the text between a moderator's preview and the publication update.
    await lockMeasureCandidacy(tx, candidacyId);
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
  });

  return { ...base, persisted: true };
}
