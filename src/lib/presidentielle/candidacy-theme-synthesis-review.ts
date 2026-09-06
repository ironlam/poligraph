import type { Prisma, ThemeCategory } from "@/generated/prisma";
import { db } from "@/lib/db";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import {
  computeThemeCorpusFingerprint,
  computeThemeSynthesisContentFingerprint,
  readThemeSynthesisClaims,
  screenThemeSynthesis,
  type ThemeSynthesisClaim,
} from "./candidacy-theme-synthesis";
import { loadCandidacyThemeSynthesisCorpus } from "./candidacy-theme-synthesis-corpus";

type ReviewActor = {
  id: string;
  ipAddress: string;
  userAgent: string;
};

export type PublishThemeSynthesisResult =
  | { ok: true; electionId: string }
  | {
      ok: false;
      reason: "NOT_FOUND" | "NOT_REVIEWABLE" | "OBSOLETE";
      message: string;
    };

export type SaveReviewedThemeSynthesisDraftResult =
  | { ok: true; electionId: string; synthesisId: string; contentFingerprint: string }
  | {
      ok: false;
      reason: "NOT_FOUND" | "NOT_REVIEWABLE" | "INVALID" | "OBSOLETE";
      message: string;
    };

/**
 * Stores an editorially corrected draft without publishing it.
 *
 * Generation cannot own this transition: provider text is only a proposal, while these claims
 * are the version a moderator actually checked against the cited measures. The candidacy lock and
 * corpus fingerprint prevent a review from being attached to measures that changed meanwhile.
 */
export async function saveReviewedCandidacyThemeSynthesisDraft(input: {
  candidacyId: string;
  theme: ThemeCategory;
  claims: ThemeSynthesisClaim[];
  expectedCorpusFingerprint: string;
  model: string;
  promptVersion: string;
  actor: ReviewActor;
}): Promise<SaveReviewedThemeSynthesisDraftResult> {
  if (!input.model.trim() || !input.promptVersion.trim()) {
    return { ok: false, reason: "INVALID", message: "La provenance du brouillon est absente." };
  }

  return db.$transaction(async (extendedTx) => {
    const tx = extendedTx as unknown as Prisma.TransactionClient;
    await lockMeasureCandidacy(extendedTx, input.candidacyId);
    const loaded = await loadCandidacyThemeSynthesisCorpus(tx, input.candidacyId, input.theme);
    if (!loaded.ok) {
      return {
        ok: false,
        reason: "NOT_FOUND",
        message: "Le corpus publié de cette candidature et de ce thème est introuvable.",
      };
    }

    const currentCorpusFingerprint = computeThemeCorpusFingerprint({
      theme: loaded.corpus.input.theme,
      measures: loaded.corpus.input.measures,
    });
    if (currentCorpusFingerprint !== input.expectedCorpusFingerprint) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message: "Les mesures publiées ont changé depuis la relecture.",
      };
    }

    const screened = screenThemeSynthesis(
      { theme: input.theme, claims: input.claims },
      loaded.corpus.input
    );
    if (!screened.ok) {
      return {
        ok: false,
        reason: "INVALID",
        message: `La synthèse relue est refusée : ${screened.detail}`,
      };
    }

    const previous = await tx.candidacyThemeSynthesis.findUnique({
      where: {
        candidacyPresidentialId_theme: {
          candidacyPresidentialId: loaded.corpus.presidentialId,
          theme: input.theme,
        },
      },
      select: { id: true, status: true, text: true, corpusFingerprint: true },
    });
    if (previous?.status === "PUBLISHED") {
      return {
        ok: false,
        reason: "NOT_REVIEWABLE",
        message: "Une synthèse publiée ne peut pas être remplacée par un brouillon.",
      };
    }
    const generatedAt = new Date();
    const synthesis = await tx.candidacyThemeSynthesis.upsert({
      where: {
        candidacyPresidentialId_theme: {
          candidacyPresidentialId: loaded.corpus.presidentialId,
          theme: input.theme,
        },
      },
      create: {
        candidacyPresidentialId: loaded.corpus.presidentialId,
        theme: input.theme,
        text: screened.text,
        evidence: { claims: screened.claims },
        corpusFingerprint: currentCorpusFingerprint,
        sourceMeasureCount: loaded.corpus.input.measures.length,
        model: input.model.trim(),
        promptVersion: input.promptVersion.trim(),
        status: "PENDING_REVIEW",
        generatedAt,
      },
      update: {
        text: screened.text,
        evidence: { claims: screened.claims },
        corpusFingerprint: currentCorpusFingerprint,
        sourceMeasureCount: loaded.corpus.input.measures.length,
        model: input.model.trim(),
        promptVersion: input.promptVersion.trim(),
        status: "PENDING_REVIEW",
        generatedAt,
        validatedAt: null,
        validatedBy: null,
        publishedAt: null,
      },
      select: { id: true },
    });
    const contentFingerprint = computeThemeSynthesisContentFingerprint({
      text: screened.text,
      claims: screened.claims,
      model: input.model.trim(),
      promptVersion: input.promptVersion.trim(),
    });
    await tx.auditLog.create({
      data: {
        action: "SAVE_REVIEWED_THEME_SYNTHESIS_DRAFT",
        entityType: "CandidacyThemeSynthesis",
        entityId: synthesis.id,
        changes: {
          candidacyId: input.candidacyId,
          theme: input.theme,
          text: screened.text,
          claims: screened.claims,
          corpusFingerprint: currentCorpusFingerprint,
          contentFingerprint,
          sourceMeasureCount: loaded.corpus.input.measures.length,
          model: input.model.trim(),
          promptVersion: input.promptVersion.trim(),
          reviewedManually: true,
          previousStatus: previous?.status ?? null,
          previousText: previous?.text ?? null,
          previousCorpusFingerprint: previous?.corpusFingerprint ?? null,
        },
        userId: input.actor.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
      },
    });

    return {
      ok: true,
      electionId: loaded.corpus.electionId,
      synthesisId: synthesis.id,
      contentFingerprint,
    };
  });
}

/**
 * Human publication gate for a generated thematic synthesis.
 *
 * The candidacy lock serializes this check with measure transitions. The stored fingerprint, the
 * fingerprint the moderator previewed and the current published corpus must all agree in the same
 * transaction. A newly published revision therefore makes the operation fail instead of exposing
 * stale prose.
 */
export async function publishCandidacyThemeSynthesis(input: {
  candidacyId: string;
  synthesisId: string;
  expectedCorpusFingerprint: string;
  expectedContentFingerprint: string;
  actor: ReviewActor;
}): Promise<PublishThemeSynthesisResult> {
  return db.$transaction(async (extendedTx) => {
    const tx = extendedTx as unknown as Prisma.TransactionClient;
    // Regeneration takes the same lock. Taking it before any synthesis read binds the publication
    // to the exact draft that exists after every earlier writer has completed.
    await lockMeasureCandidacy(extendedTx, input.candidacyId);
    const synthesis = await tx.candidacyThemeSynthesis.findUnique({
      where: { id: input.synthesisId },
      select: {
        id: true,
        theme: true,
        status: true,
        corpusFingerprint: true,
        text: true,
        evidence: true,
        model: true,
        promptVersion: true,
        candidacyPresidential: { select: { candidacyId: true } },
      },
    });
    if (!synthesis) {
      return { ok: false, reason: "NOT_FOUND", message: "Synthèse introuvable." };
    }
    const candidacyId = synthesis.candidacyPresidential.candidacyId;
    if (candidacyId !== input.candidacyId) {
      return { ok: false, reason: "NOT_FOUND", message: "Synthèse introuvable." };
    }
    if (synthesis.status !== "PENDING_REVIEW") {
      return {
        ok: false,
        reason: "NOT_REVIEWABLE",
        message: "Cette synthèse n'est pas en attente de relecture.",
      };
    }
    const contentFingerprint = computeThemeSynthesisContentFingerprint({
      text: synthesis.text,
      claims: readThemeSynthesisClaims(synthesis.evidence),
      model: synthesis.model,
      promptVersion: synthesis.promptVersion,
    });
    if (contentFingerprint !== input.expectedContentFingerprint) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message:
          "Le brouillon a été régénéré depuis sa prévisualisation. Relisez-le avant validation.",
      };
    }
    const loaded = await loadCandidacyThemeSynthesisCorpus(tx, candidacyId, synthesis.theme);
    if (!loaded.ok) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message: "Le corpus de ce thème n'est plus publiable. Régénérez la synthèse.",
      };
    }
    const currentFingerprint = computeThemeCorpusFingerprint({
      theme: loaded.corpus.input.theme,
      measures: loaded.corpus.input.measures,
    });
    if (
      currentFingerprint !== synthesis.corpusFingerprint ||
      currentFingerprint !== input.expectedCorpusFingerprint
    ) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message: "Les mesures publiées ont changé. Régénérez la synthèse avant validation.",
      };
    }

    const now = new Date();
    await tx.candidacyThemeSynthesis.update({
      where: { id: synthesis.id },
      data: {
        status: "PUBLISHED",
        validatedAt: now,
        validatedBy: input.actor.id,
        publishedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "PUBLISH_THEME_SYNTHESIS",
        entityType: "CandidacyThemeSynthesis",
        entityId: synthesis.id,
        changes: {
          candidacyId,
          theme: synthesis.theme,
          corpusFingerprint: currentFingerprint,
          contentFingerprint,
        },
        userId: input.actor.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
      },
    });
    return { ok: true, electionId: loaded.corpus.electionId };
  });
}
